import { useSyncExternalStore } from 'react';

/** Estilo da navegação principal: menu lateral (padrão) ou a barra flutuante embaixo. É uma preferência do aparelho. */
export type NavStyle = 'side' | 'dock';

const KEY = 'rotacerta:nav-style';
const listeners = new Set<() => void>();

function read(): NavStyle {
  try { return localStorage.getItem(KEY) === 'dock' ? 'dock' : 'side'; } catch { return 'side'; }
}

let current = read();

export function setNavStyle(style: NavStyle) {
  current = style;
  try { localStorage.setItem(KEY, style); } catch { /* sem armazenamento: vale só nesta sessão */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const useNavStyle = (): NavStyle => useSyncExternalStore(subscribe, () => current, () => 'side');
