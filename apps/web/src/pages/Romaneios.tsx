import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ROUTE_STATUS_LABELS, type Route } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Icon } from '../app/icons';
import { Item, Stagger } from '../app/motion';
import { Empty, Header, OrderPill, RoutePill, Tabs } from './ui';

type Filter = 'all' | Route['status'];
const FILTERS: Filter[] = ['all', 'loading', 'released', 'active', 'finished'];

/** Romaneios (layout do Rota): abas por situação, lista à esquerda e as paradas do escolhido à direita. */
export function Romaneios() {
  const { data } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [selId, setSelId] = useState<number | null>(null);
  // vindo da busca do topo (?romaneio=ID): mostra todos e seleciona o romaneio
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = Number(params.get('romaneio'));
    if (id) { setFilter('all'); setSelId(id); setParams({}, { replace: true }); }
  }, [params, setParams]);
  const routes = data.routes.slice().reverse().filter((r) => filter === 'all' || r.status === filter);
  const selected = routes.find((r) => r.id === selId) ?? routes[0];

  const info = (r: Route) => {
    const vehicle = data.vehicles.find((v) => v.id === r.vehicleId);
    const driver = data.drivers.find((d) => d.id === r.driverId);
    return `${vehicle?.name ?? 'Sem veículo'} · saída ${r.departure} · ${driver?.name ?? 'sem motorista'}`;
  };

  return (
    <>
      <Header title="Romaneios" subtitle="Uma referência única para carregar, conferir e entregar."
        actions={<button type="button" onClick={() => window.print()}><Icon name="list" size={18} />Imprimir</button>} />

      <Tabs value={filter} onChange={(v) => setFilter(v as typeof filter)} label="Situação dos romaneios" items={FILTERS.map((f) => ({ value: f, label: `${f === 'all' ? 'Todos' : ROUTE_STATUS_LABELS[f]} (${data.routes.filter((r) => f === 'all' || r.status === f).length})` }))} />

      {routes.length === 0 ? <Empty>Nenhum romaneio {filter === 'all' ? 'criado' : 'nesta situação'}.</Empty> : (
        <div className="rt-split">
          <Stagger as="ul" className="rt-list rt-main" key={filter} count={routes.length}>
            {routes.map((r) => (
              <Item as="li" key={r.id}>
                <button type="button" className={`rt-item ${selected?.id === r.id ? 'on' : ''}`} aria-current={selected?.id === r.id} onClick={() => { setSelId(r.id); if (window.matchMedia('(max-width: 900px)').matches) document.getElementById('rt-route-aside')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                  <span className="rt-name"><b>Romaneio #{r.id}</b><small>{info(r)}</small></span>
                  <span className="rt-when">{r.orders.length} parada(s)</span>
                  <RoutePill status={r.status} />
                </button>
              </Item>
            ))}
          </Stagger>

          {selected && (
            <aside id="rt-route-aside" className="card rt-aside rt-side rt-aside-always" aria-label={`Paradas do romaneio #${selected.id}`}>
              <div className="rt-aside-head">
                <div><h2>Romaneio #{selected.id}</h2><span className="muted">{info(selected)}</span></div>
                <RoutePill status={selected.status} />
              </div>
              <ol className="rt-steps">
                {selected.orders.map((id, i) => {
                  const o = data.orders.find((x) => x.id === id);
                  if (!o) return null;
                  const tone = o.status === 'delivered' ? 'ok' : o.status === 'onroute' ? 'now' : 'todo';
                  return (
                    <li key={id} className={tone}>
                      <span />
                      <div className="rt-step-row">
                        <div><b>{i + 1}. {o.name}</b><small>{o.street}, {o.number} · {o.neighborhood} · {o.boxes.length} volume(s)</small></div>
                        <OrderPill status={o.status} />
                      </div>
                    </li>
                  );
                })}
              </ol>
              {selected.status === 'loading' && <div className="rt-aside-actions"><Link className="btn primary" to="/carregamento">Conferir carga</Link></div>}
            </aside>
          )}
        </div>
      )}
    </>
  );
}
