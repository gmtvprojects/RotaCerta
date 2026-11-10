import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ALLOWED_PAGES, ROLE_HOME, ROLE_LABELS, type Page, type Role } from '@rotacerta/domain';
import { useStore } from './store';
import { TourBar, useTour } from './tour';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { Entregas } from '../pages/Entregas';
import { Volumes } from '../pages/Volumes';
import { Expedicao } from '../pages/Expedicao';
import { Romaneios } from '../pages/Romaneios';
import { Motorista } from '../pages/Motorista';
import { Notificacoes } from '../pages/Notificacoes';
import { Configuracoes } from '../pages/Configuracoes';
import { Atendimento } from '../pages/Atendimento';
import { Pendencias } from '../pages/Pendencias';
import { Carregamento } from '../pages/Carregamento';
import { Planejamento } from '../pages/Planejamento';
import { Perfil } from '../pages/Perfil';
import { Acompanhamento } from '../pages/Acompanhamento';
import { Clientes } from '../pages/Clientes';
import { ForcePassword } from '../pages/ForcePassword';
import { PlatformApp } from '../pages/Plataforma';

interface PageDef { page: Page; path: string; label: string; element: JSX.Element; hidden?: boolean }

const PAGES: PageDef[] = [
  { page: 'dashboard', path: '/gestao', label: 'Painel de gestão', element: <Dashboard /> },
  { page: 'atendimento', path: '/atendimento', label: 'Atendimento', element: <Atendimento /> },
  { page: 'pendencias', path: '/pendencias', label: 'Continuar atendimento', element: <Pendencias /> },
  { page: 'entregas', path: '/entregas', label: 'Entregas', element: <Entregas /> },
  { page: 'clientes', path: '/clientes', label: 'Clientes', element: <Clientes /> },
  { page: 'volumes', path: '/volumes', label: 'Volumes e caixas', element: <Volumes /> },
  { page: 'expedicao', path: '/expedicao', label: 'Montar carga', element: <Expedicao /> },
  { page: 'planejamento', path: '/planejamento', label: 'Planejamento', element: <Planejamento />, hidden: true },
  { page: 'carregamento', path: '/carregamento', label: 'Carregamento', element: <Carregamento /> },
  { page: 'romaneio', path: '/romaneios', label: 'Romaneios', element: <Romaneios /> },
  { page: 'motorista', path: '/motorista', label: 'Motorista', element: <Motorista /> },
  { page: 'acompanhamento', path: '/acompanhamento', label: 'Acompanhar viagens', element: <Acompanhamento /> },
  { page: 'notificacoes', path: '/notificacoes', label: 'Notificações', element: <Notificacoes /> },
  { page: 'configuracoes', path: '/configuracoes', label: 'Configurações', element: <Configuracoes /> },
  { page: 'perfis', path: '/perfil', label: 'Perfil', element: <Perfil /> },
];

/** Atalhos da barra inferior no celular, por perfil (o resto fica em "Menu"). */
const BOTTOM: Record<Role, [string, string][]> = {
  atendente: [['/atendimento', 'Início'], ['/entregas', 'Entregas'], ['/perfil', 'Perfil']],
  expedicao: [['/expedicao', 'Cargas'], ['/carregamento', 'Carregamento'], ['/perfil', 'Perfil']],
  motorista: [['/motorista', 'Rota'], ['/romaneios', 'Romaneio'], ['/perfil', 'Perfil']],
  gestao: [['/gestao', 'Gestão'], ['/entregas', 'Entregas'], ['/expedicao', 'Expedição'], ['/perfil', 'Perfil']],
};

const homePath = (role: Role) => PAGES.find((p) => p.page === ROLE_HOME[role])!.path;
const menuFor = (role: Role) => PAGES.filter((p) => ALLOWED_PAGES[role].includes(p.page));

export function App() {
  const { role, user, isPlatform, mustChangePassword, logout, connection, problem, clearProblem, refresh } = useStore();
  const { pathname } = useLocation();
  const tour = useTour();
  const [menuOpen, setMenuOpen] = useState(false);

  // Ao navegar, o menu do celular fecha e a tela volta ao topo.
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [pathname]);

  if (!user && connection === 'loading') {
    return <div className="login"><section className="login-card"><div className="brand"><strong>RotaCerta</strong><small>Gestão de entregas</small></div><p className="muted">Abrindo…</p></section></div>;
  }
  // sem sessão o endereço volta à raiz: depois do logout (ou de um link antigo) a barra não fica em /gestao
  if (!user) return pathname === '/' ? <Login /> : <Navigate to="/" replace />;
  // senha definida por outra pessoa (cadastro da empresa ou redefinição): troca antes de qualquer outra tela
  if (mustChangePassword) return <ForcePassword />;
  // quem opera o serviço usa o painel de empresas, sem as telas da operação
  if (isPlatform) return <PlatformApp />;
  if (!role) return <Login />;
  if (connection !== 'ready') {
    return (
      <div className="login"><section className="login-card">
        <div className="brand"><strong>RotaCerta</strong><small>Gestão de entregas</small></div>
        {connection === 'loading' ? <p className="muted">Carregando os dados da operação…</p> : <>
          <p className="error" role="alert">{problem ?? 'Não foi possível falar com o servidor.'}</p>
          <button type="button" className="primary" onClick={() => void refresh()}>Tentar de novo</button>
          <button type="button" onClick={logout}>Sair</button>
        </>}
      </section></div>
    );
  }

  const menu = menuFor(role);
  const current = PAGES.find((p) => pathname === p.path || pathname.startsWith(`${p.path}/`));
  if (pathname === '/' || pathname === '/login') return <Navigate to={homePath(role)} replace />;
  if (current && !ALLOWED_PAGES[role].includes(current.page)) return <Navigate to={homePath(role)} replace />;

  return (
    <div className={`shell ${tour.active ? 'with-tour' : ''}`}>
      <aside className={`side ${menuOpen ? 'open' : ''}`}>
        <div className="brand"><strong>RotaCerta</strong><small>Gestão de entregas</small></div>
        <nav aria-label="Menu principal">
          {menu.filter((m) => !m.hidden).map((m) => (
            <NavLink key={m.path} to={m.path} className={({ isActive }) => (isActive ? 'active' : '')}>{m.label}</NavLink>
          ))}
        </nav>
        <div className="side-bottom">
          <button type="button" className="journey" onClick={() => { setMenuOpen(false); tour.start(); }}>▶ Ver jornada deste perfil</button>
          <div className="side-user">
            <span>{ROLE_LABELS[role]}</span>
            <button type="button" onClick={logout}>Sair</button>
          </div>
        </div>
      </aside>
      <main className="main">
        {problem && <div className="banner error" role="alert">{problem} <button type="button" onClick={clearProblem}>Fechar</button></div>}
        <Routes>
          {menu.map((m) => <Route key={m.path} path={`${m.path}/*`} element={m.element} />)}
          <Route path="*" element={<Navigate to={homePath(role)} replace />} />
        </Routes>
      </main>
      <TourBar />
      <nav className="bottom-nav" aria-label="Atalhos">
        {BOTTOM[role].map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
        ))}
        <button type="button" className={menuOpen ? 'active' : ''} aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>Menu</button>
      </nav>
    </div>
  );
}
