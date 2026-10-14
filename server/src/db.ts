import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

const DEFAULT_CATEGORIES: Array<[string, string]> = [
  ['Logement (crédit, loyer)', '#4f46e5'],
  ['Énergie', '#f59e0b'],
  ['Eau', '#0ea5e9'],
  ['Assurances', '#10b981'],
  ['Internet & téléphone', '#8b5cf6'],
  ['Impôts & taxes', '#ef4444'],
  ['Entretien & travaux', '#a16207'],
  ['Abonnements', '#ec4899'],
  ['Courses', '#22c55e'],
  ['Divers', '#64748b'],
];

const MIGRATIONS: string[] = [
  `
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#64748b',
    monthly_budget INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE recurring (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    supplier TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly')),
    start_date TEXT NOT NULL,
    end_date TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE bills (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    supplier TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    paid_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    recurring_id INTEGER REFERENCES recurring(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (recurring_id, due_date)
  );
  CREATE INDEX bills_due_date ON bills(due_date);

  -- Occurrences of a recurring expense that the user deleted: never regenerate them.
  CREATE TABLE recurring_skips (
    recurring_id INTEGER NOT NULL REFERENCES recurring(id) ON DELETE CASCADE,
    due_date TEXT NOT NULL,
    PRIMARY KEY (recurring_id, due_date)
  );

  CREATE TABLE attachments (
    id INTEGER PRIMARY KEY,
    bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
  );
  `,
];

export function openDb(file: string): DB {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      if (v === 0) seedCategories(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

function seedCategories(db: DB) {
  const insert = db.prepare('INSERT INTO categories (name, color, position) VALUES (?, ?, ?)');
  DEFAULT_CATEGORIES.forEach(([name, color], i) => insert.run(name, color, i));
}

export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
