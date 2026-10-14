import { useState } from 'react';
import { Dot, MonthPicker, Progress } from '../components/ui';
import { useData } from '../context';
import { euros, eurosRound, monthLabel, monthShort, todayIso } from '../format';
import type { Budget as BudgetData } from '../types';

export function Budget() {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const { data, error } = useData<BudgetData>(`/api/budget?month=${month}`);

  return (
    <>
      <MonthPicker month={month} onChange={setMonth} />
      {error && <p className="error">{error}</p>}
      {data && <BudgetView data={data} />}
    </>
  );
}

function BudgetView({ data }: { data: BudgetData }) {
  const { totals, budget } = data;
  const rows = data.categories.filter((c) => c.monthly_budget > 0 || c.count > 0);

  return (
    <>
      <div className="card">
        <span className="card-label">Dépenses de {monthLabel(data.month)}</span>
        <span className="card-value">{euros(totals.total)}</span>
        {budget > 0 && (
          <>
            <Progress value={totals.total} max={budget} />
            <span className={`small ${totals.total > budget ? 'danger' : 'muted'}`}>
              {totals.total > budget
                ? `Dépassement de ${euros(totals.total - budget)} sur un budget de ${euros(budget)}`
                : `${euros(budget - totals.total)} disponibles sur ${euros(budget)}`}
            </span>
          </>
        )}
        <span className="muted small">Payé {euros(totals.paid)} · à payer {euros(totals.unpaid)}</span>
      </div>

      <h2 className="section-title">Par catégorie</h2>
      {rows.length || data.uncategorized.count ? (
        <ul className="list">
          {rows.map((c) => (
            <li key={c.id} className="budget-row">
              <div className="budget-line">
                <span><Dot color={c.color} />{c.name}</span>
                <span className={c.monthly_budget > 0 && c.spent > c.monthly_budget ? 'danger' : ''}>
                  {euros(c.spent)}{c.monthly_budget > 0 && <span className="muted"> / {eurosRound(c.monthly_budget)}</span>}
                </span>
              </div>
              {c.monthly_budget > 0 && <Progress value={c.spent} max={c.monthly_budget} color={c.color} />}
            </li>
          ))}
          {data.uncategorized.count > 0 && (
            <li className="budget-row">
              <div className="budget-line">
                <span><Dot color={null} />Sans catégorie</span>
                <span>{euros(data.uncategorized.spent)}</span>
              </div>
            </li>
          )}
        </ul>
      ) : <p className="empty">Aucune dépense ce mois-ci.</p>}

      <h2 className="section-title">12 derniers mois</h2>
      <HistoryChart history={data.history} budget={budget} />
    </>
  );
}

function HistoryChart({ history, budget }: { history: BudgetData['history']; budget: number }) {
  const max = Math.max(budget, ...history.map((h) => h.total), 1);
  const W = 360, H = 160, pad = 18, bw = (W - 8) / history.length;
  const y = (v: number) => H - pad - (v / max) * (H - pad - 8);
  return (
    <figure className="card chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dépenses des douze derniers mois">
        {history.map((h, i) => (
          <g key={h.month}>
            <title>{`${monthLabel(h.month)} : ${euros(h.total)}`}</title>
            <rect
              x={4 + i * bw + bw * 0.18}
              y={y(h.total)}
              width={bw * 0.64}
              height={Math.max(H - pad - y(h.total), h.total > 0 ? 1 : 0)}
              rx={3}
              className={budget > 0 && h.total > budget ? 'bar over' : 'bar'}
            />
            <text x={4 + i * bw + bw / 2} y={H - 4} textAnchor="middle" className="axis">{monthShort(h.month).replace('.', '')}</text>
          </g>
        ))}
        {budget > 0 && <line x1={4} x2={W - 4} y1={y(budget)} y2={y(budget)} className="budget-line-svg" />}
      </svg>
      {budget > 0 && <figcaption className="muted small">Ligne pointillée : budget mensuel ({euros(budget)})</figcaption>}
    </figure>
  );
}
