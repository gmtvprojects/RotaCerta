import { useSyncExternalStore } from 'react';

/** Modo de cor: segue o sistema ou força claro/escuro. */
export type ColorMode = 'system' | 'light' | 'dark';
/** Paletas do Astryx oferecidas (todas sóbrias; a fonte é sempre a do app). */
export type Palette = 'rota' | 'neutral' | 'stone' | 'matcha' | 'butter' | 'chocolate';

export const PALETTES: Array<{ value: Palette; label: string; swatch: string }> = [
  { value: 'rota', label: 'Rota (azul)', swatch: '#1b4fd8' },
  { value: 'neutral', label: 'Neutro', swatch: '#1b1b1b' },
  { value: 'stone', label: 'Pedra', swatch: '#6b645c' },
  { value: 'matcha', label: 'Matcha', swatch: '#4f7a3a' },
  { value: 'butter', label: 'Manteiga', swatch: '#d9a521' },
  { value: 'chocolate', label: 'Chocolate', swatch: '#5a3a2a' },
];

export interface ThemePref { mode: ColorMode; palette: Palette }

const KEY = 'rotacerta:theme';
const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ThemePref>;
    return {
      mode: raw.mode === 'light' || raw.mode === 'dark' ? raw.mode : 'system',
      palette: PALETTES.some((p) => p.value === raw.palette) ? (raw.palette as Palette) : 'rota',
    };
  } catch { return { mode: 'system', palette: 'rota' }; }
}

let current = read();

export function setThemePref(patch: Partial<ThemePref>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const useThemePref = (): ThemePref => useSyncExternalStore(subscribe, () => current, () => current);
