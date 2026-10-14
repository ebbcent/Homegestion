import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DB } from './db.js';

export const SESSION_COOKIE = 'hg_session';
const SESSION_DAYS = 90;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 60_000;

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest();
}

function passwordMatches(candidate: string, expected: string) {
  // Hashing both sides gives equal-length buffers for a constant-time comparison.
  return crypto.timingSafeEqual(sha256(candidate), sha256(expected));
}

export function registerAuth(app: FastifyInstance, db: DB, password: string, secureCookie: boolean) {
  const failures = new Map<string, { count: number; until: number }>();

  const findSession = db.prepare("SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')");
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();

  const isAuthenticated = (req: FastifyRequest) => {
    const token = req.cookies[SESSION_COOKIE];
    return !!token && !!findSession.get(sha256(token).toString('hex'));
  };

  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/api/') || url.startsWith('/api/auth/')) return;
    if (!isAuthenticated(req)) return reply.code(401).send({ error: 'Non connecté' });
  });

  app.get('/api/auth/status', async (req) => ({ authenticated: isAuthenticated(req) }));

  app.post<{ Body: { password: string } }>('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['password'],
        properties: { password: { type: 'string', maxLength: 500 } },
      },
    },
  }, async (req, reply) => {
    const entry = failures.get(req.ip);
    if (entry && entry.count >= MAX_FAILURES && entry.until > Date.now()) {
      return reply.code(429).send({ error: 'Trop de tentatives, réessaie dans une minute.' });
    }
    if (!password || !passwordMatches(req.body.password, password)) {
      const count = (entry && entry.until > Date.now() ? entry.count : 0) + 1;
      failures.set(req.ip, { count, until: Date.now() + LOCKOUT_MS });
      return reply.code(401).send({ error: 'Mot de passe incorrect' });
    }
    failures.delete(req.ip);
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare(`INSERT INTO sessions (token_hash, expires_at) VALUES (?, datetime('now', '+${SESSION_DAYS} days'))`)
      .run(sha256(token).toString('hex'));
    setCookie(reply, token, secureCookie);
    return { authenticated: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token).toString('hex'));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { authenticated: false };
  });
}

function setCookie(reply: FastifyReply, token: string, secure: boolean) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}
