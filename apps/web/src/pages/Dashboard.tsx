import { useState } from 'react';
import { useStore } from '../app/store';
import { OrderDetail } from './OrderDetail';
import { Header, OrderPill } from './ui';

export function Dashboard() {
  const { data } = useStore();
  const [openId, setOpenId] = useState<number | null>(null);
  const count = (s: string) => data.orders.filter((o) => o.status === s).length;
  const kpis = [
    ['Entregas de hoje', data.orders.length],
    ['Aguardando volumes', count('awaiting')],
    ['Prontas para planejar', count('ready')],
    ['Em rota', count('onroute')],
    ['Concluídas', count('delivered')],
  ] as const;

  return (
    <>
      <Header title="A operação, em movimento." subtitle="Do caixa à porta do cliente. Tudo no mesmo lugar." />
      <div className="kpis">
        {kpis.map(([label, value]) => (
          <div key={label} className="card kpi"><span className="muted">{label}</span><strong>{value}</strong></div>
        ))}
      </div>
      <section className="card">
        <h2>Entregas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Entrega / cliente</th><th>Bairro</th><th>Horário</th><th>Volumes</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.orders.slice(0, 12).map((o) => (
                <tr key={o.id}>
                  <td><strong>#{o.id}</strong> {o.name}</td><td>{o.neighborhood}</td><td>{o.window}</td>
                  <td>{o.boxes.length}</td><td><OrderPill status={o.status} /></td><td><button type="button" onClick={() => setOpenId(o.id)}>Detalhes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {openId != null && <OrderDetail orderId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
