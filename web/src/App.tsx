import { useEffect, useState } from 'react';
import { api, get, setUnauthorizedHandler } from './api';
import { AppProvider } from './context';
import { Bills } from './pages/Bills';
import { Budget } from './pages/Budget';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Recurring } from './pages/Recurring';
import { Settings } from './pages/Settings';

const ICONS = {
  accueil: <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5" />,
  factures: <path d="M6 3h9l4 4v14H6zM14.5 3v4.5H19M9 12h7M9 16h7" />,
  budget: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5V12l6 6" /></>,
  recurrentes: <path d="M19.5 9A8 8 0 0 0 5 7.5M4.5 15A8 8 0 0 0 19 16.5M5 3.5v4h4M19 20.5v-4h-4" />,
  reglages: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
};

const TABS = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'factures', label: 'Factures' },
  { id: 'budget', label: 'Budget' },
  { id: 'recurrentes', label: 'Récurrentes' },
  { id: 'reglages', label: 'Réglages' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const tabFromHash = (): Tab => {
  const id = location.hash.slice(1);
  return TABS.some((t) => t.id === id) ? (id as Tab) : 'accueil';
};

export function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth(false));
    get<{ authenticated: boolean }>('/api/auth/status').then((s) => setAuth(s.authenticated)).catch(() => setAuth(false));
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (auth === null) return null;
  if (!auth) return <Login onLogin={() => setAuth(true)} />;

  const logout = async () => {
    await api('POST', '/api/auth/logout').catch(() => {});
    setAuth(false);
  };
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <AppProvider>
      <div className="layout">
        <nav className="tabs" aria-label="Navigation principale">
          <div className="brand">Homegestion</div>
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={t.id === tab ? 'on' : ''} aria-current={t.id === tab ? 'page' : undefined}>
              <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[t.id]}</svg>
              <span className="tab-label">{t.label}</span>
            </a>
          ))}
        </nav>
        <main className="content">
          <h1 className="page-title">{current.id === 'recurrentes' ? 'Dépenses récurrentes' : current.label}</h1>
          {tab === 'accueil' && <Dashboard />}
          {tab === 'factures' && <Bills />}
          {tab === 'budget' && <Budget />}
          {tab === 'recurrentes' && <Recurring />}
          {tab === 'reglages' && <Settings onLogout={logout} />}
        </main>
      </div>
    </AppProvider>
  );
}
