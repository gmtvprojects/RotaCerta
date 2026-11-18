import type { SVGProps } from 'react';
/** Ícones de traço usados na casca do app (doca, barra do topo, busca e botões). */
export const PATHS = {
  home: <path d="M3 11l9-8 9 8v9h-6v-6H9v6H3z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  box: <><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  truck: <><path d="M2 6h11v10H2zM13 10h5l4 4v2h-9z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  pin: <><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5" /></>,
  bell: <path d="M6 16v-5a6 6 0 1112 0v5l2 2H4zM10 21h4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.9M6.5 6.6A17 17 0 002 12s4 7 10 7a10 10 0 004.3-1" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></>,
  building: <path d="M4 21V5l8-2v18M12 9l8 2v10M2 21h20M8 8v.5M8 12v.5M8 16v.5M16 14v.5M16 17.5v.5" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  play: <path d="M7 4l13 8-13 8z" />,
  logout: <path d="M9 4H4v16h5M14 8l4 4-4 4M18 12H9" />,
  alert: <><path d="M21.7 18l-8-14a2 2 0 00-3.4 0l-8 14A2 2 0 004 21h16a2 2 0 001.7-3z" /><path d="M12 9v4M12 17h.01" /></>,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  sliders: <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" />,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  map: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  );
}

/** Marca: o losango de parada ligado a um trecho de rota. */
export function Logo({ sub, mark }: { sub?: string; mark?: boolean }) {
  return (
    <span className="logo">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <rect width="26" height="26" rx="8" className="logo-bg" />
        <path d="M7 18h5a3 3 0 003-3v-1a3 3 0 013-3h1" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="7" cy="18" r="2.2" fill="#fff" /><circle cx="19" cy="8" r="2.4" className="logo-dot" />
      </svg>
      {!mark && <span><strong>RotaCerta</strong>{sub && <small>{sub}</small>}</span>}
    </span>
  );
}

const cache = new Map<IconName, (props: SVGProps<SVGSVGElement>) => JSX.Element>();

/** Ícone do app no formato que os componentes do Astryx aceitam (um componente SVG). */
export function svgIcon(name: IconName) {
  let component = cache.get(name);
  if (!component) {
    component = (props) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>{PATHS[name]}</svg>
    );
    cache.set(name, component);
  }
  return component;
}
