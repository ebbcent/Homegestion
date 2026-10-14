import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useApp } from '../context';
import { FREQUENCIES, centsToInput, parseEuros, todayIso } from '../format';
import type { Frequency, Recurring } from '../types';
import { Field, Sheet } from './ui';

export function RecurringForm({ item, onClose }: { item: Recurring | null; onClose: () => void }) {
  const { categories, changed, notify } = useApp();
  const [label, setLabel] = useState(item?.label ?? '');
  const [supplier, setSupplier] = useState(item?.supplier ?? '');
  const [amount, setAmount] = useState(item ? centsToInput(item.amount) : '');
  const [categoryId, setCategoryId] = useState(item?.category_id ? String(item.category_id) : '');
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(item?.start_date ?? todayIso());
  const [endDate, setEndDate] = useState(item?.end_date ?? '');
  const [active, setActive] = useState(item ? !!item.active : true);
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const cents = parseEuros(amount);
    if (!label.trim()) return setError('Indique un libellé.');
    if (cents === null) return setError('Montant illisible (exemple : 39,99).');
    setBusy(true);
    setError(null);
    const body = {
      label: label.trim(),
      supplier: supplier.trim(),
      amount: cents,
      category_id: categoryId ? Number(categoryId) : null,
      frequency,
      start_date: startDate,
      end_date: endDate || null,
      active,
      notes,
    };
    try {
      if (item) await api('PUT', `/api/recurring/${item.id}`, body);
      else await api('POST', '/api/recurring', body);
      notify(item ? 'Dépense récurrente modifiée' : 'Dépense récurrente ajoutée');
      changed();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item || !confirm(`Supprimer « ${item.label} » ? Les factures passées et payées sont conservées.`)) return;
    await api('DELETE', `/api/recurring/${item.id}`);
    notify('Dépense récurrente supprimée');
    changed();
    onClose();
  };

  return (
    <Sheet
      title={item ? 'Dépense récurrente' : 'Nouvelle récurrence'}
      onClose={onClose}
      actions={<button type="button" className="link strong" disabled={busy} onClick={() => submit()}>OK</button>}
    >
      <form onSubmit={submit} className="form">
        {error && <p className="error">{error}</p>}
        <div className="group">
          <Field label="Libellé">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Box internet" required autoFocus={!item} />
          </Field>
          <Field label="Fournisseur">
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Free" />
          </Field>
          <Field label="Montant (€)">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" required />
          </Field>
          <Field label="Catégorie">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sans catégorie</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="group">
          <Field label="Fréquence">
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Première échéance" hint="Les suivantes tombent le même jour du mois.">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label="Fin (facultatif)">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <label className="field switch-field">
            <span className="field-label">Active</span>
            <input type="checkbox" className="switch" checked={active} onChange={(e) => setActive(e.target.checked)} />
          </label>
        </div>
        <div className="group">
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Prélèvement automatique, contrat n°…" />
          </Field>
        </div>
        <p className="muted small">
          Les échéances sont créées automatiquement jusqu'à la fin du mois prochain. Une modification du montant
          s'applique aux échéances à venir non payées.
        </p>
        <button type="submit" className="primary" disabled={busy}>{item ? 'Enregistrer' : 'Ajouter'}</button>
        {item && <button type="button" className="destructive" onClick={remove}>Supprimer</button>}
      </form>
    </Sheet>
  );
}
