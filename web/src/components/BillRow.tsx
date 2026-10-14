import { api } from '../api';
import { useApp } from '../context';
import { euros, relativeDue, shortDate, todayIso } from '../format';
import type { Bill } from '../types';
import { Dot } from './ui';

export function BillRow({ bill, onOpen, showRelative }: { bill: Bill; onOpen: (b: Bill) => void; showRelative?: boolean }) {
  const { changed, notify } = useApp();
  const paid = !!bill.paid_date;
  const overdue = !paid && bill.due_date < todayIso();

  const togglePaid = async () => {
    try {
      await api('PATCH', `/api/bills/${bill.id}/paid`, { paid_date: paid ? null : todayIso() });
      notify(paid ? 'Marquée à payer' : 'Marquée payée');
      changed();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <li className={`row${paid ? ' paid' : ''}`}>
      <button
        type="button"
        className={`check${paid ? ' on' : ''}`}
        onClick={togglePaid}
        aria-label={paid ? `Marquer « ${bill.label} » à payer` : `Marquer « ${bill.label} » payée`}
        aria-pressed={paid}
      >
        {paid ? '✓' : ''}
      </button>
      <button type="button" className="row-main" onClick={() => onOpen(bill)}>
        <span className="row-title">
          <Dot color={bill.category_color} />
          {bill.label}
          {bill.attachment_count > 0 && <span className="clip" aria-label="justificatif joint">📎</span>}
          {bill.recurring_id && <span className="clip" aria-label="récurrente">↻</span>}
        </span>
        <span className={`row-sub${overdue ? ' danger' : ''}`}>
          {bill.supplier && <>{bill.supplier} · </>}
          {paid ? `payée le ${shortDate(bill.paid_date!)}` : showRelative ? relativeDue(bill.due_date) : `échéance ${shortDate(bill.due_date)}`}
        </span>
      </button>
      <span className="row-amount">{euros(bill.amount)}</span>
    </li>
  );
}
