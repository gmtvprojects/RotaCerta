import type { Order } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header, OrderPill } from './ui';

const place = (o: Order) => (o.cold || o.frozen ? o.storage : 'Área de expedição');

export function Volumes() {
  const { data } = useStore();
  const orders = data.orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  return (
    <>
      <Header title="Cada caixa, no lugar certo." subtitle="Identifique a caixa física, o conteúdo e onde ela está guardada." />
      <section className="card">
        {orders.length === 0 ? <Empty>Nenhum volume em operação.</Empty> : (
          <>
            <div className="table-wrap has-cards">
              <table>
                <thead><tr><th>Entrega</th><th>Caixas</th><th>Frio</th><th>Congelado</th><th>Gás</th><th>Local</th><th>Status</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>#{o.id} {o.name}</td>
                      <td>{o.boxes.length ? o.boxes.join(', ') : <span className="muted">Sem caixas</span>}</td>
                      <td>{o.cold}</td><td>{o.frozen}</td><td>{o.gas}</td><td>{place(o)}</td>
                      <td><OrderPill status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="m-list">
              {orders.map((o) => (
                <li key={o.id} className="m-row">
                  <span className="m-title"><span className="m-code">#{o.id}</span>{o.name}</span>
                  <span className="m-end"><OrderPill status={o.status} /></span>
                  <span className="m-tags">
                    {o.boxes.length ? o.boxes.map((b) => <span key={b} className="tag">{b}</span>) : <span className="muted small">Sem caixas</span>}
                  </span>
                  <span className="m-tags">
                    {o.cold > 0 && <span className="tag cold">Frio {o.cold}</span>}
                    {o.frozen > 0 && <span className="tag frozen">Congelado {o.frozen}</span>}
                    {o.gas > 0 && <span className="tag gas">Gás {o.gas}</span>}
                    <span className="muted small">{place(o)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
