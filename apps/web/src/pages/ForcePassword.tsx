import { useState, type FormEvent } from 'react';
import { useStore } from '../app/store';

/** Mostrada no primeiro acesso depois que outra pessoa definiu a senha (cadastro da empresa ou redefinição): a pessoa escolhe a dela. */
export function ForcePassword() {
  const { user, changePassword, logout } = useStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== again) { setError('As duas senhas novas não são iguais.'); return; }
    if (next === current) { setError('Escolha uma senha diferente da provisória.'); return; }
    setBusy(true);
    const err = await changePassword(current, next);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="login">
      <section className="login-card">
        <div className="brand"><strong>RotaCerta</strong><small>Gestão de entregas</small></div>
        <h1>Crie sua senha</h1>
        <p className="muted">Olá, {user?.name.split(' ')[0]}. A senha que você recebeu é provisória: escolha uma só sua para continuar.</p>
        <form onSubmit={submit}>
          <label className="field">Senha provisória<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
          <label className="field">Nova senha (mínimo 10 caracteres)<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} /></label>
          <label className="field">Repita a nova senha<input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required minLength={10} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar e continuar'}</button>
          <button type="button" onClick={logout}>Sair</button>
        </form>
      </section>
    </div>
  );
}
