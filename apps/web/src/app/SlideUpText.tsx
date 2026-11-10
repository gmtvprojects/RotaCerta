import type { CSSProperties, MouseEvent } from 'react';

/**
 * Texto que sobe: cada palavra aparece de trás de uma máscara, uma depois da outra.
 * Mesmos tempos do SlideUpText do Spell UI (0,5 s por palavra, curva .625,.05,0,1), só com CSS.
 * Ao passar o mouse, a palavra sai por cima e volta por baixo (só se não estiver animando).
 * Use uma vez por tela, no título. O texto completo fica em `aria-label` para leitores de tela.
 */
const EASE = 'cubic-bezier(.625, .05, 0, 1)';
const ROLL: Keyframe[] = [
  { transform: 'none', easing: 'cubic-bezier(.55, 0, .9, .4)' },
  { transform: 'translateY(-115%)', offset: 0.4 },
  { transform: 'translateY(115%)', offset: 0.4, easing: EASE },
  { transform: 'none' },
];

function roll(e: MouseEvent<HTMLElement>) {
  const word = e.currentTarget.firstElementChild as HTMLElement | null;
  if (!word || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (word.getAnimations().some((a) => a.playState === 'running')) return;
  word.animate(ROLL, { duration: 650 });
}

export function SlideUpText({ children, stagger = 0.08, delay = 0, className }: { children: string; stagger?: number; delay?: number; className?: string }) {
  let n = 0;
  return (
    <span className={className} aria-label={children.replace(/\n/g, ' ')} key={children}>
      {children.split('\n').map((line, li) => (
        <span key={li} className="su-line" aria-hidden="true">
          {line.split(' ').map((word, wi) => (
            <span key={wi}>
              {wi > 0 && ' '}
              <span className="su-mask" onMouseEnter={roll}><span className="su-word" style={{ animationDelay: `${delay + n++ * stagger}s` } as CSSProperties}>{word}</span></span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
