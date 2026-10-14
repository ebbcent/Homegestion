import { useEffect, useState, type FormEvent } from 'react';
import { api, get } from '../api';
import { useApp } from '../context';
import { centsToInput, fileSize, parseEuros, todayIso } from '../format';
import type { Attachment, Bill } from '../types';
import { Field, Sheet } from './ui';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

export function BillForm({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const { categories, changed, notify } = useApp();
  const [label, setLabel] = useState(bill?.label ?? '');
  const [supplier, setSupplier] = useState(bill?.supplier ?? '');
  const [amount, setAmount] = useState(bill ? centsToInput(bill.amount) : '');
  const [categoryId, setCategoryId] = useState<string>(bill?.category_id ? String(bill.category_id) : '');
  const [dueDate, setDueDate] = useState(bill?.due_date ?? todayIso());
  const [paid, setPaid] = useState(!!bill?.paid_date);
  const [paidDate, setPaidDate] = useState(bill?.paid_date ?? todayIso());
  const [notes, setNotes] = useState(bill?.notes ?? '');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bill) get<Bill>(`/api/bills/${bill.id}`).then((b) => setAttachments(b.attachments ?? [])).catch(() => {});
  }, [bill]);

  const upload = async (billId: number, file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return api<Attachment>('POST', `/api/bills/${billId}/attachments`, form);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    if (!bill) {
      setPending((p) => [...p, ...list]);
      return;
    }
    setBusy(true);
    try {
      for (const f of list) {
        const a = await upload(bill.id, f);
        setAttachments((prev) => [...prev, a]);
      }
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeAttachment = async (a: Attachment) => {
    if (!confirm(`Supprimer « ${a.filename} » ?`)) return;
    await api('DELETE', `/api/attachments/${a.id}`);
    setAttachments((prev) => prev.filter((x) => x.id !== a.id));
    changed();
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const cents = parseEuros(amount);
    if (!label.trim()) return setError('Indique un libellé.');
    if (cents === null) return setError('Montant illisible (exemple : 84,50).');
    setBusy(true);
    setError(null);
    const body = {
      label: label.trim(),
      supplier: supplier.trim(),
      amount: cents,
      category_id: categoryId ? Number(categoryId) : null,
      due_date: dueDate,
      paid_date: paid ? paidDate : null,
      notes,
    };
    try {
      const saved = bill
        ? await api<Bill>('PUT', `/api/bills/${bill.id}`, body)
        : await api<Bill>('POST', '/api/bills', body);
      for (const f of pending) await upload(saved.id, f);
      notify(bill ? 'Facture modifiée' : 'Facture ajoutée');
      changed();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!bill || !confirm(`Supprimer la facture « ${bill.label} » et ses justificatifs ?`)) return;
    await api('DELETE', `/api/bills/${bill.id}`);
    notify('Facture supprimée');
    changed();
    onClose();
  };

  return (
    <Sheet
      title={bill ? 'Facture' : 'Nouvelle facture'}
      onClose={onClose}
      actions={<button type="button" className="link strong" disabled={busy} onClick={() => submit()}>OK</button>}
    >
      <form onSubmit={submit} className="form">
        {error && <p className="error">{error}</p>}
        <div className="group">
          <Field label="Libellé">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Électricité" required autoFocus={!bill} />
          </Field>
          <Field label="Fournisseur">
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="EDF" />
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
          <Field label="Échéance">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </Field>
        </div>

        <div className="group">
          <label className="field switch-field">
            <span className="field-label">Payée</span>
            <input type="checkbox" className="switch" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          </label>
          {paid && (
            <Field label="Payée le">
              <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} required />
            </Field>
          )}
        </div>

        <div className="group">
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Référence client, n° de facture…" />
          </Field>
        </div>

        <h3 className="group-title">Justificatifs</h3>
        <div className="group">
          {attachments.map((a) => (
            <div key={a.id} className="attachment">
              {a.mime.startsWith('image/') && a.mime !== 'image/heic' && a.mime !== 'image/heif'
                ? <img src={`/api/attachments/${a.id}`} alt="" loading="lazy" />
                : <span className="file-icon" aria-hidden="true">PDF</span>}
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener">{a.filename}</a>
              <span className="muted">{fileSize(a.size)}</span>
              <button type="button" className="link danger" onClick={() => removeAttachment(a)} aria-label={`Supprimer ${a.filename}`}>✕</button>
            </div>
          ))}
          {pending.map((f, i) => (
            <div key={i} className="attachment">
              <span className="file-icon" aria-hidden="true">⏳</span>
              <span>{f.name}</span>
              <span className="muted">{fileSize(f.size)}</span>
              <button type="button" className="link danger" onClick={() => setPending((p) => p.filter((_, j) => j !== i))} aria-label={`Retirer ${f.name}`}>✕</button>
            </div>
          ))}
          <label className="upload">
            <input type="file" accept={ACCEPT} multiple onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
            {busy ? 'Envoi…' : '＋ Ajouter un PDF ou une photo'}
          </label>
        </div>

        <button type="submit" className="primary" disabled={busy}>{bill ? 'Enregistrer' : 'Ajouter la facture'}</button>
        {bill && <button type="button" className="destructive" onClick={remove}>Supprimer la facture</button>}
      </form>
    </Sheet>
  );
}
