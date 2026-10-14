import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { addMonths, today } from './dates.js';

let app: FastifyInstance;
let cookie = '';
let dir: string;

async function api(method: string, url: string, payload?: unknown) {
  const res = await app.inject({ method: method as 'GET', url, payload: payload as object, headers: { cookie } });
  return { status: res.statusCode, body: res.body ? res.json() : null, raw: res };
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homegestion-test-'));
  app = await buildApp({ db: openDb(path.join(dir, 'test.db')), uploadsDir: path.join(dir, 'uploads'), password: 'secret' });
});

after(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('authentification', () => {
  test('refuse les appels sans session', async () => {
    assert.equal((await api('GET', '/api/bills')).status, 401);
  });

  test('refuse un mauvais mot de passe', async () => {
    assert.equal((await api('POST', '/api/auth/login', { password: 'nope' })).status, 401);
  });

  test('ouvre une session avec le bon mot de passe', async () => {
    const res = await api('POST', '/api/auth/login', { password: 'secret' });
    assert.equal(res.status, 200);
    const setCookie = res.raw.headers['set-cookie'];
    cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
    assert.equal((await api('GET', '/api/auth/status')).body.authenticated, true);
  });
});

describe('factures', () => {
  test('crée, liste, marque payée et supprime une facture', async () => {
    const categories = (await api('GET', '/api/categories')).body;
    assert.ok(categories.length > 0);
    const created = await api('POST', '/api/bills', {
      label: 'Électricité', supplier: 'EDF', category_id: categories[1].id, amount: 8450, due_date: '2026-03-12',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.category_name, categories[1].name);

    const listed = await api('GET', '/api/bills?month=2026-03&status=unpaid');
    assert.equal(listed.body.length, 1);

    const paid = await api('PATCH', `/api/bills/${created.body.id}/paid`, { paid_date: '2026-03-10' });
    assert.equal(paid.body.paid_date, '2026-03-10');

    const budget = await api('GET', '/api/budget?month=2026-03');
    const cat = budget.body.categories.find((c: { id: number }) => c.id === categories[1].id);
    assert.equal(cat.spent, 8450);
    assert.equal(budget.body.totals.paid, 8450);

    assert.equal((await api('DELETE', `/api/bills/${created.body.id}`)).status, 204);
    assert.equal((await api('GET', `/api/bills/${created.body.id}`)).status, 404);
  });

  test('rejette une date impossible', async () => {
    const res = await api('POST', '/api/bills', { label: 'X', amount: 100, due_date: '2026-02-30' });
    assert.equal(res.status, 400);
  });

  test('recherche avec caractères spéciaux', async () => {
    await api('POST', '/api/bills', { label: 'Taxe 100% foncière', amount: 120000, due_date: '2026-10-15' });
    assert.equal((await api('GET', '/api/bills?q=100%25')).body.length, 1);
    assert.equal((await api('GET', '/api/bills?q=_')).body.length, 0);
  });
});

describe('dépenses récurrentes', () => {
  test('génère les échéances jusqu’au mois prochain sans doublon', async () => {
    const start = addMonths(today(), -2);
    const created = await api('POST', '/api/recurring', {
      label: 'Box internet', amount: 3999, frequency: 'monthly', start_date: start,
    });
    assert.equal(created.status, 201);
    const bills = () => api('GET', '/api/bills').then((r) =>
      r.body.filter((b: { recurring_id: number }) => b.recurring_id === created.body.id));
    const first = await bills();
    assert.equal(first.length, 4); // il y a 2 mois, le mois dernier, ce mois-ci, le mois prochain

    // Une échéance supprimée n'est pas recréée.
    const oldest = first.at(-1);
    await api('DELETE', `/api/bills/${oldest.id}`);
    await api('PUT', `/api/recurring/${created.body.id}`, {
      label: 'Box internet', amount: 4499, frequency: 'monthly', start_date: start,
    });
    const second = await bills();
    assert.equal(second.length, 3);
    // Le nouveau montant ne s'applique qu'aux échéances à venir non payées.
    const future = second.filter((b: { due_date: string }) => b.due_date >= today());
    assert.ok(future.every((b: { amount: number }) => b.amount === 4499));
    assert.ok(second.filter((b: { due_date: string }) => b.due_date < today()).every((b: { amount: number }) => b.amount === 3999));
  });

  test('la suppression garde l’historique passé', async () => {
    const created = await api('POST', '/api/recurring', {
      label: 'Assurance habitation', amount: 2500, frequency: 'monthly', start_date: addMonths(today(), -1),
    });
    await api('DELETE', `/api/recurring/${created.body.id}`);
    const left = (await api('GET', '/api/bills')).body.filter((b: { label: string }) => b.label === 'Assurance habitation');
    assert.ok(left.length >= 1);
    assert.ok(left.every((b: { due_date: string; recurring_id: number | null }) => b.due_date < today() && b.recurring_id === null));
  });
});

describe('justificatifs', () => {
  test('téléverse, relit et supprime un PDF', async () => {
    const bill = (await api('POST', '/api/bills', { label: 'Eau', amount: 3200, due_date: '2026-05-01' })).body;
    const boundary = '----hgtest';
    const content = '%PDF-1.4 test';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="facture eau.pdf"',
      'Content-Type: application/pdf',
      '',
      content,
      `--${boundary}--`,
      '',
    ].join('\r\n');
    const up = await app.inject({
      method: 'POST', url: `/api/bills/${bill.id}/attachments`, payload,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
    });
    assert.equal(up.statusCode, 201);
    const att = up.json();
    const file = await app.inject({ method: 'GET', url: `/api/attachments/${att.id}`, headers: { cookie } });
    assert.equal(file.body, content);
    assert.equal(file.headers['content-type'], 'application/pdf');
    assert.equal((await api('GET', `/api/bills/${bill.id}`)).body.attachments.length, 1);
    assert.equal((await api('DELETE', `/api/attachments/${att.id}`)).status, 204);
  });

  test('refuse un type de fichier non autorisé', async () => {
    const bill = (await api('POST', '/api/bills', { label: 'Gaz', amount: 1000, due_date: '2026-05-01' })).body;
    const boundary = '----hgtest';
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.html"\r\nContent-Type: text/html\r\n\r\n<script></script>\r\n--${boundary}--\r\n`;
    const up = await app.inject({
      method: 'POST', url: `/api/bills/${bill.id}/attachments`, payload,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
    });
    assert.equal(up.statusCode, 415);
  });
});

describe('application web', () => {
  test('sert les fichiers, renvoie l’app pour les pages et 404 pour un fichier absent', async () => {
    const webDir = path.join(dir, 'web');
    fs.mkdirSync(path.join(webDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(webDir, 'index.html'), '<html>app</html>');
    const web = await buildApp({ db: openDb(':memory:'), uploadsDir: path.join(dir, 'up2'), password: 'x', webDir });
    // A file created after startup (new build) is served.
    fs.writeFileSync(path.join(webDir, 'assets', 'app-123.js'), 'console.log(1)');
    const js = await web.inject({ url: '/assets/app-123.js' });
    assert.equal(js.statusCode, 200);
    assert.match(String(js.headers['content-type']), /javascript/);
    assert.equal((await web.inject({ url: '/budget' })).body, '<html>app</html>');
    assert.equal((await web.inject({ url: '/assets/missing.js' })).statusCode, 404);
    await web.close();
  });
});
