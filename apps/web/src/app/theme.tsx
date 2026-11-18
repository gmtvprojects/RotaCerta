import type { ReactNode } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { butterTheme } from '@astryxdesign/theme-butter/built';
import { chocolateTheme } from '@astryxdesign/theme-chocolate/built';
import { matchaTheme } from '@astryxdesign/theme-matcha/built';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { stoneTheme } from '@astryxdesign/theme-stone/built';
import { rotaTheme } from './rotaTheme';
import { type Palette, useThemePref } from './themePref';

const THEMES = { rota: rotaTheme, neutral: neutralTheme, stone: stoneTheme, matcha: matchaTheme, butter: butterTheme, chocolate: chocolateTheme } satisfies Record<Palette, unknown>;

/**
 * Tema do Astryx (design system da Meta) para o app inteiro, com a paleta e o modo (claro/escuro/sistema) que a pessoa
 * escolheu. As fontes dos temas não são carregadas (puxariam do Google Fonts); a fonte do app (Figtree) vem do
 * pacote `@fontsource-variable/figtree` e é imposta em `tailwind.css`.
 */
export function AppTheme({ children }: { children: ReactNode }) {
  const { mode, palette } = useThemePref();
  return <Theme theme={THEMES[palette]} mode={mode}>{children}</Theme>;
}
