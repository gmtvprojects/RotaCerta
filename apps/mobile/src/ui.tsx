import type { ReactNode } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { ORDER_STATUS_LABELS, ROUTE_STATUS_LABELS, type Order, type Route } from '@rotacerta/domain';

const ORDER_TONE: Record<Order['status'], string> = {
  draft: '', awaiting: 'amber', ready: 'blue', queued: 'blue', loading: 'amber',
  released: 'blue', onroute: 'out', delivered: 'green', failed: 'red', cancelled: '',
};
export const OrderPill = ({ status }: { status: Order['status'] }) => <span className={`r-pill ${ORDER_TONE[status]}`}>{ORDER_STATUS_LABELS[status]}</span>;

const ROUTE_TONE: Record<Route['status'], string> = { loading: 'amber', released: 'blue', active: 'out', finished: 'green' };
export const RoutePill = ({ status }: { status: Route['status'] }) => <span className={`r-pill ${ROUTE_TONE[status]}`}>{ROUTE_STATUS_LABELS[status]}</span>;

export const initials = (name: string) => name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const today = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });

/** Folha que sobe de baixo, com puxador, título e fechar (Filtros / Avaliar / Cancelar do Rota). */
export function Sheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} className="r-sheet" initialBreakpoint={1} breakpoints={[0, 1]} handle>
      <div className="r-sheet-body">
        <div className="r-sheet-head">
          <div><h1 className="r-h1">{title}</h1>{subtitle && <span className="r-caption">{subtitle}</span>}</div>
          <button type="button" className="r-close" aria-label="Fechar" onClick={onClose}><IonIcon icon={closeOutline} /></button>
        </div>
        {children}
      </div>
    </IonModal>
  );
}

/** Bloco do mapa: desenho simples da rota e botão que abre o endereço no app de mapas do aparelho. */
export function MapCard({ address }: { address: string }) {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return (
    <div className="r-map">
      <svg viewBox="0 0 358 168" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40h358M0 96h358M0 140h358M60 0v168M150 0v168M250 0v168" stroke="var(--r-line)" strokeWidth="1" fill="none" />
        <path d="M30 150 C 90 140, 100 90, 150 96 S 230 50, 300 40" stroke="#34d399" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M300 40 L 330 24" stroke="var(--r-muted)" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" fill="none" />
        <circle cx="150" cy="96" r="7" fill="#7fa8ff" stroke="#e7eefc" strokeWidth="2" />
        <circle cx="330" cy="24" r="7" fill="var(--r-card)" stroke="#e7eefc" strokeWidth="2.5" />
      </svg>
      <a className="r-btn dark" href={url} target="_blank" rel="noopener noreferrer">Abrir no mapa</a>
    </div>
  );
}
