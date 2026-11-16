import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ORDER_STATUS_LABELS, ROUTE_STATUS_LABELS, type Order, type Route } from '@rotacerta/domain';
import { motion } from 'motion/react';
import { Badge } from 'astrixui/components/ui/badge.js';
import { Icon } from '../app/icons';
import { SPRING } from '../app/motion';
import { SlideUpText } from '../app/SlideUpText';

export function Header({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div><h1><SlideUpText>{title}</SlideUpText></h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

const ORDER_TONE: Record<Order['status'], string> = {
  draft: 'gray', awaiting: 'amber', ready: 'blue', queued: 'blue', loading: 'amber',
  released: 'blue', onroute: 'violet', delivered: 'green', failed: 'red', cancelled: 'gray',
};

const TONES: Record<string, string> = {
  gray: 'bg-secondary text-muted-foreground',
  green: 'bg-[color-mix(in_srgb,var(--green)_15%,var(--card))] text-[var(--green)]',
  red: 'bg-[color-mix(in_srgb,var(--red)_14%,var(--card))] text-[var(--red)]',
  amber: 'bg-[color-mix(in_srgb,var(--amber)_15%,var(--card))] text-[var(--amber)]',
  blue: 'bg-accent text-primary',
  violet: 'bg-[color-mix(in_srgb,var(--violet)_15%,var(--card))] text-[var(--violet)]',
};
const Pill = ({ tone, children }: { tone: string; children: ReactNode }) => (
  <Badge className={`badge-dot whitespace-nowrap border-transparent py-[3px] hover:opacity-100 ${TONES[tone]}`}>{children}</Badge>
);

export const OrderPill = ({ status }: { status: Order['status'] }) => <Pill tone={ORDER_TONE[status]}>{ORDER_STATUS_LABELS[status]}</Pill>;

const ROUTE_TONE: Record<Route['status'], string> = { loading: 'amber', released: 'blue', active: 'violet', finished: 'green' };
export const RoutePill = ({ status }: { status: Route['status'] }) => <Pill tone={ROUTE_TONE[status]}>{ROUTE_STATUS_LABELS[status]}</Pill>;

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <motion.div className="backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
      <motion.div className="modal" initial={{ opacity: 0, y: 28, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Botão de segurar para confirmar: evita mudar o estado de uma entrega com um toque sem querer.
 * A faixa verde preenche enquanto a pessoa segura (dedo, mouse, Espaço ou Enter); soltar antes cancela.
 */
export function HoldButton({ label, doneLabel, onConfirm, holdMs = 1100 }: { label: string; doneLabel: string; onConfirm: () => void; holdMs?: number }) {
  const [state, setState] = useState<'idle' | 'holding' | 'done'>('idle');
  const confirm = useRef(onConfirm);
  confirm.current = onConfirm;

  useEffect(() => {
    if (state === 'idle') return;
    // segurando: conclui ao fim do tempo; concluído: mostra a confirmação por um instante antes de avisar a tela
    const timer = window.setTimeout(() => (state === 'holding' ? setState('done') : confirm.current()), state === 'holding' ? holdMs : 450);
    return () => window.clearTimeout(timer);
  }, [state, holdMs]);

  const start = () => setState((s) => (s === 'idle' ? 'holding' : s));
  const cancel = () => setState((s) => (s === 'holding' ? 'idle' : s));
  const isKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter';

  const content = (
    <span className="hold-in"><Icon name={state === 'done' ? 'check' : 'pin'} />{state === 'done' ? doneLabel : label}</span>
  );
  return (
    <button type="button" className="hold" data-state={state} style={{ '--hold-ms': `${holdMs}ms` } as CSSProperties}
      onPointerDown={(e) => { if (e.button === 0) start(); }} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onKeyDown={(e) => { if (isKey(e)) { e.preventDefault(); if (!e.repeat) start(); } }} onKeyUp={(e) => { if (isKey(e)) cancel(); }}
      onBlur={cancel} onContextMenu={(e) => e.preventDefault()}>
      {content}
      <span className="hold-fill" aria-hidden="true">{content}</span>
      <span className="sr-only" role="status">{state === 'done' ? doneLabel : ''}</span>
    </button>
  );
}
