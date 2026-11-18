import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ORDER_STATUS_LABELS, ROUTE_STATUS_LABELS, type Order, type Route } from '@rotacerta/domain';
import { Icon, type IconName } from '../app/icons';
import { SlideUpText } from '../app/SlideUpText';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog } from '@base-ui/react/dialog';
import { BOUNCY } from '../app/motion';

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

/**
 * Janela de diálogo. Base UI cuida do que é difícil (foco preso, Escape, rolagem travada, leitor de tela)
 * e o Motion anima entrada e saída. Quem chama continua usando `onClose`: ele só roda quando a
 * animação de saída termina; se a tela fechar o modal por conta própria, ele some na hora.
 */
export function Modal({ title, onClose, children, footer, icon, tone = 'info' }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
  /** Ícone em círculo acima do título, como nos diálogos do Rota (cancelar, avaliar, filtros). */
  icon?: IconName; tone?: 'info' | 'danger' | 'success';
}) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) setOpen(false); }}>
      <AnimatePresence onExitComplete={onClose}>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop render={<motion.div className="fixed inset-0 z-50 bg-[rgb(2_8_22/.72)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />} />
            <Dialog.Viewport className="fixed inset-0 z-[51] grid place-items-center p-4">
              <Dialog.Popup render={<motion.div className="modal" aria-label={title}
                initial={{ opacity: 0, scale: 0.8, y: 60, rotateX: 14 }} animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30, transition: { duration: 0.14 } }} transition={BOUNCY} />}>
                {icon && <span className={`modal-icon ${tone}`} aria-hidden="true"><Icon name={icon} size={22} /></span>}
                <Dialog.Title render={<h2 />}>{title}</Dialog.Title>
                <div className="modal-body">{children}</div>
                <div className="modal-foot">{footer}</div>
              </Dialog.Popup>
            </Dialog.Viewport>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
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
