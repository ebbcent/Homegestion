import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db.js';

if (!config.password) {
  console.error('APP_PASSWORD doit être défini (voir README).');
  process.exit(1);
}

fs.mkdirSync(config.dataDir, { recursive: true });
const db = openDb(config.dbPath);
const app = await buildApp({
  db,
  uploadsDir: config.uploadsDir,
  password: config.password,
  secureCookie: config.production,
  webDir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
  maxUploadBytes: config.maxUploadBytes,
  logger: true,
});

await app.listen({ port: config.port, host: config.host });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
