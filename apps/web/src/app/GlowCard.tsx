import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Quadro cuja borda acende onde o cursor está (adaptado do CursorCard, sem motion/Tailwind).
 * O ponteiro é lido no documento inteiro: a luz da borda vai sumindo com a distância (raio do
 * gradiente em `--glow-r`) e o brilho interno só liga perto do quadro. A posição vai direto
 * para variáveis CSS, sem re-renderizar.
 */
const REACH = 140;   // px fora do quadro em que o brilho interno já liga

export function GlowCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(hover: hover)').matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const near = e.clientX > r.left - REACH && e.clientX < r.right + REACH && e.clientY > r.top - REACH && e.clientY < r.bottom + REACH;
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
      el.toggleAttribute('data-lit', near);
    };
    const leave = () => {
      el.removeAttribute('data-lit');
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
    };
    document.addEventListener('pointermove', move);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      document.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, []);

  return <div ref={ref} className={`glow-card ${className}`}>{children}</div>;
}
