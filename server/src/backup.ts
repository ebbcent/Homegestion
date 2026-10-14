// Consistent snapshot of the database (safe while the app is running).
// Usage: node server/dist/backup.js  → DATA_DIR/backups/homegestion-YYYY-MM-DD.db
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { today } from './dates.js';

const dir = path.join(config.dataDir, 'backups');
fs.mkdirSync(dir, { recursive: true });
const target = path.join(dir, `homegestion-${today()}.db`);
fs.rmSync(target, { force: true });
const db = new DatabaseSync(config.dbPath, { readOnly: true });
db.prepare('VACUUM INTO ?').run(target);
db.close();
console.log(`Sauvegarde : ${target}`);
