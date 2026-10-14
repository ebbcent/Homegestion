// Dates are handled as ISO strings (YYYY-MM-DD) in local calendar terms, never as timestamps,
// so that an invoice due "le 5" stays on the 5th whatever the server time zone.

export type Frequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly';

export const FREQUENCY_MONTHS: Record<Frequency, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return d <= daysInMonth(y, m);
}

export function isIsoMonth(s: unknown): s is string {
  return typeof s === 'string' && ISO_MONTH.test(s);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function today(now = new Date()): string {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Adds months to a date, clamping the day (31 janvier + 1 mois = 28/29 février). */
export function addMonths(iso: string, months: number, anchorDay?: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return toIso(year, month, Math.min(anchorDay ?? d, daysInMonth(year, month)));
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number);
  return { first: toIso(y, m, 1), last: toIso(y, m, daysInMonth(y, m)) };
}

export function endOfMonthAfter(iso: string, monthsAhead: number): string {
  const shifted = addMonths(iso, monthsAhead, 1);
  return monthBounds(shifted.slice(0, 7)).last;
}

/** All occurrences of a recurring expense between its start and `until` (inclusive). */
export function occurrences(start: string, frequency: Frequency, until: string, end?: string | null): string[] {
  const step = FREQUENCY_MONTHS[frequency];
  const anchorDay = Number(start.slice(8, 10));
  const limit = end && end < until ? end : until;
  const result: string[] = [];
  for (let k = 0; ; k++) {
    const date = addMonths(start, k * step, anchorDay);
    if (date > limit) break;
    result.push(date);
  }
  return result;
}
