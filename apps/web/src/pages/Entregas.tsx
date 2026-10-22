import { useMemo, useState } from 'react';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { OrderDetail } from './OrderDetail';
import { Empty, Header, OrderPill } from './ui';

type Tab = 'all' | 'open' | 'done';
const TABS: [Tab, string][] = [['all', 'Todas'], ['open', 'Em operação'], ['done', 'Encerradas']];
const isDone = (s: OrderStatus) => s === 'delivered' || s === 'failed';

export function Entregas() {
  const { data } = useStore();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [tab, setTab] = useState<Tab>('all');
  const [hood, setHood] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.orders.filter((o) =>
      (tab === 'all' || (tab === 'done') === isDone(o.status)) &&
      (!status || o.status === status) && (!hood || o.neighborhood === hood) &&
      (!q || o.name.toLowerCase().includes(q) || String(o.id).includes(q) || o.boxes.some((b) => b.toLowerCase().includes(q))));
  }, [data.orders, query, status, tab, hood]);

  const filtered = !!(query || status || hood);
  const clear = () => { setQuery(''); setStatus(''); setHood(''); };

  return (
    <>
      <Header title="Consultar entregas." subtitle="Encontre uma compra pelo cliente ou pelo código." />
      <div className="chips">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className={tab === k ? 'chip on' : 'chip'} onClick={() => setTab(k)}>
            {label} ({data.orders.filter((o) => k === 'all' || (k === 'done') === isDone(o.status)).length})
          </button>
        ))}
      </div>
      <section className="card">
        <div className="filters">
          <input placeholder="Cliente, código ou caixa" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
            <option value="">Todos os status</option>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
          </select>
          <select value={hood} onChange={(e) => setHood(e.target.value)}>
            <option value="">Todos os bairros</option>
            {data.neighborhoods.map((n) => <option key={n.name}>{n.name}</option>)}
          </select>
          {filtered && <button type="button" onClick={clear}>Limpar filtros</button>}
        </div>
        <p className="muted small">{rows.length} entrega(s)</p>
        {rows.length === 0 ? <Empty>Nenhuma entrega encontrada. Tente outro nome ou remova os filtros.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Código</th><th>Cliente</th><th>Endereço</th><th>Janela</th><th>Caixas</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id}</td><td>{o.name}<div className="muted small">{o.phone}</div></td>
                    <td>{o.street}, {o.number} · {o.neighborhood}</td><td>{o.window}</td>
                    <td>{o.boxes.length || '—'}</td><td><OrderPill status={o.status} /></td>
                    <td><button type="button" onClick={() => setOpenId(o.id)}>Detalhes</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {openId != null && <OrderDetail orderId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
