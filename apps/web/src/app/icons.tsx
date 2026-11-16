import { ArrowRight, Bell, Building2, ChartColumn, Check, Eye, EyeOff, House, ListChecks, LogOut, MapPin, Package, Play, Plus, Search, ShieldCheck, Truck, User, type LucideIcon } from 'lucide-react';

/** Ícones da casca do app (doca, barra do topo, busca e botões): conjunto Lucide. */
const ICONS = {
  home: House, chart: ChartColumn, box: Package, user: User, truck: Truck, list: ListChecks, pin: MapPin, check: Check,
  search: Search, bell: Bell, plus: Plus, arrow: ArrowRight, eye: Eye, eyeOff: EyeOff, building: Building2, shield: ShieldCheck,
  play: Play, logout: LogOut,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const Glyph = ICONS[name];
  return <Glyph className="icon" size={size} strokeWidth={1.9} aria-hidden="true" />;
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
