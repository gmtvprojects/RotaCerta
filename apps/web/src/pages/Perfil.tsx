import { ALLOWED_PAGES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Page, type Role } from '@rotacerta/domain';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../app/store';
import { TOURS, useTour } from '../app/tour';
import { InstallCard } from './InstallCard';
import { Header } from './ui';

/** Pessoas fictícias de cada perfil na demonstração. */
const PEOPLE: Record<Role, string> = { gestao: 'Marina Costa', atendente: 'Beatriz Alves', expedicao: 'Rafael Lima', motorista: 'Carlos Oliveira' };

const AREA: Partial<Record<Page, string>> = {
  dashboard: 'Painel de gestão', atendimento: 'Atendimento', pendencias: 'Continuar atendimento', entregas: 'Consulta de entregas',
  volumes: 'Volumes e caixas', expedicao: 'Montar carga', planejamento: 'Planejamento', carregamento: 'Carregamento',
  romaneio: 'Romaneios', motorista: 'Viagem do motorista', notificacoes: 'Notificações', configuracoes: 'Configurações',
};

const ROLES: Role[] = ['atendente', 'expedicao', 'motorista', 'gestao'];

export function Perfil() {
  const { role, data, driverId, login, logout } = useStore();
  const tour = useTour();
  const navigate = useNavigate();
  if (!role) return null;
  const person = role === 'motorista' ? data.drivers.find((d) => d.id === driverId)?.name ?? PEOPLE[role] : PEOPLE[role];
  const areas = [...new Set(ALLOWED_PAGES[role].map((p) => AREA[p]).filter(Boolean))];

  const presentAs = (r: Role) => {
    login(r);
    // A jornada começa depois que o perfil muda.
    setTimeout(() => navigate(TOURS[r][0].path), 0);
  };

  return (
    <>
      <Header title="Perfil." subtitle="Quem está usando a demonstração e o que cada perfil enxerga." />
      <section className="card">
        <div className="card-head">
          <div className="avatar">{person.split(' ').map((s) => s[0]).slice(0, 2).join('')}</div>
          <div><h2>{person}</h2><span className="muted">{ROLE_LABELS[role]} · {ROLE_DESCRIPTIONS[role]}</span></div>
          <button type="button" onClick={logout}>Trocar perfil</button>
        </div>
        <small className="muted">Áreas liberadas</small>
        <div className="chips" style={{ marginTop: 6 }}>{areas.map((a) => <span className="pill blue" key={a}>{a}</span>)}</div>
        <p className="muted small">Os perfis não implementam autenticação ou segurança de produção.</p>
      </section>

      <section className="card">
        <div className="card-head"><h2>Cada pessoa, sua tarefa.</h2><button type="button" className="primary" onClick={tour.start}>Ver jornada deste perfil</button></div>
        <p className="muted small">Escolha a jornada que deseja apresentar ao cliente. Trocar de perfil leva ao primeiro passo.</p>
        {ROLES.map((r) => (
          <div className="row-item" key={r}>
            <div><strong>{ROLE_LABELS[r]}</strong> <span className="muted small">· {ROLE_DESCRIPTIONS[r]}</span>
              <div className="muted small">{TOURS[r].map((s) => s.title).join(' → ')}</div></div>
            <button type="button" disabled={r === role} onClick={() => presentAs(r)}>{r === role ? 'Perfil atual' : 'Apresentar'}</button>
          </div>
        ))}
      </section>

      <InstallCard />
    </>
  );
}
