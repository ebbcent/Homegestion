import { type DB, transaction } from './db.js';
import { type Frequency, endOfMonthAfter, occurrences, today } from './dates.js';

export interface RecurringRow {
  id: number;
  label: string;
  supplier: string;
  category_id: number | null;
  amount: number;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  active: number;
  notes: string;
}

/** How far ahead recurring expenses are materialised as bills (current month + next one). */
export const MONTHS_AHEAD = 1;

/**
 * Creates the bills of every active recurring expense up to the end of next month.
 * Idempotent: existing occurrences and occurrences the user deleted are left alone.
 */
export function generateRecurringBills(db: DB, now = today()): number {
  const until = endOfMonthAfter(now, MONTHS_AHEAD);
  const rows = db.prepare('SELECT * FROM recurring WHERE active = 1').all() as unknown as RecurringRow[];
  const insert = db.prepare(`
    INSERT INTO bills (label, supplier, category_id, amount, due_date, notes, recurring_id)
    SELECT ?, ?, ?, ?, ?, '', ?
    WHERE NOT EXISTS (SELECT 1 FROM recurring_skips WHERE recurring_id = ? AND due_date = ?)
    ON CONFLICT (recurring_id, due_date) DO NOTHING
  `);
  let created = 0;
  transaction(db, () => {
    for (const r of rows) {
      for (const date of occurrences(r.start_date, r.frequency, until, r.end_date)) {
        const res = insert.run(r.label, r.supplier, r.category_id, r.amount, date, r.id, r.id, date);
        created += Number(res.changes);
      }
    }
  });
  return created;
}

/** Propagates an edited recurring expense to its bills that are not paid yet and not in the past. */
export function syncUpcomingBills(db: DB, r: RecurringRow, now = today()) {
  db.prepare(`
    UPDATE bills SET label = ?, supplier = ?, category_id = ?, amount = ?
    WHERE recurring_id = ? AND paid_date IS NULL AND due_date >= ?
  `).run(r.label, r.supplier, r.category_id, r.amount, r.id, now);
  // Unpaid future occurrences that no longer match the schedule are removed, then regenerated.
  const until = endOfMonthAfter(now, MONTHS_AHEAD);
  const valid = new Set(r.active ? occurrences(r.start_date, r.frequency, until, r.end_date) : []);
  const future = db.prepare(`
    SELECT b.id, b.due_date FROM bills b
    WHERE b.recurring_id = ? AND b.paid_date IS NULL AND b.due_date >= ?
      AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.bill_id = b.id)
  `).all(r.id, now) as Array<{ id: number; due_date: string }>;
  const del = db.prepare('DELETE FROM bills WHERE id = ?');
  for (const b of future) if (!valid.has(b.due_date)) del.run(b.id);
}
