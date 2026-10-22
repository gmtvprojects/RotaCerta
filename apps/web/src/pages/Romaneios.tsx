import { useStore } from '../app/store';
import { Empty, Header, OrderPill, RoutePill } from './ui';

export function Romaneios() {
  const { data } = useStore();
  const routes = data.routes.slice().reverse();
  return (
    <>
      <Header title="Romaneios" subtitle="Uma referência única para carregar, conferir e entregar." />
      {routes.length === 0 ? <Empty>Nenhum romaneio criado.</Empty> : routes.map((r) => {
        const vehicle = data.vehicles.find((v) => v.id === r.vehicleId);
        const driver = data.drivers.find((d) => d.id === r.driverId);
        return (
          <section key={r.id} className="card">
            <div className="card-head">
              <h2>Romaneio #{r.id}</h2><RoutePill status={r.status} />
              <span className="muted">{vehicle?.name} · saída {r.departure} · {driver?.name ?? 'sem motorista'}</span>
              <button type="button" onClick={() => window.print()}>Imprimir</button>
            </div>
            <ol className="stops">
              {r.orders.map((id) => {
                const o = data.orders.find((x) => x.id === id);
                return o && (
                  <li key={id}>
                    <div><strong>{o.name}</strong><div className="muted small">{o.street}, {o.number} · {o.neighborhood} · {o.boxes.length} volumes</div></div>
                    <OrderPill status={o.status} />
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </>
  );
}
