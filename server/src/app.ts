import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { registerAuth } from './auth.js';
import { type DB, transaction } from './db.js';
import { addDays, isIsoDate, isIsoMonth, monthBounds, addMonths, today } from './dates.js';
import { type RecurringRow, generateRecurringBills, syncUpcomingBills } from './recurring.js';

export interface AppOptions {
  db: DB;
  uploadsDir: string;
  password: string;
  secureCookie?: boolean;
  webDir?: string;
  maxUploadBytes?: number;
  logger?: boolean;
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

const nullableDate = { type: ['string', 'null'] };
const nullableId = { type: ['integer', 'null'], minimum: 1 };
const amount = { type: 'integer', minimum: -100_000_000_00, maximum: 100_000_000_00 };

const billBody = {
  type: 'object',
  required: ['label', 'amount', 'due_date'],
  additionalProperties: false,
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 200 },
    supplier: { type: 'string', maxLength: 200, default: '' },
    category_id: { ...nullableId, default: null },
    amount,
    due_date: { type: 'string' },
    paid_date: { ...nullableDate, default: null },
    notes: { type: 'string', maxLength: 5000, default: '' },
  },
} as const;

const recurringBody = {
  type: 'object',
  required: ['label', 'amount', 'frequency', 'start_date'],
  additionalProperties: false,
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 200 },
    supplier: { type: 'string', maxLength: 200, default: '' },
    category_id: { ...nullableId, default: null },
    amount,
    frequency: { type: 'string', enum: ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly'] },
    start_date: { type: 'string' },
    end_date: { ...nullableDate, default: null },
    active: { type: 'boolean', default: true },
    notes: { type: 'string', maxLength: 5000, default: '' },
  },
} as const;

const categoryBody = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', default: '#64748b' },
    monthly_budget: { type: 'integer', minimum: 0, maximum: 100_000_000_00, default: 0 },
  },
} as const;

interface BillInput {
  label: string;
  supplier: string;
  category_id: number | null;
  amount: number;
  due_date: string;
  paid_date: string | null;
  notes: string;
}

interface RecurringInput {
  label: string;
  supplier: string;
  category_id: number | null;
  amount: number;
  frequency: RecurringRow['frequency'];
  start_date: string;
  end_date: string | null;
  active: boolean;
  notes: string;
}

/** Guards against nullable fields left undefined by the schema defaults. */
function withNulls<T extends { category_id: number | null }>(body: T, ...dateFields: Array<keyof T>): T {
  const out = { ...body, category_id: body.category_id ?? null };
  for (const f of dateFields) (out as Record<keyof T, unknown>)[f] = body[f] ?? null;
  return out;
}

interface CategoryInput {
  name: string;
  color: string;
  monthly_budget: number;
}

function requireDate(value: string | null | undefined, field: string, optional = false) {
  if (value == null && optional) return;
  if (!isIsoDate(value)) throw new HttpError(400, `Date invalide : ${field}`);
}

