import { useEffect, useState } from 'react';

/** Preferências do aparelho (só conforto local; nada aqui é dado da operação). */
export type Theme = 'dark' | 'light' | 'system';
interface Prefs { theme: Theme; shareLocation: boolean; keepAwake: boolean }
const KEY = 'rotacerta.mobile.prefs';
const DEFAULTS: Prefs = { theme: 'dark', shareLocation: true, keepAwake: true };

function read(): Prefs {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) }; } catch { return DEFAULTS; }
}

const listeners = new Set<(p: Prefs) => void>();
let current = read();

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* armazenamento indisponível: vale só nesta sessão */ }
  applyTheme(current.theme);
  for (const l of listeners) l(current);
}

export function usePrefs(): Prefs {
  const [p, setP] = useState(current);
  useEffect(() => { listeners.add(setP); return () => { listeners.delete(setP); }; }, []);
  return p;
}

applyTheme(current.theme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(current.theme));
