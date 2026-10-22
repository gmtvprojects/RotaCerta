import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { InstallCard } from './InstallCard';

const ROLES: Role[] = ['atendente', 'expedicao', 'motorista', 'gestao'];

export function Login() {
  const { login } = useStore();
  return (
    <div className="login">
      <section className="login-card">
        <div className="brand"><strong>RotaCerta</strong><small>Gestão de entregas</small></div>
        <h1>Entrar</h1>
        <p className="muted">Escolha o perfil para conhecer a operação. Acesso de demonstração, sem autenticação.</p>
        <div className="role-grid">
          {ROLES.map((r) => (
            <button key={r} type="button" className="role-btn" onClick={() => login(r)}>
              <strong>{ROLE_LABELS[r]}</strong>
              <span>{ROLE_DESCRIPTIONS[r]}</span>
            </button>
          ))}
        </div>
        <InstallCard compact />
      </section>
    </div>
  );
}
