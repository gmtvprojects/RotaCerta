import type { ReactNode } from 'react';
import { ORDER_STATUS_LABELS, ROUTE_STATUS_LABELS, type Order, type Route } from '@rotacerta/domain';

export function Header({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

const ORDER_TONE: Record<Order['status'], string> = {
  draft: 'gray', awaiting: 'amber', ready: 'blue', queued: 'blue', loading: 'amber',
  released: 'blue', onroute: 'violet', delivered: 'green', failed: 'red',
};

export const OrderPill = ({ status }: { status: Order['status'] }) => (
  <span className={`pill ${ORDER_TONE[status]}`}>{ORDER_STATUS_LABELS[status]}</span>
);

const ROUTE_TONE: Record<Route['status'], string> = { loading: 'amber', released: 'blue', active: 'violet', finished: 'green' };
export const RoutePill = ({ status }: { status: Route['status'] }) => (
  <span className={`pill ${ROUTE_TONE[status]}`}>{ROUTE_STATUS_LABELS[status]}</span>
);

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
