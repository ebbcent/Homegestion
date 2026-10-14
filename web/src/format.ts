import type { Frequency } from './types';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eurRound = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Amounts are stored in cents. */
export const euros = (cents: number) => eur.format(cents / 100);
export const eurosRound = (cents: number) => eurRound.format(cents / 100);

/** "84,50", "84.5", "1 234,5 €" → 8450 / 123450. Returns null when unreadable. */
export function parseEuros(input: string): number | null {
  const cleaned = input.replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

function parseIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d ?? 1);
}

export const formatDate = (iso: string) =>
  parseIso(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export const shortDate = (iso: string) =>
  parseIso(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export const monthLabel = (month: string) =>
  parseIso(`${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

export const monthShort = (month: string) =>
  parseIso(`${month}-01`).toLocaleDateString('fr-FR', { month: 'short' });

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Days from today to an ISO date (negative when past). */
export function daysUntil(iso: string) {
  return Math.round((parseIso(iso).getTime() - parseIso(todayIso()).getTime()) / 86_400_000);
}

export function relativeDue(iso: string) {
  const d = daysUntil(iso);
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'demain';
  if (d === -1) return 'hier';
  if (d < 0) return `il y a ${-d} jours`;
  if (d < 7) return `dans ${d} jours`;
  return shortDate(iso);
}

export const FREQUENCIES: Array<{ value: Frequency; label: string; months: number }> = [
  { value: 'monthly', label: 'Mensuelle', months: 1 },
  { value: 'bimonthly', label: 'Bimestrielle', months: 2 },
  { value: 'quarterly', label: 'Trimestrielle', months: 3 },
  { value: 'semiannual', label: 'Semestrielle', months: 6 },
  { value: 'yearly', label: 'Annuelle', months: 12 },
];

export const frequencyLabel = (f: Frequency) => FREQUENCIES.find((x) => x.value === f)?.label ?? f;
export const frequencyMonths = (f: Frequency) => FREQUENCIES.find((x) => x.value === f)?.months ?? 1;

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}
