import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ORDER_STATUS_LABELS, ROUTE_STATUS_LABELS, type Order, type Route } from '@rotacerta/domain';
import { Icon, type IconName } from '../app/icons';
import { Badge, type BadgeProps } from '@astryxdesign/core/Badge';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';

export function Header({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div><Heading level={1}>{title}</Heading>{subtitle && <Text color="secondary">{subtitle}</Text>}</div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

type BadgeVariant = NonNullable<BadgeProps['variant']>;

const ORDER_TONE: Record<Order['status'], string> = {
  draft: 'gray', awaiting: 'amber', ready: 'blue', queued: 'blue', loading: 'amber',
  released: 'blue', onroute: 'violet', delivered: 'green', failed: 'red', cancelled: 'gray',
};

/** Cor do selo de estado → variante do Badge do Astryx. */
const BADGE: Record<string, BadgeVariant> = { gray: 'neutral', amber: 'orange', blue: 'blue', violet: 'purple', green: 'green', red: 'red' };

export const OrderPill = ({ status }: { status: Order['status'] }) => (
  <Badge variant={BADGE[ORDER_TONE[status]]} label={ORDER_STATUS_LABELS[status]} />
);

const ROUTE_TONE: Record<Route['status'], string> = { loading: 'amber', released: 'blue', active: 'violet', finished: 'green' };
export const RoutePill = ({ status }: { status: Route['status'] }) => (
  <Badge variant={BADGE[ROUTE_TONE[status]]} label={ROUTE_STATUS_LABELS[status]} />
);

/** Abas/filtros da tela (TabList do Astryx). `value` vazio é permitido: vira o item "todos". */
export function Tabs({ value, onChange, items, label }: { value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }>; label?: string }) {
  const ALL = '__todos';
  return (
    <div className="tabs-row">
      <TabList value={value === '' ? ALL : value} onChange={(v) => onChange(v === ALL ? '' : v)} aria-label={label}>
        {items.map((i) => <Tab key={i.value || ALL} value={i.value === '' ? ALL : i.value} label={i.label} />)}
      </TabList>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

/**
 * Janela de diálogo (Dialog do Astryx: foco preso, Escape, rolagem travada, leitor de tela e animação já resolvidos).
 * Quem chama continua usando `onClose`, que roda quando a pessoa fecha pelo X, por Escape ou fora da janela.
 */
export function Modal({ title, onClose, children, footer, icon, tone = 'info', width = 520 }: {
  width?: number;
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
  /** Ícone ao lado do título (cancelar, avaliar, filtros). */
  icon?: IconName; tone?: 'info' | 'danger' | 'success';
}) {
  return (
    <Dialog isOpen onOpenChange={(open) => { if (!open) onClose(); }} width={width}>
      <div className="modal flat">
      <DialogHeader
        title={title}
        onOpenChange={(open) => { if (!open) onClose(); }}
        startContent={icon ? <span className={`modal-icon ${tone}`} aria-hidden="true"><Icon name={icon} size={18} /></span> : undefined}
      />
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </Dialog>
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
