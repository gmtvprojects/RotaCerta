import { ALLOWED_PAGES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Page, type Role } from '@rotacerta/domain';
import { useState } from 'react';
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
  const { role, user, data, driverId, logout, changePassword } = useStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const tour = useTour();
  const navigate = useNavigate();
  if (!role) return null;
  const person = user?.name ?? (role === 'motorista' ? data.drivers.find((d) => d.id === driverId)?.name ?? PEOPLE[role] : PEOPLE[role]);
  const areas = [...new Set(ALLOWED_PAGES[role].map((p) => AREA[p]).filter(Boolean))];

  // Trocar de perfil exige entrar com outro usuário; a jornada de cada perfil aparece ao entrar com ele.
  const presentAs = () => logout();

  return (
    <>
      <Header title="Perfil." subtitle="Quem está usando o sistema e o que cada perfil enxerga." />
      <section className="card">
        <div className="card-head">
          <div className="avatar">{person.split(' ').map((s) => s[0]).slice(0, 2).join('')}</div>
          <div><h2>{person}</h2><span className="muted">{ROLE_LABELS[role]} · {ROLE_DESCRIPTIONS[role]}</span></div>
          <button type="button" onClick={logout}>Trocar perfil</button>
        </div>
        <small className="muted">Áreas liberadas</small>
        <div className="chips" style={{ marginTop: 6 }}>{areas.map((a) => <span className="pill blue" key={a}>{a}</span>)}</div>
        <p className="muted small">Seu acesso é definido pelo perfil do seu usuário.</p>
      </section>

      <section className="card">
        <div className="card-head"><h2>Alterar minha senha</h2></div>
        <form onSubmit={async (e) => { e.preventDefault(); const err = await changePassword(current, next); setPwMsg(err ? { ok: false, text: err } : { ok: true, text: 'Senha alterada. Suas outras sessões foram encerradas.' }); if (!err) { setCurrent(''); setNext(''); } }}>
          <label className="field">Senha atual<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
          <label className="field">Nova senha (mínimo 10 caracteres)<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} /></label>
          {pwMsg && <p className={pwMsg.ok ? 'muted' : 'error'} role="status">{pwMsg.text}</p>}
          <button type="submit">Alterar senha</button>
        </form>
      </section>

      <section className="card">
        <div className="card-head"><h2>Cada pessoa, sua tarefa.</h2><button type="button" className="primary" onClick={tour.start}>Ver jornada deste perfil</button></div>
        <p className="muted small">Escolha a jornada que deseja apresentar ao cliente. Trocar de perfil leva ao primeiro passo.</p>
        {ROLES.map((r) => (
          <div className="row-item" key={r}>
            <div><strong>{ROLE_LABELS[r]}</strong> <span className="muted small">· {ROLE_DESCRIPTIONS[r]}</span>
              <div className="muted small">{TOURS[r].map((s) => s.title).join(' → ')}</div></div>
            <button type="button" disabled={r === role} onClick={presentAs}>{r === role ? 'Perfil atual' : 'Entrar com outro usuário'}</button>
          </div>
        ))}
      </section>

      <InstallCard />
    </>
  );
}
