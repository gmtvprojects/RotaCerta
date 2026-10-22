import { useMemo, useState } from 'react';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header, OrderPill } from './ui';

export function Entregas() {
  const { data } = useStore();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.orders.filter((o) =>
      (!status || o.status === status) &&
      (!q || o.name.toLowerCase().includes(q) || String(o.id).includes(q) || o.boxes.some((b) => b.toLowerCase().includes(q))));
  }, [data.orders, query, status]);

  return (
    <>
      <Header title="Consultar entregas." subtitle="Encontre uma compra pelo cliente ou pelo código." />
      <section className="card">
        <div className="filters">
          <input placeholder="Cliente, código ou caixa" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
            <option value="">Todos os status</option>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        {rows.length === 0 ? <Empty>Nenhuma entrega encontrada.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Código</th><th>Cliente</th><th>Endereço</th><th>Janela</th><th>Caixas</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id}</td><td>{o.name}<div className="muted small">{o.phone}</div></td>
                    <td>{o.street}, {o.number} · {o.neighborhood}</td><td>{o.window}</td>
                    <td>{o.boxes.length || '—'}</td><td><OrderPill status={o.status} /></td>
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
