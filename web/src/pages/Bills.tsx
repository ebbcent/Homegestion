import { useMemo, useState } from 'react';
import { BillForm } from '../components/BillForm';
import { BillRow } from '../components/BillRow';
import { Empty, Fab, MonthPicker } from '../components/ui';
import { useApp, useData } from '../context';
import { euros, todayIso } from '../format';
import type { Bill } from '../types';

type Status = 'all' | 'unpaid' | 'paid';

export function Bills() {
  const { categories } = useApp();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [status, setStatus] = useState<Status>('all');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Bill | null | undefined>(undefined);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    // A search looks through every month.
    if (query.trim()) p.set('q', query.trim());
    else p.set('month', month);
    if (status !== 'all') p.set('status', status);
    if (category) p.set('category_id', category);
    return `/api/bills?${p}`;
  }, [month, status, category, query]);
  const { data, error } = useData<Bill[]>(url);
  const total = data?.reduce((s, b) => s + b.amount, 0) ?? 0;

  return (
    <>
      {!query.trim() && <MonthPicker month={month} onChange={setMonth} />}
      <div className="filters">
        <input type="search" placeholder="Rechercher (tous les mois)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="segmented" role="group" aria-label="Statut">
          {([['all', 'Toutes'], ['unpaid', 'À payer'], ['paid', 'Payées']] as const).map(([v, l]) => (
            <button key={v} type="button" className={status === v ? 'on' : ''} aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Catégorie">
          <option value="">Toutes les catégories</option>
          <option value="none">Sans catégorie</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {data && (data.length
        ? <>
            <p className="muted small list-total">{data.length} facture{data.length > 1 ? 's' : ''} · {euros(total)}</p>
            <ul className="list">{data.map((b) => <BillRow key={b.id} bill={b} onOpen={setEditing} />)}</ul>
          </>
        : <Empty>Aucune facture.</Empty>)}

      <Fab label="Nouvelle facture" onClick={() => setEditing(null)} />
      {editing !== undefined && <BillForm bill={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