const BILL_SELECT = `
  SELECT b.*, c.name AS category_name, c.color AS category_color,
    (SELECT COUNT(*) FROM attachments a WHERE a.bill_id = b.id) AS attachment_count
  FROM bills b LEFT JOIN categories c ON c.id = b.category_id
`;

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db, uploadsDir } = opts;
  fs.mkdirSync(uploadsDir, { recursive: true });

  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: opts.maxUploadBytes ?? 20 * 1024 * 1024, files: 1 } });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string; validation?: unknown }, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    if (err.validation) return reply.code(400).send({ error: `Données invalides : ${err.message}` });
    if (err.code === 'ERR_SQLITE_ERROR' && /constraint/i.test(err.message)) {
      const message = /UNIQUE/.test(err.message) ? 'Cet élément existe déjà.' : 'Référence invalide.';
      return reply.code(400).send({ error: message });
    }
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Erreur interne' });
  });

  registerAuth(app, db, opts.password, opts.secureCookie ?? false);

  // Recurring expenses are materialised lazily, at most once per day.
  let generatedOn = '';
  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/auth/')) return;
    const now = today();
    if (generatedOn !== now) {
      generateRecurringBills(db, now);
      generatedOn = now;
    }
  });
  const regenerate = () => {
    generateRecurringBills(db);
    generatedOn = today();
  };

  // ---------- Catégories ----------

  app.get('/api/categories', async () =>
    db.prepare('SELECT * FROM categories ORDER BY position, name').all());

  app.post<{ Body: CategoryInput }>('/api/categories', { schema: { body: categoryBody } }, async (req, reply) => {
    const { name, color, monthly_budget } = req.body;
    const position = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories').get() as { p: number }).p;
    const res = db.prepare('INSERT INTO categories (name, color, monthly_budget, position) VALUES (?, ?, ?, ?)')
      .run(name.trim(), color, monthly_budget, position);
    return reply.code(201).send(db.prepare('SELECT * FROM categories WHERE id = ?').get(res.lastInsertRowid));
  });

  app.put<{ Params: { id: number }; Body: CategoryInput }>('/api/categories/:id',
    { schema: { params: idParams, body: categoryBody } }, async (req) => {
      const { name, color, monthly_budget } = req.body;
      const res = db.prepare('UPDATE categories SET name = ?, color = ?, monthly_budget = ? WHERE id = ?')
        .run(name.trim(), color, monthly_budget, req.params.id);
      if (!res.changes) throw new HttpError(404, 'Catégorie introuvable');
      return db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    });

  app.delete<{ Params: { id: number } }>('/api/categories/:id', { schema: { params: idParams } }, async (req, reply) => {
    const res = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    if (!res.changes) throw new HttpError(404, 'Catégorie introuvable');
    return reply.code(204).send();
  });

  // ---------- Factures ----------

  app.get<{ Querystring: { month?: string; status?: string; category_id?: string; q?: string } }>(
    '/api/bills', async (req) => {
      const where: string[] = [];
      const params: Array<string | number> = [];
      const { month, status, category_id, q } = req.query;
      if (month) {
        if (!isIsoMonth(month)) throw new HttpError(400, 'Mois invalide');
        const { first, last } = monthBounds(month);
        where.push('b.due_date BETWEEN ? AND ?');
        params.push(first, last);
      }
      if (status === 'paid') where.push('b.paid_date IS NOT NULL');
      if (status === 'unpaid') where.push('b.paid_date IS NULL');
      if (category_id === 'none') where.push('b.category_id IS NULL');
      else if (category_id) {
        where.push('b.category_id = ?');
        params.push(Number(category_id));
      }
      if (q) {
        where.push("(b.label LIKE ? ESCAPE '\\' OR b.supplier LIKE ? ESCAPE '\\' OR b.notes LIKE ? ESCAPE '\\')");
        const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        params.push(like, like, like);
      }
      const sql = `${BILL_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY b.due_date DESC, b.id DESC LIMIT 1000`;
      return db.prepare(sql).all(...params);
    });

  const getBill = (id: number) => {
    const bill = db.prepare(`${BILL_SELECT} WHERE b.id = ?`).get(id);
    if (!bill) throw new HttpError(404, 'Facture introuvable');
    const attachments = db.prepare('SELECT id, filename, mime, size, created_at FROM attachments WHERE bill_id = ? ORDER BY id')
      .all(id);
    return { ...bill, attachments };
  };

  app.get<{ Params: { id: number } }>('/api/bills/:id', { schema: { params: idParams } }, async (req) =>
    getBill(req.params.id));

  app.post<{ Body: BillInput }>('/api/bills', { schema: { body: billBody } }, async (req, reply) => {
    const b = withNulls(req.body, 'paid_date');
    requireDate(b.due_date, 'échéance');
    requireDate(b.paid_date, 'date de paiement', true);
    const res = db.prepare(`
      INSERT INTO bills (label, supplier, category_id, amount, due_date, paid_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(b.label.trim(), b.supplier.trim(), b.category_id, b.amount, b.due_date, b.paid_date, b.notes);
    return reply.code(201).send(getBill(Number(res.lastInsertRowid)));
  });

  app.put<{ Params: { id: number }; Body: BillInput }>('/api/bills/:id',
    { schema: { params: idParams, body: billBody } }, async (req) => {
      const b = withNulls(req.body, 'paid_date');
      requireDate(b.due_date, 'échéance');
      requireDate(b.paid_date, 'date de paiement', true);
      const current = db.prepare('SELECT recurring_id, due_date FROM bills WHERE id = ?').get(req.params.id) as
        { recurring_id: number | null; due_date: string } | undefined;
      if (!current) throw new HttpError(404, 'Facture introuvable');
      transaction(db, () => {
        // Moving a generated occurrence to another date must not make the original date reappear.
        if (current.recurring_id && current.due_date !== b.due_date) {
          db.prepare('INSERT OR IGNORE INTO recurring_skips (recurring_id, due_date) VALUES (?, ?)')
            .run(current.recurring_id, current.due_date);
        }
        db.prepare(`
          UPDATE bills SET label = ?, supplier = ?, category_id = ?, amount = ?, due_date = ?, paid_date = ?, notes = ?
          WHERE id = ?
        `).run(b.label.trim(), b.supplier.trim(), b.category_id, b.amount, b.due_date, b.paid_date, b.notes, req.params.id);
      });
      return getBill(req.params.id);
    });

  app.patch<{ Params: { id: number }; Body: { paid_date: string | null } }>('/api/bills/:id/paid', {
    schema: {
      params: idParams,
      body: { type: 'object', required: ['paid_date'], properties: { paid_date: nullableDate } },
    },
  }, async (req) => {
    requireDate(req.body.paid_date, 'date de paiement', true);
    const res = db.prepare('UPDATE bills SET paid_date = ? WHERE id = ?').run(req.body.paid_date ?? null, req.params.id);
    if (!res.changes) throw new HttpError(404, 'Facture introuvable');
    return getBill(req.params.id);
  });

  const removeFiles = (names: string[]) => {
    for (const name of names) fs.rm(path.join(uploadsDir, name), { force: true }, () => {});
  };

  app.delete<{ Params: { id: number } }>('/api/bills/:id', { schema: { params: idParams } }, async (req, reply) => {
    const bill = db.prepare('SELECT recurring_id, due_date FROM bills WHERE id = ?').get(req.params.id) as
      { recurring_id: number | null; due_date: string } | undefined;
    if (!bill) throw new HttpError(404, 'Facture introuvable');
    const files = (db.prepare('SELECT stored_name FROM attachments WHERE bill_id = ?').all(req.params.id) as
      Array<{ stored_name: string }>).map((f) => f.stored_name);
    transaction(db, () => {
      if (bill.recurring_id) {
        db.prepare('INSERT OR IGNORE INTO recurring_skips (recurring_id, due_date) VALUES (?, ?)')
          .run(bill.recurring_id, bill.due_date);
      }
      db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);
    });
    removeFiles(files);
    return reply.code(204).send();
  });

  // ---------- Justificatifs ----------

  app.post<{ Params: { id: number } }>('/api/bills/:id/attachments', { schema: { params: idParams } }, async (req, reply) => {
    if (!db.prepare('SELECT 1 FROM bills WHERE id = ?').get(req.params.id)) throw new HttpError(404, 'Facture introuvable');
    const file = await req.file();
    if (!file) throw new HttpError(400, 'Aucun fichier reçu');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      file.file.resume();
      throw new HttpError(415, 'Formats acceptés : PDF, JPEG, PNG, WebP, HEIC');
    }
    const storedName = crypto.randomUUID();
    const target = path.join(uploadsDir, storedName);
    await pipeline(file.file, fs.createWriteStream(target));
    if (file.file.truncated) {
      fs.rmSync(target, { force: true });
      throw new HttpError(413, 'Fichier trop volumineux (20 Mo maximum)');
    }
    const size = fs.statSync(target).size;
    const filename = path.basename(file.filename || 'justificatif').slice(0, 200);
    const res = db.prepare('INSERT INTO attachments (bill_id, filename, mime, size, stored_name) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.id, filename, file.mimetype, size, storedName);
    return reply.code(201).send(
      db.prepare('SELECT id, filename, mime, size, created_at FROM attachments WHERE id = ?').get(res.lastInsertRowid));
  });

  app.get<{ Params: { id: number }; Querystring: { download?: string } }>('/api/attachments/:id',
    { schema: { params: idParams } }, async (req, reply) => {
      const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id) as
        { filename: string; mime: string; size: number; stored_name: string } | undefined;
      if (!a) throw new HttpError(404, 'Justificatif introuvable');
      const disposition = req.query.download ? 'attachment' : 'inline';
      reply.header('Content-Type', a.mime);
      reply.header('Content-Length', a.size);
      reply.header('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(fs.createReadStream(path.join(uploadsDir, a.stored_name)));
    });

  app.delete<{ Params: { id: number } }>('/api/attachments/:id', { schema: { params: idParams } }, async (req, reply) => {
    const a = db.prepare('SELECT stored_name FROM attachments WHERE id = ?').get(req.params.id) as
      { stored_name: string } | undefined;
    if (!a) throw new HttpError(404, 'Justificatif introuvable');
    db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
    removeFiles([a.stored_name]);
    return reply.code(204).send();
  });

  // ---------- Dépenses récurrentes ----------

  const RECURRING_SELECT = `
    SELECT r.*, c.name AS category_name, c.color AS category_color,
      (SELECT MIN(due_date) FROM bills b WHERE b.recurring_id = r.id AND b.paid_date IS NULL) AS next_due
    FROM recurring r LEFT JOIN categories c ON c.id = r.category_id
  `;

  app.get('/api/recurring', async () =>
    db.prepare(`${RECURRING_SELECT} ORDER BY r.active DESC, r.label`).all());

  const validateRecurring = (r: RecurringInput) => {
    requireDate(r.start_date, 'début');
    requireDate(r.end_date, 'fin', true);
    if (r.end_date && r.end_date < r.start_date) throw new HttpError(400, 'La fin précède le début');
  };

  app.post<{ Body: RecurringInput }>('/api/recurring', { schema: { body: recurringBody } }, async (req, reply) => {
    const r = withNulls(req.body, 'end_date');
    validateRecurring(r);
    const res = db.prepare(`
      INSERT INTO recurring (label, supplier, category_id, amount, frequency, start_date, end_date, active, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(r.label.trim(), r.supplier.trim(), r.category_id, r.amount, r.frequency, r.start_date, r.end_date,
      r.active ? 1 : 0, r.notes);
    regenerate();
    return reply.code(201).send(db.prepare(`${RECURRING_SELECT} WHERE r.id = ?`).get(res.lastInsertRowid));
  });

  app.put<{ Params: { id: number }; Body: RecurringInput }>('/api/recurring/:id',
    { schema: { params: idParams, body: recurringBody } }, async (req) => {
      const r = withNulls(req.body, 'end_date');
      validateRecurring(r);
      transaction(db, () => {
        const res = db.prepare(`
          UPDATE recurring SET label = ?, supplier = ?, category_id = ?, amount = ?, frequency = ?,
            start_date = ?, end_date = ?, active = ?, notes = ?
          WHERE id = ?
        `).run(r.label.trim(), r.supplier.trim(), r.category_id, r.amount, r.frequency, r.start_date, r.end_date,
          r.active ? 1 : 0, r.notes, req.params.id);
        if (!res.changes) throw new HttpError(404, 'Dépense récurrente introuvable');
        syncUpcomingBills(db, db.prepare('SELECT * FROM recurring WHERE id = ?').get(req.params.id) as unknown as RecurringRow);
      });
      regenerate();
      return db.prepare(`${RECURRING_SELECT} WHERE r.id = ?`).get(req.params.id);
    });

  app.delete<{ Params: { id: number } }>('/api/recurring/:id', { schema: { params: idParams } }, async (req, reply) => {
    transaction(db, () => {
      // Past and paid bills stay in the history; pending future occurrences go away with the template.
      db.prepare(`
        DELETE FROM bills WHERE recurring_id = ? AND paid_date IS NULL AND due_date >= ?
          AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.bill_id = bills.id)
      `).run(req.params.id, today());
      const res = db.prepare('DELETE FROM recurring WHERE id = ?').run(req.params.id);
      if (!res.changes) throw new HttpError(404, 'Dépense récurrente introuvable');
    });
    return reply.code(204).send();
  });

  // ---------- Budget et tableau de bord ----------

  const monthTotals = (month: string) => {
    const { first, last } = monthBounds(month);
    return db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total,
        COALESCE(SUM(CASE WHEN paid_date IS NOT NULL THEN amount END), 0) AS paid,
        COALESCE(SUM(CASE WHEN paid_date IS NULL THEN amount END), 0) AS unpaid,
        COUNT(*) AS count
      FROM bills WHERE due_date BETWEEN ? AND ?
    `).get(first, last) as { total: number; paid: number; unpaid: number; count: number };
  };

  app.get<{ Querystring: { month?: string } }>('/api/budget', async (req) => {
    const month = req.query.month ?? today().slice(0, 7);
    if (!isIsoMonth(month)) throw new HttpError(400, 'Mois invalide');
    const { first, last } = monthBounds(month);
    const categories = db.prepare(`
      SELECT c.id, c.name, c.color, c.monthly_budget,
        COALESCE(SUM(b.amount), 0) AS spent,
        COALESCE(SUM(CASE WHEN b.paid_date IS NOT NULL THEN b.amount END), 0) AS paid,
        COUNT(b.id) AS count
      FROM categories c
      LEFT JOIN bills b ON b.category_id = c.id AND b.due_date BETWEEN ? AND ?
      GROUP BY c.id ORDER BY c.position, c.name
    `).all(first, last);
    const uncategorized = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS spent,
        COALESCE(SUM(CASE WHEN paid_date IS NOT NULL THEN amount END), 0) AS paid, COUNT(*) AS count
      FROM bills WHERE category_id IS NULL AND due_date BETWEEN ? AND ?
    `).get(first, last);
    const budget = (db.prepare('SELECT COALESCE(SUM(monthly_budget), 0) AS b FROM categories').get() as { b: number }).b;
    const history = [];
    for (let i = 11; i >= 0; i--) {
      const m = addMonths(`${month}-01`, -i).slice(0, 7);
      history.push({ month: m, ...monthTotals(m) });
    }
    return { month, budget, totals: monthTotals(month), categories, uncategorized, history };
  });

  app.get('/api/dashboard', async () => {
    const now = today();
    const month = now.slice(0, 7);
    const overdue = db.prepare(`${BILL_SELECT} WHERE b.paid_date IS NULL AND b.due_date < ? ORDER BY b.due_date`).all(now);
    const upcoming = db.prepare(`${BILL_SELECT} WHERE b.paid_date IS NULL AND b.due_date BETWEEN ? AND ? ORDER BY b.due_date`)
      .all(now, addDays(now, 14));
    const budget = (db.prepare('SELECT COALESCE(SUM(monthly_budget), 0) AS b FROM categories').get() as { b: number }).b;
    return { today: now, month, budget, totals: monthTotals(month), overdue, upcoming };
  });

  // ---------- Sauvegarde ----------

  app.get('/api/export', async (_req, reply) => {
    const dump = {
      exported_at: new Date().toISOString(),
      categories: db.prepare('SELECT * FROM categories').all(),
      recurring: db.prepare('SELECT * FROM recurring').all(),
      recurring_skips: db.prepare('SELECT * FROM recurring_skips').all(),
      bills: db.prepare('SELECT * FROM bills').all(),
      attachments: db.prepare('SELECT id, bill_id, filename, mime, size, stored_name, created_at FROM attachments').all(),
    };
    reply.header('Content-Disposition', `attachment; filename="homegestion-${today()}.json"`);
    return dump;
  });

  // ---------- Application web ----------

  if (opts.webDir && fs.existsSync(opts.webDir)) {
    await app.register(fastifyStatic, { root: opts.webDir });
    app.setNotFoundHandler((req, reply) => {
      // Unknown page routes get the app shell; missing files (with an extension) stay 404.
      const pathname = req.url.split('?')[0];
      if (req.method !== 'GET' || pathname.startsWith('/api/') || path.extname(pathname)) {
        return reply.code(404).send({ error: 'Introuvable' });
      }
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    });
  }

  return app;
}
