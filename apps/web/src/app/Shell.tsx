import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { SideNav, SideNavHeading, SideNavItem } from '@astryxdesign/core/SideNav';
import { TopNav } from '@astryxdesign/core/TopNav';
import { Icon, Logo, svgIcon, type IconName } from './icons';

/** Liga os links do Astryx ao react-router (sem recarregar a página). */
function RouterLink({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }) {
  // os tipos do react-router 6 vêm do @types/react 18; o cast evita o conflito de ReactNode entre as duas versões
  return <Link to={href ?? '/'} {...rest}>{children as never}</Link>;
}

export interface ShellItem { to: string; label: string; icon: IconName }

interface ShellProps {
  mode: 'side' | 'dock';
  homePath: string;
  roleLabel: string;
  userName: string;
  items: ShellItem[];
  action: ShellItem;
  showBell: boolean;
  onSearch: () => void;
  onLogout: () => void;
  banner?: ReactNode;
  /** Barra de baixo (modo dock e telas estreitas). */
  dock: ReactNode;
  children: ReactNode;
}

/** Casca do app com os componentes do Astryx: menu lateral (ou só a barra de cima), topo e conteúdo. */
export function Shell({ mode, homePath, roleLabel, userName, items, action, showBell, onSearch, onLogout, banner, dock, children }: ShellProps) {
  const { pathname } = useLocation();
  const selected = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  const sideNav = mode === 'side' ? (
    <SideNav
      header={<SideNavHeading heading="RotaCerta" icon={<Logo mark />} headingHref={homePath} />}
      topContent={<Button as={RouterLink} href={action.to} label={action.label} variant="primary" icon={svgIcon(action.icon)({})} width="100%" />}
      footer={(
        <>
          <SideNavItem label="Sair" icon={svgIcon('logout')} onClick={onLogout} />
        </>
      )}
    >
      {items.map((i) => <SideNavItem key={i.to} as={RouterLink} href={i.to} label={i.label} icon={svgIcon(i.icon)} isSelected={selected(i.to)} />)}
    </SideNav>
  ) : undefined;

  const topNav = (
    <TopNav
      label="Barra superior"
      centerContent={(
        <button type="button" className="top-search" onClick={onSearch} aria-haspopup="dialog" aria-label="Buscar (Ctrl K)">
          <Icon name="search" size={17} />
          <span className="top-search-text">Buscar no sistema: entregas, clientes, romaneios, motoristas…</span>
          <kbd>Ctrl K</kbd>
        </button>
      )}
      heading={mode === 'dock' ? <Link to={homePath} className="logo-link" aria-label="RotaCerta, início"><Logo /></Link> : undefined}
      endContent={(
        <>
          <Badge label={roleLabel} variant="neutral" />
          {showBell && <Button as={RouterLink} href="/notificacoes" label="Notificações" isIconOnly variant="ghost" icon={svgIcon('bell')({})} />}
          <Avatar as={RouterLink} href="/perfil" name={userName} size="sm" />
        </>
      )}
    />
  );

  return (
    <AppShell height="auto" variant="elevated" topNav={topNav} sideNav={sideNav} banner={banner} mobileNav={false}>
      {children}
      {dock}
    </AppShell>
  );
}
