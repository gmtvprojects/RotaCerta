import { useRef, useState, type FormEvent } from 'react';
import { GlowCard } from '../app/GlowCard';
import { Icon, Logo } from '../app/icons';
import { RouteMap } from '../app/RouteMap';
import { SlideUpText } from '../app/SlideUpText';
import { useStore } from '../app/store';
import { InstallCard } from './InstallCard';

/** Atalhos de preenchimento só no ambiente de desenvolvimento (usuários criados pelo seed da API). */
const DEMO = ['atendente', 'expedicao', 'motorista', 'gestao'] as const;

export function Login() {
  const { login, problem, clearProblem } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mapRef = useRef<HTMLElement>(null);

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
    <div className="signin">
      <RouteMap area={mapRef} />
      <aside className="signin-map" ref={mapRef}>
        <Logo />
        <div className="signin-copy">
          <span className="signin-tag">Do caixa à porta do cliente</span>
          <h1><SlideUpText delay={0.2}>{'Entregas organizadas.\nClientes avisados.'}</SlideUpText></h1>
          <p>Atendimento, expedição e motorista no mesmo fluxo. Cada pessoa com o que precisa para seguir.</p>
        </div>
      </aside>
      <main className="signin-side">
        <GlowCard className="signin-form">
          <div>
            <h2>Entrar</h2>
            <p className="muted">Use o e-mail e a senha fornecidos pela loja.</p>
          </div>
          <form onSubmit={submit}>
            <label className="field">E-mail
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">Senha
              <span className="pw">
                <input type={visible ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible} onClick={() => setVisible((v) => !v)}>
                  <Icon name={visible ? 'eyeOff' : 'eye'} />
                </button>
              </span>
            </label>
            {(error || problem) && <p className="error" role="alert">{error || problem}</p>}
            <button type="submit" className="primary go" disabled={busy}>{busy ? 'Entrando…' : <>Entrar <Icon name="arrow" size={18} /></>}</button>
          </form>
          <p className="muted small">Esqueceu a senha? Peça uma nova para a gestão da loja.</p>
          {import.meta.env.DEV && (
            <div className="chips">
              {DEMO.map((r) => <button key={r} type="button" className="chip" onClick={() => setEmail(`${r}@rotacerta.local`)}>{r}</button>)}
            </div>
          )}
          <InstallCard compact />
        </GlowCard>
      </main>
    </div>
  );
}
