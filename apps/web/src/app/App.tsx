import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ALLOWED_PAGES, ROLE_HOME, ROLE_LABELS, type Page, type Role } from '@rotacerta/domain';
import { useStore } from './store';
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

interface PageDef { page: Page; path: string; label: string; element: JSX.Element; hidden?: boolean }

const PAGES: PageDef[] = [
  { page: 'dashboard', path: '/gestao', label: 'Painel de gestão', element: <Dashboard /> },
  { page: 'atendimento', path: '/atendimento', label: 'Atendimento', element: <Atendimento /> },
  { page: 'pendencias', path: '/pendencias', label: 'Continuar atendimento', element: <Pendencias /> },
  { page: 'entregas', path: '/entregas', label: 'Entregas', element: <Entregas /> },
  { page: 'volumes', path: '/volumes', label: 'Volumes e caixas', element: <Volumes /> },
  { page: 'expedicao', path: '/expedicao', label: 'Montar carga', element: <Expedicao /> },
  { page: 'planejamento', path: '/planejamento', label: 'Planejamento', element: <Planejamento />, hidden: true },
  { page: 'carregamento', path: '/carregamento', label: 'Carregamento', element: <Carregamento /> },
  { page: 'romaneio', path: '/romaneios', label: 'Romaneios', element: <Romaneios /> },
  { page: 'motorista', path: '/motorista', label: 'Motorista', element: <Motorista /> },
  { page: 'notificacoes', path: '/notificacoes', label: 'Notificações', element: <Notificacoes /> },
  { page: 'configuracoes', path: '/configuracoes', label: 'Configurações', element: <Configuracoes /> },
];

const homePath = (role: Role) => PAGES.find((p) => p.page === ROLE_HOME[role])!.path;
const menuFor = (role: Role) => PAGES.filter((p) => ALLOWED_PAGES[role].includes(p.page));

export function App() {
  const { role, logout } = useStore();
  const { pathname } = useLocation();

  if (!role) return <Login />;

  const menu = menuFor(role);
  const current = PAGES.find((p) => pathname === p.path || pathname.startsWith(`${p.path}/`));
  if (pathname === '/' || pathname === '/login') return <Navigate to={homePath(role)} replace />;
  if (current && !ALLOWED_PAGES[role].includes(current.page)) return <Navigate to={homePath(role)} replace />;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><strong>RotaCerta</strong><small>Gestão de entregas</small></div>
        <nav>
          {menu.filter((m) => !m.hidden).map((m) => (
            <NavLink key={m.path} to={m.path} className={({ isActive }) => (isActive ? 'active' : '')}>{m.label}</NavLink>
          ))}
        </nav>
        <div className="side-user">
          <span>{ROLE_LABELS[role]}</span>
          <button type="button" onClick={logout}>Sair</button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          {menu.map((m) => <Route key={m.path} path={`${m.path}/*`} element={m.element} />)}
          <Route path="*" element={<Navigate to={homePath(role)} replace />} />
        </Routes>
      </main>
    </div>
  );
}
