import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ORDER_STATUS_LABELS, ROUTE_STATUS_LABELS, type Order, type Route } from '@rotacerta/domain';
import { Icon } from '../app/icons';
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

export const OrderPill = ({ status }: { status: Order['status'] }) => (
  <span className={`pill ${ORDER_TONE[status]}`}>{ORDER_STATUS_LABELS[status]}</span>
);

const ROUTE_TONE: Record<Route['status'], string> = { loading: 'amber', released: 'blue', active: 'violet', finished: 'green' };
export const RoutePill = ({ status }: { status: Route['status'] }) => (
  <span className={`pill ${ROUTE_TONE[status]}`}>{ROUTE_STATUS_LABELS[status]}</span>
);

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
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
