import { useState } from 'react';
import { BillForm } from '../components/BillForm';
import { BillRow } from '../components/BillRow';
import { Empty, Fab, Progress } from '../components/ui';
import { useData } from '../context';
import { euros, formatDate, monthLabel } from '../format';
import type { Bill, Dashboard as DashboardData } from '../types';

export function Dashboard() {
  const { data, error } = useData<DashboardData>('/api/dashboard');
  const [editing, setEditing] = useState<Bill | null | undefined>(undefined);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Chargement…</p>;
  const { totals, budget } = data;
  const overdueTotal = data.overdue.reduce((s, b) => s + b.amount, 0);

  return (
    <>
      <p className="muted date-line">{formatDate(data.today)}</p>

      <div className="cards">
        <div className="card">
          <span className="card-label">Reste à payer · {monthLabel(data.month)}</span>
          <span className="card-value">{euros(totals.unpaid)}</span>
          <span className="muted small">{euros(totals.paid)} déjà payés sur {euros(totals.total)}</span>
        </div>
        <div className="card">
          <span className="card-label">{budget > 0 && totals.total > budget ? 'Budget du mois dépassé de' : 'Reste sur le budget du mois'}</span>
          <span className={`card-value${budget > 0 && totals.total > budget ? ' danger' : ''}`}>
            {budget > 0 ? euros(Math.abs(budget - totals.total)) : '—'}
          </span>
          {budget > 0
            ? <>
                <Progress value={totals.total} max={budget} />
                <span className="muted small">{euros(totals.total)} prévus sur {euros(budget)}</span>
              </>
            : <span className="muted small">Fixe des plafonds par catégorie dans Réglages.</span>}
        </div>
      </div>

      {data.overdue.length > 0 && (
        <section>
          <h2 className="section-title danger">En retard · {euros(overdueTotal)}</h2>
          <ul className="list">
            {data.overdue.map((b) => <BillRow key={b.id} bill={b} onOpen={setEditing} showRelative />)}
          </ul>
        </section>
      )}

      <section>
        <h2 className="section-title">À payer dans les 14 jours</h2>
        {data.upcoming.length
          ? <ul className="list">{data.upcoming.map((b) => <BillRow key={b.id} bill={b} onOpen={setEditing} showRelative />)}</ul>
          : <Empty>Rien à payer dans les deux semaines.</Empty>}
      </section>

      <Fab label="Nouvelle facture" onClick={() => setEditing(null)} />
      {editing !== undefined && <BillForm bill={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
