import { useState } from 'react';
import { api } from '../api';
import { useApp } from '../context';
import { centsToInput, parseEuros } from '../format';
import type { Category } from '../types';

export function Settings({ onLogout }: { onLogout: () => void }) {
  const { categories } = useApp();
  return (
    <>
      <h2 className="section-title">Catégories et budget mensuel</h2>
      <ul className="list">
        {categories.map((c) => <CategoryRow key={c.id} category={c} />)}
        <CategoryRow />
      </ul>

      <h2 className="section-title">Sauvegarde</h2>
      <div className="group">
        <a className="plain-row" href="/api/export" download>Exporter toutes les données (JSON)</a>
      </div>
      <p className="muted small">
        L'export contient les factures, catégories et récurrences, sans les fichiers joints. La sauvegarde complète
        se fait sur le serveur (voir README).
      </p>

      <h2 className="section-title">Installer sur l'iPhone</h2>
      <p className="muted small">
        Ouvre cette page dans Safari, touche le bouton Partager puis « Sur l'écran d'accueil ».
        Sur Mac, dans Safari : menu Fichier › « Ajouter au Dock ».
      </p>

      <button type="button" className="destructive" onClick={onLogout}>Se déconnecter</button>
    </>
  );
}

function CategoryRow({ category }: { category?: Category }) {
  const { changed, notify } = useApp();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? '#64748b');
  const [budget, setBudget] = useState(category ? centsToInput(category.monthly_budget) : '');

  const dirty = !category
    ? name.trim() !== ''
    : name !== category.name || color !== category.color || parseEuros(budget || '0') !== category.monthly_budget;

  const save = async () => {
    const cents = parseEuros(budget || '0');
    if (!name.trim() || cents === null || cents < 0) return notify('Nom ou montant invalide');
    try {
      const body = { name: name.trim(), color, monthly_budget: cents };
      if (category) await api('PUT', `/api/categories/${category.id}`, body);
      else {
        await api('POST', '/api/categories', body);
        setName('');
        setBudget('');
      }
      notify('Catégorie enregistrée');
      changed();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const remove = async () => {
    if (!category || !confirm(`Supprimer « ${category.name} » ? Ses factures passeront « Sans catégorie ».`)) return;
    await api('DELETE', `/api/categories/${category.id}`);
    changed();
  };

  return (
    <li className="category-row">
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Couleur" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle catégorie" aria-label="Nom" />
      <input
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        inputMode="decimal"
        placeholder="Budget €"
        aria-label="Budget mensuel en euros"
        className="budget-input"
      />
      {dirty
        ? <button type="button" className="link strong" onClick={save}>{category ? 'OK' : 'Ajouter'}</button>
        : category && <button type="button" className="link danger" onClick={remove} aria-label={`Supprimer ${category.name}`}>✕</button>}
    </li>
  );
}
