import { useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import { InstallCard } from './InstallCard';

/** Atalhos de preenchimento só no ambiente de desenvolvimento (usuários criados pelo seed da API). */
const DEMO = ['atendente', 'expedicao', 'motorista', 'gestao'] as const;

export function Login() {
  const { login, problem, clearProblem } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    clearProblem();
    setBusy(true);
    const err = await login(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="login">
      <section className="login-card">
        <div className="brand"><strong>RotaCerta</strong><small>Gestão de entregas</small></div>
        <h1>Entrar</h1>
        <p className="muted">Use o e-mail e a senha fornecidos pela loja.</p>
        <form onSubmit={submit}>
          <label>E-mail
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>Senha
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {(error || problem) && <p className="error" role="alert">{error || problem}</p>}
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
        {import.meta.env.DEV && (
          <div className="chips" style={{ marginTop: 12 }}>
            {DEMO.map((r) => <button key={r} type="button" className="chip" onClick={() => setEmail(`${r}@rotacerta.local`)}>{r}</button>)}
          </div>
        )}
        <InstallCard compact />
      </section>
    </div>
  );
}
