/** Ícones de traço usados na casca do app (doca, barra do topo, busca e botões). */
const PATHS = {
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
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  );
}

/** Marca: o losango de parada ligado a um trecho de rota. */
export function Logo({ sub }: { sub?: string }) {
  return (
    <span className="logo">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <rect width="26" height="26" rx="8" className="logo-bg" />
        <path d="M7 18h5a3 3 0 003-3v-1a3 3 0 013-3h1" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="7" cy="18" r="2.2" fill="#fff" /><circle cx="19" cy="8" r="2.4" className="logo-dot" />
      </svg>
      <span><strong>RotaCerta</strong>{sub && <small>{sub}</small>}</span>
    </span>
  );
}
