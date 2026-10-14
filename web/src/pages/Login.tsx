import { useState, type FormEvent } from 'react';
import { api } from '../api';

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/auth/login', { password });
      onLogin();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <img src="/icon-192.png" alt="" width={72} height={72} />
      <h1>Homegestion</h1>
      <form onSubmit={submit} className="form">
        {error && <p className="error">{error}</p>}
        <div className="group">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Mot de passe"
            aria-label="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>
        <button type="submit" className="primary" disabled={busy}>Se connecter</button>
      </form>
    </main>
  );
}
