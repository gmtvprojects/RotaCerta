import { useMemo, useState } from 'react';
import { IonContent, IonIcon, IonPage } from '@ionic/react';
import { optionsOutline } from 'ionicons/icons';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@rotacerta/domain';
import { useSession } from '../session';
import { OrderPill, Sheet } from '../ui';

type Tab = 'all' | 'todo' | 'delivered' | 'failed';
const TABS: [Tab, string][] = [['all', 'Todas'], ['todo', 'A fazer'], ['delivered', 'Entregues'], ['failed', 'Não entregues']];

/** Entregas do motorista (layout "Entregas" do Rota): abas em pílula, folha de filtros e lista em cartões. */
export function Entregas() {
  const { data, driverId } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const [routeFilter, setRouteFilter] = useState<number | 'all'>('all');
  const [filters, setFilters] = useState(false);

  const myRoutes = useMemo(() => (data ? data.routes.filter((r) => r.driverId === driverId) : []), [data, driverId]);
  const orders = useMemo(() => {
    if (!data) return [];
    const ids = new Set((routeFilter === 'all' ? myRoutes : myRoutes.filter((r) => r.id === routeFilter)).flatMap((r) => r.orders));
    return data.orders.filter((o) => ids.has(o.id)).filter((o) =>
      tab === 'all' || (tab === 'todo' && o.status === 'onroute') || o.status === (tab as OrderStatus));
  }, [data, myRoutes, routeFilter, tab]);

  return (
    <IonPage>
      <IonContent>
        <div className="r-page">
          <div className="r-head">
            <h1 className="r-h1">Entregas</h1>
            <button type="button" className="r-icon-btn" aria-label="Filtros" onClick={() => setFilters(true)}><IonIcon icon={optionsOutline} /></button>
          </div>
          <div className="r-chips" role="tablist">
            {TABS.map(([k, label]) => <button key={k} type="button" role="tab" className="r-chip solid" aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}
          </div>
          {orders.length === 0 ? <p className="r-muted">Nenhuma entrega nesta lista.</p> : (
            <div className="r-list">
              {orders.map((o) => (
                <div key={o.id} className="r-item">
                  <div className="r-row-main">
                    <b>{o.name}</b>
                    <small>#{o.id} · {o.street}, {o.number} · {o.neighborhood}</small>
                    <small>{o.window}{o.receiver ? ` · recebido por ${o.receiver}` : ''}{o.occurrence ? ` · ${o.occurrence.reason}` : ''}</small>
                  </div>
                  <OrderPill status={o.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <Sheet open={filters} onClose={() => setFilters(false)} title="Filtros">
          <div className="r-field">Romaneio
            <div className="r-chips">
              <button type="button" className="r-chip" aria-pressed={routeFilter === 'all'} onClick={() => setRouteFilter('all')}>Todos</button>
              {myRoutes.map((r) => <button key={r.id} type="button" className="r-chip" aria-pressed={routeFilter === r.id} onClick={() => setRouteFilter(r.id)}>#{r.id}</button>)}
            </div>
          </div>
          <div className="r-field">Situação
            <div className="r-seg" role="group" aria-label="Situação">
              {TABS.map(([k, label]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}
            </div>
          </div>
          <p className="r-small r-muted" style={{ margin: 0 }}>{ORDER_STATUS_LABELS.onroute}: paradas que ainda faltam na viagem.</p>
          <button type="button" className="r-btn primary" onClick={() => setFilters(false)}>Ver {orders.length} entrega(s)</button>
        </Sheet>
      </IonContent>
    </IonPage>
  );
}
