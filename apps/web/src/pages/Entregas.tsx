import { useMemo, useState } from 'react';
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Icon } from '../app/icons';
import { Item, Stagger } from '../app/motion';
import { OrderDetail } from './OrderDetail';
import { Empty, Header, OrderPill, Tabs } from './ui';

type Tab = 'all' | 'open' | 'done';
const TABS: [Tab, string][] = [['all', 'Todas'], ['open', 'Em operação'], ['done', 'Encerradas']];
const isDone = (s: OrderStatus) => s === 'delivered' || s === 'failed' || s === 'cancelled';
const narrow = () => window.matchMedia('(max-width: 900px)').matches;

/** Consulta de entregas (layout do Rota): busca + filtros, abas em pílula, lista à esquerda e detalhe à direita. */
export function Entregas() {
  const { data } = useStore();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [tab, setTab] = useState<Tab>('all');
  const [hood, setHood] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selId, setSelId] = useState<number | null>(null);
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
  const selected: Order | undefined = rows.find((o) => o.id === selId) ?? rows[0];
  const pick = (o: Order) => (narrow() ? setOpenId(o.id) : setSelId(o.id));

  return (
    <>
      <Header title="Entregas" subtitle="Encontre uma compra pelo cliente ou pelo código." actions={<>
        <label className="rt-search"><Icon name="search" size={18} />
          <input type="search" aria-label="Buscar por código, cliente ou caixa" placeholder="Código ou cliente" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}><Icon name="list" size={18} />Filtros{status || hood ? ' •' : ''}</button>
      </>} />

      {showFilters && (
        <div className="rt-filters">
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
            <option value="">Todos os status</option>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
          </select>
          <select aria-label="Bairro" value={hood} onChange={(e) => setHood(e.target.value)}>
            <option value="">Todos os bairros</option>
            {data.neighborhoods.map((n) => <option key={n.name}>{n.name}</option>)}
          </select>
          {filtered && <button type="button" onClick={clear}>Limpar filtros</button>}
        </div>
      )}

      <Tabs value={tab} onChange={(v) => setTab(v as typeof tab)} label="Situação das entregas" items={TABS.map(([k, label]) => ({ value: k, label: `${label} (${data.orders.filter((o) => k === 'all' || (k === 'done') === isDone(o.status)).length})` }))} />

      {rows.length === 0 ? <Empty>Nenhuma entrega encontrada. Tente outro nome ou remova os filtros.</Empty> : (
        <div className="rt-split">
          <Stagger as="ul" className="rt-list rt-main" key={`l-${tab}|${status}|${hood}`} count={rows.length}>
            {rows.map((o) => (
              <Item as="li" key={o.id}>
                <button type="button" className={`rt-item ${selected?.id === o.id ? 'on' : ''}`} aria-current={selected?.id === o.id} onClick={() => pick(o)}>
                  <span className="rt-name"><b>{o.name}</b><small>#{o.id} · {o.street}, {o.number} · {o.neighborhood}</small></span>
                  <span className="rt-when">{o.window}</span>
                  <OrderPill status={o.status} />
                </button>
              </Item>
            ))}
          </Stagger>

          {selected && (
            <aside className="card rt-aside rt-side" aria-label="Detalhe da entrega">
              <div className="rt-aside-head">
                <div><h2>{selected.name}</h2><span className="muted">#{selected.id} · {selected.phone}</span></div>
                <OrderPill status={selected.status} />
              </div>
              <div className="rt-kv"><span>Janela de entrega</span><b>{selected.window}</b></div>
              <div className="rt-kv"><span>Endereço</span><b>{selected.street}, {selected.number} — {selected.neighborhood}</b></div>
              <div className="rt-kv"><span>Volumes</span><b>{selected.boxes.length ? `${selected.boxes.length} caixa(s)` : 'sem caixas'}</b></div>
              <ol className="rt-timeline" aria-label="Histórico">
                {selected.history.slice().reverse().slice(0, 4).map((h, i) => (
                  <li key={i} className={i === 0 ? 'now' : ''}><span /><div><b>{h.label}</b><small>{h.time} · {h.actor}</small></div></li>
                ))}
              </ol>
              <div className="rt-aside-actions"><button type="button" className="primary" onClick={() => setOpenId(selected.id)}>Ver detalhes</button></div>
            </aside>
          )}
        </div>
      )}
      {openId != null && <OrderDetail orderId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
