import { useEffect, useRef, type ReactNode } from 'react';
import { monthLabel, shiftMonth } from '../format';

export function Sheet({ title, onClose, children, actions }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="sheet-header">
          <button type="button" className="link" onClick={onClose}>Annuler</button>
          <h2>{title}</h2>
          <div className="sheet-actions">{actions}</div>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="month-picker">
      <button type="button" aria-label="Mois précédent" onClick={() => onChange(shiftMonth(month, -1))}>‹</button>
      <span>{monthLabel(month)}</span>
      <button type="button" aria-label="Mois suivant" onClick={() => onChange(shiftMonth(month, 1))}>›</button>
    </div>
  );
}

export function Progress({ value, max, color }: { value: number; max: number; color?: string }) {
  const ratio = max > 0 ? value / max : value > 0 ? 1 : 0;
  const over = max > 0 && value > max;
  return (
    <div className="progress" aria-hidden="true">
      <div
        className={over ? 'progress-bar over' : 'progress-bar'}
        style={{ width: `${Math.min(ratio, 1) * 100}%`, background: over ? undefined : color }}
      />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Fab({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="fab" onClick={onClick} aria-label={label}>
      <span aria-hidden="true">+</span>
    </button>
  );
}

export function Dot({ color }: { color: string | null }) {
  return <span className="dot" style={{ background: color ?? 'var(--muted)' }} aria-hidden="true" />;
}
