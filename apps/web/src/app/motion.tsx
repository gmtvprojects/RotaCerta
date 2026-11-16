import { animate, stagger, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

/** Curva de saída suave usada em todo o app. */
export const EASE = [0.16, 1, 0.3, 1] as const;
/** Mola padrão dos elementos que "encaixam" (doca, janelas). */
export const SPRING = { type: 'spring', stiffness: 380, damping: 32 } as const;

const REVEAL = '.page-head, .card, .kpi, .tile, .banner, .stops > li, [data-card]';

/**
 * Envolve cada tela: ao abrir, o cabeçalho, os quadros e as listas entram em cascata (sobem e aparecem).
 * Age sobre o que já existe no DOM, então as telas não precisam saber de animação.
 */
export function Stage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    if (reduce || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(REVEAL)).slice(0, 30);
    if (items.length === 0) return;
    const run = animate(items, { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0px)'] },
      { duration: 0.5, ease: EASE, delay: stagger(0.05) });
    return () => run.stop();
  }, [reduce]);

  return <div ref={ref}>{children}</div>;
}

/** Número que "conta" até o valor novo (painéis e indicadores). */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) { el.textContent = String(value); from.current = value; return; }
    const run = animate(from.current, value, {
      duration: 0.9, ease: EASE,
      onUpdate: (v) => { from.current = v; el.textContent = String(Math.round(v)); },
    });
    return () => run.stop();
  }, [value, reduce]);

  return <span ref={ref} className="count">{value}</span>;
}
