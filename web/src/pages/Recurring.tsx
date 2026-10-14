import { useState } from 'react';
import { RecurringForm } from '../components/RecurringForm';
import { Dot, Empty, Fab } from '../components/ui';
import { useData } from '../context';
import { euros, frequencyLabel, frequencyMonths, shortDate } from '../format';
import type { Recurring as RecurringItem } from '../types';

export function Recurring() {
  const { data, error } = useData<RecurringItem[]>('/api/recurring');
  const [editing, setEditing] = useState<RecurringItem | null | undefined>(undefined);
  const monthly = (data ?? [])
    .filter((r) => r.active)
    .reduce((s, r) => s + r.amount / frequencyMonths(r.frequency), 0);

  return (
    <>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="card">
            <span className="card-label">Charges fixes, ramenées au mois</span>
            <span className="card-value">{euros(Math.round(monthly))}</span>
            <span className="muted small">soit {euros(Math.round(monthly * 12))} par an</span>
          </div>
          {data.length ? (
            <ul className="list">
              {data.map((r) => (
                <li key={r.id} className={`row${r.active ? '' : ' paid'}`}>
                  <button type="button" className="row-main" onClick={() => setEditing(r)}>
                    <span className="row-title"><Dot color={r.category_color} />{r.label}</span>
                    <span className="row-sub">
                      {frequencyLabel(r.frequency)}
                      {r.supplier && <> · {r.supplier}</>}
                      {r.active ? (r.next_due ? <> · prochaine le {shortDate(r.next_due)}</> : null) : <> · en pause</>}
                    </span>
                  </button>
                  <span className="row-amount">{euros(r.amount)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Ajoute tes abonnements et prélèvements : crédit, assurance, box, électricité…</Empty>}
        </>
      )}
      <Fab label="Nouvelle dépense récurrente" onClick={() => setEditing(null)} />
      {editing !== undefined && <RecurringForm item={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
