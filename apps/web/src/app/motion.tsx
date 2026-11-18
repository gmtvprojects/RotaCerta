import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { animate, motion, stagger, useMotionValue, useTransform, type Transition, type Variants } from 'motion/react';

/**
 * Movimento do sistema (biblioteca Motion). Tudo passa por aqui para o jeito de mexer ser o mesmo
 * em todas as telas: animado, mas contido. Entradas sobem ~15 px com fade em mola amortecida e cascata curta;
 * o toque afunda pouco. Sem desfoque e sem molas que balançam.
 * `prefers-reduced-motion` é respeitado: o `MotionConfig` em main.tsx desliga os transforms e
 * as funções imperativas abaixo checam `reduced()`.
 */
export const SNAPPY: Transition = { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 };
/** Mola com sobra mínima (amortecida): dá vida sem balançar. Usada em listas, páginas e janelas. */
export const BOUNCY: Transition = { type: 'spring', stiffness: 360, damping: 28, mass: 0.9 };
export const PRESS: Transition = { type: 'spring', stiffness: 600, damping: 32 };

export const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Itens que entram em cascata; use `Stagger` no pai e `Item` nos filhos. */
// `count` limita a cascata a ~0,4 s no total: listas grandes não ficam esperando a última linha.
const listFor = (count: number): Variants => ({ hidden: {}, show: { transition: { delayChildren: stagger(Math.min(0.04, 0.4 / Math.max(count, 1))) } } });
const item: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: BOUNCY },
};

type Tag = 'div' | 'ul' | 'ol' | 'section' | 'tbody';
export function Stagger({ as = 'div', className, count = 0, children }: { as?: Tag; className?: string; count?: number; children: ReactNode }) {
  const Comp = motion[as] as typeof motion.div;
  return <Comp className={className} variants={listFor(count)} initial="hidden" animate="show">{children}</Comp>;
}

export function Item({ as = 'div', className, children }: { as?: 'div' | 'li' | 'section' | 'tr'; className?: string; children: ReactNode }) {
  const Comp = motion[as] as typeof motion.div;
  return <Comp className={className} variants={item}>{children}</Comp>;
}

/**
 * Entrada de página: cada filho direto (cabeçalho, cartões, tabelas) sobe em cascata, em mola.
 * Usa `display: contents` para não mexer no layout. Roda uma vez, quando a tela abre.
 */
export function PageEnter({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    const kids = Array.from(el.children) as HTMLElement[];
    if (!kids.length) return;
    const a = animate(
      kids,
      { opacity: [0, 1], y: [16, 0], scale: [0.985, 1] },
      { ...BOUNCY, delay: stagger(0.05) },
    );
    return () => a.cancel();
  }, []);
  return <div ref={ref} style={{ display: 'contents' }}>{children}</div>;
}

/** Número que corre até o valor (e corre de novo quando ele muda). */
export function Counter({ to, className }: { to: number; className?: string }) {
  const value = useMotionValue(reduced() ? to : 0);
  const text = useTransform(value, (v) => Math.round(v).toString());
  useEffect(() => {
    if (reduced()) { value.set(to); return; }
    const c = animate(value, to, { duration: 0.8, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [to, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

/**
 * Toque que afunda levemente (e crescimento de 2% ao passar o mouse nos botões) em qualquer botão/cartão clicável do app, sem precisar trocar cada elemento
 * por `motion.*`: um único ouvinte no documento. Instalado uma vez em main.tsx.
 */
const PRESSABLE = 'button, .btn, .tile, .dock a, .m-row, .pill-btn, [role="button"]';
const SKIP = '.hold, .signin-submit, .palette-item, [disabled], [data-nomotion]';

export function installPressFeedback() {
  if (typeof document === 'undefined') return () => {};
  let down: HTMLElement | null = null;
  const find = (t: EventTarget | null) => {
    const el = (t as HTMLElement | null)?.closest?.(PRESSABLE) as HTMLElement | null;
    return el && !el.matches(SKIP) ? el : null;
  };
  const release = () => {
    if (!down) return;
    animate(down, { scale: 1 }, PRESS);
    down = null;
  };
  const onDown = (e: PointerEvent) => {
    if (reduced() || e.button !== 0) return;
    const el = find(e.target);
    if (!el) return;
    down = el;
    animate(el, { scale: 0.96 }, PRESS);
  };
  // passar o mouse: crescimento mínimo (2%) só em botões; linhas e cartões só mudam de cor
  const onOver = (e: PointerEvent) => {
    if (reduced() || e.pointerType !== 'mouse') return;
    const el = find(e.target);
    if (el && el !== down && !el.matches('.tile, .m-row, .rt-row') && !el.contains(e.relatedTarget as Node)) animate(el, { scale: 1.02 }, PRESS);
  };
  const onOut = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = find(e.target);
    if (el && el !== down && !el.contains(e.relatedTarget as Node)) animate(el, { scale: 1 }, PRESS);
  };
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointerover', onOver);
  document.addEventListener('pointerout', onOut);
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  return () => {
    document.removeEventListener('pointerover', onOver);
    document.removeEventListener('pointerout', onOut);
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('pointerup', release);
    document.removeEventListener('pointercancel', release);
  };
}
