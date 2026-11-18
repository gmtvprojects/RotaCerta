import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ALLOWED_PAGES, ROLE_HOME, ROLE_LABELS, canAccess, type Page, type Role } from '@rotacerta/domain';
import { Icon, Logo, type IconName } from './icons';
import { Palette, type PaletteItem } from './Palette';
import { CONFIG_SECTIONS, searchSystem } from './globalSearch';
import { setNavStyle, useNavStyle } from './navPref';
import { useStore } from './store';
import { TourBar, useTour } from './tour';
import { AmbientRoutes } from './AmbientRoutes';
import { DriverBeacon } from './location';
import { Shell } from './Shell';
import { setThemePref, useThemePref } from './themePref';
import { Login } from '../pages/Login';
import { AppSkeleton, PageSkeleton, type PageShape } from '../pages/Skeletons';
import { PageEnter, SNAPPY } from './motion';
import { motion } from 'motion/react';

const Dashboard = lazy(() => import('../pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Entregas = lazy(() => import('../pages/Entregas').then((m) => ({ default: m.Entregas })));
const Volumes = lazy(() => import('../pages/Volumes').then((m) => ({ default: m.Volumes })));
const Expedicao = lazy(() => import('../pages/Expedicao').then((m) => ({ default: m.Expedicao })));
const Romaneios = lazy(() => import('../pages/Romaneios').then((m) => ({ default: m.Romaneios })));
const Motorista = lazy(() => import('../pages/Motorista').then((m) => ({ default: m.Motorista })));
const Notificacoes = lazy(() => import('../pages/Notificacoes').then((m) => ({ default: m.Notificacoes })));
const Configuracoes = lazy(() => import('../pages/Configuracoes').then((m) => ({ default: m.Configuracoes })));
const Atendimento = lazy(() => import('../pages/Atendimento').then((m) => ({ default: m.Atendimento })));
const Pendencias = lazy(() => import('../pages/Pendencias').then((m) => ({ default: m.Pendencias })));
const Carregamento = lazy(() => import('../pages/Carregamento').then((m) => ({ default: m.Carregamento })));
const Planejamento = lazy(() => import('../pages/Planejamento').then((m) => ({ default: m.Planejamento })));
const Perfil = lazy(() => import('../pages/Perfil').then((m) => ({ default: m.Perfil })));
const Acompanhamento = lazy(() => import('../pages/Acompanhamento').then((m) => ({ default: m.Acompanhamento })));
const Clientes = lazy(() => import('../pages/Clientes').then((m) => ({ default: m.Clientes })));
const ForcePassword = lazy(() => import('../pages/ForcePassword').then((m) => ({ default: m.ForcePassword })));
const PlatformApp = lazy(() => import('../pages/Plataforma').then((m) => ({ default: m.PlatformApp })));
const Agentes = lazy(() => import('../pages/Agentes').then((m) => ({ default: m.Agentes })));
const Rastreio = lazy(() => import('../pages/Rastreio').then((m) => ({ default: m.Rastreio })));
const OrderDetail = lazy(() => import('../pages/OrderDetail').then((m) => ({ default: m.OrderDetail })));

/** Telas inteiras fora da casca (troca de senha, painel da plataforma): esqueleto do app enquanto o código chega. */
const deferred = (content: ReactNode, fallback: ReactNode = <AppSkeleton />) => <Suspense fallback={fallback}>{content}</Suspense>;
/** Telas do app: esqueleto no formato da tela enquanto o código dela chega. */
const page = (content: ReactNode, shape: PageShape = 'list') => <Suspense fallback={<PageSkeleton shape={shape} />}><PageEnter>{content}</PageEnter></Suspense>;


interface PageDef { page: Page; path: string; label: string; element: JSX.Element; hidden?: boolean }

const PAGES: PageDef[] = [
  { page: 'dashboard', path: '/gestao', label: 'Painel de gestão', element: page(<Dashboard />, 'dashboard') },
  { page: 'atendimento', path: '/atendimento', label: 'Atendimento', element: page(<Atendimento />, 'split') },
  { page: 'pendencias', path: '/pendencias', label: 'Continuar atendimento', element: page(<Pendencias />, 'list') },
  { page: 'entregas', path: '/entregas', label: 'Entregas', element: page(<Entregas />, 'split') },
  { page: 'clientes', path: '/clientes', label: 'Clientes', element: page(<Clientes />, 'list') },
  { page: 'volumes', path: '/volumes', label: 'Volumes e caixas', element: page(<Volumes />, 'table') },
  { page: 'expedicao', path: '/expedicao', label: 'Montar carga', element: page(<Expedicao />, 'table') },
  { page: 'planejamento', path: '/planejamento', label: 'Planejamento', element: page(<Planejamento />, 'split'), hidden: true },
  { page: 'carregamento', path: '/carregamento', label: 'Carregamento', element: page(<Carregamento />, 'list') },
  { page: 'romaneio', path: '/romaneios', label: 'Romaneios', element: page(<Romaneios />, 'split') },
  { page: 'motorista', path: '/motorista', label: 'Motorista', element: page(<Motorista />, 'dashboard') },
  { page: 'acompanhamento', path: '/acompanhamento', label: 'Acompanhar viagens', element: page(<Acompanhamento />, 'map') },
  { page: 'notificacoes', path: '/notificacoes', label: 'Notificações', element: page(<Notificacoes />, 'list') },
  { page: 'agentes', path: '/agentes', label: 'Agentes de IA', element: page(<Agentes />, 'tiles') },
  { page: 'configuracoes', path: '/configuracoes', label: 'Configurações', element: page(<Configuracoes />, 'tiles') },
  { page: 'perfis', path: '/perfil', label: 'Perfil', element: page(<Perfil />, 'split') },
];

interface DockLink { to: string; label: string; icon: IconName }

/**
 * Doca flutuante: os destinos do dia a dia de cada perfil e, em verde, a ação principal dele.
 * É a mesma no computador e no celular. As outras telas ficam na busca (Ctrl K).
 */
const DOCK: Record<Role, { links: DockLink[]; action: DockLink }> = {
  atendente: {
    links: [{ to: '/atendimento', label: 'Início', icon: 'home' }, { to: '/entregas', label: 'Entregas', icon: 'box' }, { to: '/clientes', label: 'Clientes', icon: 'user' }, { to: '/pendencias', label: 'Pendências', icon: 'clock' }],
    action: { to: '/atendimento/nova', label: 'Nova entrega', icon: 'plus' },
  },
  expedicao: {
    links: [{ to: '/expedicao', label: 'Cargas', icon: 'truck' }, { to: '/volumes', label: 'Volumes', icon: 'box' }, { to: '/acompanhamento', label: 'Viagens', icon: 'pin' }, { to: '/romaneios', label: 'Romaneios', icon: 'list' }],
    action: { to: '/carregamento', label: 'Conferir', icon: 'list' },
  },
  motorista: {
    links: [{ to: '/motorista', label: 'Início', icon: 'home' }, { to: '/romaneios', label: 'Romaneio', icon: 'list' }, { to: '/perfil', label: 'Perfil', icon: 'user' }],
    action: { to: '/motorista/viagem', label: 'Minha viagem', icon: 'pin' },
  },
  gestao: {
    links: [{ to: '/gestao', label: 'Painel', icon: 'chart' }, { to: '/entregas', label: 'Entregas', icon: 'box' }, { to: '/acompanhamento', label: 'Viagens', icon: 'pin' }, { to: '/romaneios', label: 'Romaneios', icon: 'list' }],
    action: { to: '/atendimento/nova', label: 'Nova entrega', icon: 'plus' },
  },
};

const PAGE_ICON: Partial<Record<Page, IconName>> = {
  dashboard: 'chart', atendimento: 'home', entregas: 'box', clientes: 'user', volumes: 'box', expedicao: 'truck',
  carregamento: 'list', romaneio: 'list', motorista: 'pin', acompanhamento: 'pin', notificacoes: 'bell', perfis: 'user',
  pendencias: 'clock', configuracoes: 'sliders', agentes: 'star',
};

const homePath = (role: Role) => PAGES.find((p) => p.page === ROLE_HOME[role])!.path;
const menuFor = (role: Role) => PAGES.filter((p) => ALLOWED_PAGES[role].includes(p.page));

export function App() {
  const { role, user, data, isPlatform, mustChangePassword, logout, connection, problem, clearProblem, refresh } = useStore();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tour = useTour();
  const navStyle = useNavStyle();
  const themePref = useThemePref();
  // painel "Telas" da barra de baixo: todas as telas do perfil, sem depender da busca
  const [screens, setScreens] = useState(false);
  useEffect(() => { setScreens(false); }, [pathname]);
  useEffect(() => {
    if (!screens) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setScreens(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screens]);
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
  const dark = themePref.mode === 'dark' || (themePref.mode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const paletteItems = useMemo<PaletteItem[]>(() => (role ? [
    ...(canAccess(role, 'atendimento') ? [{ key: 'new-order', group: 'Ações', label: 'Nova entrega', icon: 'plus' as const, run: () => navigate('/atendimento/nova') }] : []),
    { key: 'theme', group: 'Ações', label: dark ? 'Usar tema claro' : 'Usar tema escuro', icon: 'eye', run: () => setThemePref({ mode: dark ? 'light' : 'dark' }) },
    { key: 'nav', group: 'Ações', label: navStyle === 'side' ? 'Usar menu na barra embaixo' : 'Usar menu lateral', icon: 'sliders', run: () => setNavStyle(navStyle === 'side' ? 'dock' : 'side') },
    ...menuFor(role).filter((m) => !m.hidden).map((m): PaletteItem => ({ key: m.path, group: 'Telas', label: m.label, icon: PAGE_ICON[m.page] ?? 'arrow', run: () => navigate(m.path) })),
    { key: 'tour', group: 'Mais', label: 'Ver jornada deste perfil', icon: 'play', run: startTour },
    { key: 'logout', group: 'Mais', label: 'Sair', icon: 'logout', run: logout },
  ] : []), [role, navigate, startTour, logout, dark, navStyle]);

  const searchAll = useCallback((q: string): PaletteItem[] => {
    if (!role) return [];
    const plainQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const sections = canAccess(role, 'configuracoes')
      ? CONFIG_SECTIONS.filter((s) => s.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(plainQ))
        .map((s): PaletteItem => ({ key: `cfg-${s.key}`, group: 'Configurações', label: s.label, icon: 'sliders', run: () => navigate(`/configuracoes?secao=${s.key}`) }))
      : [];
    return [...searchSystem({ query: q, role, data, go: navigate, openOrder: setOrderId }), ...sections];
  }, [role, data, navigate]);

  // link público de acompanhamento do cliente: não exige login
  if (pathname.startsWith('/rastreio/')) return deferred(<Rastreio token={decodeURIComponent(pathname.slice('/rastreio/'.length))} />, <div className="shell track-public"><main className="track-public-main"><PageSkeleton shape="form" /></main></div>);

  // retomando a sessão: o esqueleto do app aparece no lugar de um "Abrindo…"
  if (!user && connection === 'loading') return <AppSkeleton />;
  // sem sessão o endereço volta à raiz: depois do logout (ou de um link antigo) a barra não fica em /gestao
  if (!user) return pathname === '/' ? <Login /> : <Navigate to="/" replace />;
  // senha definida por outra pessoa (cadastro da empresa ou redefinição): troca antes de qualquer outra tela
  if (mustChangePassword) return deferred(<ForcePassword />);
  // quem opera o serviço usa o painel de empresas, sem as telas da operação
  if (isPlatform) return deferred(<PlatformApp />);
  if (!role) return <Login />;
  if (connection === 'loading') return <AppSkeleton />;
  if (connection !== 'ready') {
    return (
      <div className="login"><section className="login-card">
        <Logo sub="Gestão de entregas" />
        <p className="error" role="alert">{problem ?? 'Não foi possível falar com o servidor.'}</p>
        <button type="button" className="primary" onClick={() => void refresh()}>Tentar de novo</button>
        <button type="button" onClick={logout}>Sair</button>
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
    <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
      {({ isActive }) => <>{isActive && <motion.i layoutId="dock-pill" className="dock-pill" transition={SNAPPY} />}<Icon name={l.icon} /><span>{l.label}</span></>}
    </NavLink>
  );

  const items = menu.filter((m) => !m.hidden && m.page !== 'perfis' && m.page !== 'notificacoes').map((m) => ({ to: m.path, label: m.label, icon: PAGE_ICON[m.page] ?? 'arrow' as IconName }));
  const dockBar = (
    <motion.nav className="dock" aria-label="Navegação principal" initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.15 }}>
      {dock.links.slice(0, middle).map(dockLink)}
      <Link to={dock.action.to} className="dock-act" aria-label={dock.action.label}><Icon name={dock.action.icon} /><span>{dock.action.label}</span></Link>
      {dock.links.slice(middle).map(dockLink)}
      <button type="button" className={screens ? 'active' : ''} onClick={() => setScreens((o) => !o)} aria-expanded={screens} aria-controls="dock-screens"><Icon name="grid" /><span>Telas</span></button>
    </motion.nav>
  );
  const screensSheet = screens && (
    <>
      <div className="dock-sheet-back" onClick={() => setScreens(false)} aria-hidden="true" />
      <div className="dock-sheet" id="dock-screens" role="dialog" aria-label="Todas as telas">
        <div className="dock-sheet-head"><b>Todas as telas</b><button type="button" className="link" onClick={() => { setScreens(false); setSearching(true); }}>Buscar no sistema</button></div>
        <div className="dock-sheet-grid">
          {menu.filter((m) => !m.hidden).map((m) => (
            <NavLink key={m.path} to={m.path} className={({ isActive }) => `dock-tile ${isActive ? 'active' : ''}`} onClick={() => setScreens(false)}>
              <span className="dock-tile-ico"><Icon name={PAGE_ICON[m.page] ?? 'arrow'} size={20} /></span><span>{m.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className={`shell nav-${navStyle} ${tour.active ? 'with-tour' : ''}`}>
      <Shell
        mode={navStyle} homePath={homePath(role)} roleLabel={ROLE_LABELS[role]} userName={user.name} items={items} action={dock.action}
        showBell={canAccess(role, 'notificacoes')} onSearch={() => setSearching(true)} onLogout={logout} dock={dockBar}
      >
        <main className="main" id="conteudo" tabIndex={-1}>
          {role === 'motorista' && <DriverBeacon routeId={data.routes.find((r) => r.status === 'active' && r.driverId === user.driverId)?.id ?? null} />}
      <AmbientRoutes pageKey={`${pathname}|${themePref.mode}|${themePref.palette}`} />
          {problem && <div className="banner error" role="alert">{problem} <button type="button" onClick={clearProblem}>Fechar</button></div>}
          <Routes>
            {menu.map((m) => <Route key={m.path} path={`${m.path}/*`} element={m.element} />)}
            <Route path="*" element={<Navigate to={homePath(role)} replace />} />
          </Routes>
        </main>
      </Shell>
      {screensSheet}
      <TourBar />
      {searching && <Palette items={paletteItems} search={searchAll} onClose={() => setSearching(false)} />}
      {orderId != null && deferred(<OrderDetail orderId={orderId} onClose={() => setOrderId(null)} />, null)}
    </div>
  );
}
