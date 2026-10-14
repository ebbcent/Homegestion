import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { get } from './api';
import type { Category } from './types';

interface AppState {
  categories: Category[];
  /** Incremented after every change so that pages reload their data. */
  version: number;
  changed: () => void;
  notify: (message: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    get<Category[]>('/api/categories').then(setCategories).catch(() => {});
  }, [version]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const changed = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <Ctx.Provider value={{ categories, version, changed, notify: setToast }}>
      {children}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp hors de AppProvider');
  return ctx;
}

/** Fetches a URL and refetches it whenever the data changes anywhere in the app. */
export function useData<T>(url: string | null) {
  const { version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    get<T>(url)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [url, version]);

  return { data, error };
}
