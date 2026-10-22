import { useStore } from '../app/store';
import { Empty, Header, OrderPill } from './ui';

export function Volumes() {
  const { data } = useStore();
  const orders = data.orders.filter((o) => o.status !== 'delivered');
  return (
    <>
      <Header title="Cada caixa, no lugar certo." subtitle="Identifique a caixa física, o conteúdo e onde ela está guardada." />
      <section className="card">
        {orders.length === 0 ? <Empty>Nenhum volume em operação.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Entrega</th><th>Caixas</th><th>Frio</th><th>Congelado</th><th>Gás</th><th>Local</th><th>Status</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id} {o.name}</td>
                    <td>{o.boxes.length ? o.boxes.join(', ') : <span className="muted">Sem caixas</span>}</td>
                    <td>{o.cold}</td><td>{o.frozen}</td><td>{o.gas}</td><td>{o.cold || o.frozen ? o.storage : 'Área de expedição'}</td>
                    <td><OrderPill status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
