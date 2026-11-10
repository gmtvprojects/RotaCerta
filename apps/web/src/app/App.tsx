import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ALLOWED_PAGES, ORDER_STATUS_LABELS, ROLE_HOME, ROLE_LABELS, canAccess, type Page, type Role } from '@rotacerta/domain';
import { Icon, Logo, type IconName } from './icons';
import { Palette, type PaletteItem } from './Palette';
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
import { OrderDetail } from '../pages/OrderDetail';

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

interface DockLink { to: string; label: string; icon: IconName }

/**
 * Doca flutuante: os destinos do dia a dia de cada perfil e, em verde, a ação principal dele.
 * É a mesma no computador e no celular. As outras telas ficam na busca (Ctrl K).
 */
const DOCK: Record<Role, { links: DockLink[]; action: DockLink }> = {
  atendente: {
    links: [{ to: '/atendimento', label: 'Início', icon: 'home' }, { to: '/entregas', label: 'Entregas', icon: 'box' }, { to: '/clientes', label: 'Clientes', icon: 'user' }],
    action: { to: '/atendimento/nova', label: 'Nova entrega', icon: 'plus' },
  },
  expedicao: {
    links: [{ to: '/expedicao', label: 'Cargas', icon: 'truck' }, { to: '/volumes', label: 'Volumes', icon: 'box' }, { to: '/acompanhamento', label: 'Viagens', icon: 'pin' }],
    action: { to: '/carregamento', label: 'Conferir', icon: 'list' },
  },
  motorista: {
    links: [{ to: '/motorista', label: 'Início', icon: 'home' }, { to: '/romaneios', label: 'Romaneio', icon: 'list' }],
    action: { to: '/motorista/viagem', label: 'Minha viagem', icon: 'pin' },
  },
  gestao: {
    links: [{ to: '/gestao', label: 'Painel', icon: 'chart' }, { to: '/entregas', label: 'Entregas', icon: 'box' }, { to: '/acompanhamento', label: 'Viagens', icon: 'pin' }],
    action: { to: '/atendimento/nova', label: 'Nova entrega', icon: 'plus' },
  },
};

const PAGE_ICON: Partial<Record<Page, IconName>> = {
  dashboard: 'chart', atendimento: 'home', entregas: 'box', clientes: 'user', volumes: 'box', expedicao: 'truck',
  carregamento: 'list', romaneio: 'list', motorista: 'pin', acompanhamento: 'pin', notificacoes: 'bell', perfis: 'user',
};

const initials = (name: string) => name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const homePath = (role: Role) => PAGES.find((p) => p.page === ROLE_HOME[role])!.path;
const menuFor = (role: Role) => PAGES.filter((p) => ALLOWED_PAGES[role].includes(p.page));

export function App() {
  const { role, user, data, isPlatform, mustChangePassword, logout, connection, problem, clearProblem, refresh } = useStore();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tour = useTour();
  const [searching, setSearching] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);

  // Ao navegar, a tela volta ao topo.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // Ctrl K (ou Cmd K) abre a busca em qualquer tela.
  const inApp = !!role && connection === 'ready' && !mustChangePassword && !isPlatform;
  useEffect(() => {
    if (!inApp) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching((open) => !open); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inApp]);

  const startTour = tour.start;
  const paletteItems = useMemo<PaletteItem[]>(() => (role ? [
    ...menuFor(role).filter((m) => !m.hidden).map((m): PaletteItem => ({ key: m.path, group: 'Ir para', label: m.label, icon: PAGE_ICON[m.page] ?? 'arrow', run: () => navigate(m.path) })),
    { key: 'tour', group: 'Ações', label: 'Ver jornada deste perfil', icon: 'play', run: startTour },
    { key: 'logout', group: 'Ações', label: 'Sair', icon: 'logout', run: logout },
  ] : []), [role, navigate, startTour, logout]);

  const searchOrders = useCallback((q: string): PaletteItem[] => (role && canAccess(role, 'entregas')
    ? data.orders.filter((o) => String(o.id).includes(q) || o.name.toLowerCase().includes(q)).slice(0, 6)
      .map((o) => ({ key: `order-${o.id}`, group: 'Entregas', label: `#${o.id} · ${o.name}`, hint: ORDER_STATUS_LABELS[o.status], icon: 'box' as const, run: () => setOrderId(o.id) }))
    : []), [role, data.orders]);

  if (!user && connection === 'loading') {
    return <div className="login"><section className="login-card"><Logo sub="Gestão de entregas" /><p className="muted">Abrindo…</p></section></div>;
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
        <Logo sub="Gestão de entregas" />
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

  const dock = DOCK[role];
  const middle = Math.ceil(dock.links.length / 2);
  const dockLink = (l: DockLink) => (
    <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={l.icon} /><span>{l.label}</span></NavLink>
  );

  return (
    <div className={`shell ${tour.active ? 'with-tour' : ''}`}>
      <header className="topbar">
        <Link to={homePath(role)} className="logo-link" aria-label="RotaCerta, início"><Logo /></Link>
        <span className="grow" />
        <span className="role-tag">{ROLE_LABELS[role]}</span>
        {canAccess(role, 'notificacoes') && (
          <NavLink to="/notificacoes" className={({ isActive }) => `iconbtn ${isActive ? 'active' : ''}`} aria-label="Notificações"><Icon name="bell" /></NavLink>
        )}
        <Link to="/perfil" className="avatar" aria-label={`Perfil de ${user.name}`}>{initials(user.name)}</Link>
      </header>
      <main className="main">
        {problem && <div className="banner error" role="alert">{problem} <button type="button" onClick={clearProblem}>Fechar</button></div>}
        <Routes>
          {menu.map((m) => <Route key={m.path} path={`${m.path}/*`} element={m.element} />)}
          <Route path="*" element={<Navigate to={homePath(role)} replace />} />
        </Routes>
      </main>
      <TourBar />
      <nav className="dock" aria-label="Navegação principal">
        {dock.links.slice(0, middle).map(dockLink)}
        <Link to={dock.action.to} className="dock-act"><Icon name={dock.action.icon} /><span>{dock.action.label}</span></Link>
        {dock.links.slice(middle).map(dockLink)}
        <button type="button" onClick={() => setSearching(true)} aria-haspopup="dialog"><Icon name="search" /><span>Buscar</span><kbd>Ctrl K</kbd></button>
      </nav>
      {searching && <Palette items={paletteItems} search={searchOrders} onClose={() => setSearching(false)} />}
      {orderId != null && <OrderDetail orderId={orderId} onClose={() => setOrderId(null)} />}
    </div>
  );
}
