import { useState } from 'react';
import type { Order } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Icon } from '../app/icons';
import { Counter, Item, Stagger } from '../app/motion';
import { Empty, Header, OrderPill, Tabs } from './ui';

const place = (o: Order) => (o.cold || o.frozen ? o.storage : 'Área de expedição');
type Filter = 'all' | 'cold' | 'gas' | 'none';

/** Volumes e caixas (layout do Rota): números do dia, abas e uma linha por entrega com os selos de cada volume. */
export function Volumes() {
  const { data } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const open = data.orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const needle = q.trim().toLowerCase();
  const orders = open.filter((o) =>
    (filter === 'all' || (filter === 'cold' && (o.cold || o.frozen)) || (filter === 'gas' && o.gas) || (filter === 'none' && !o.boxes.length)) &&
    (!needle || o.name.toLowerCase().includes(needle) || String(o.id).includes(needle) || o.boxes.some((b) => b.toLowerCase().includes(needle))));
  const boxes = open.reduce((n, o) => n + o.boxes.length, 0);
  const cold = open.filter((o) => o.cold || o.frozen).length;
  const none = open.filter((o) => !o.boxes.length).length;

  return (
    <>
      <Header title="Volumes e caixas" subtitle="Identifique a caixa física, o conteúdo e onde ela está guardada." actions={
        <label className="rt-search"><Icon name="search" size={18} />
          <input type="search" aria-label="Buscar caixa, entrega ou cliente" placeholder="Caixa, entrega ou cliente" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>} />

      <Stagger className="rt-stats">
        <Item className="rt-stat"><span>Caixas em operação</span><b><Counter to={boxes} /></b><small>{open.length} entrega(s)</small></Item>
        <Item className="rt-stat"><span>Com frio ou congelado</span><b className="blue"><Counter to={cold} /></b><small>guardadas separadas</small></Item>
        <Item className="rt-stat"><span>Sem caixas</span><b className={none ? 'red' : ''}><Counter to={none} /></b><small>{none ? 'aguardam identificação' : 'tudo identificado'}</small></Item>
      </Stagger>

      <Tabs value={filter} onChange={(v) => setFilter(v as Filter)} label="Filtro de volumes" items={[{ value: 'all', label: 'Todas' }, { value: 'cold', label: 'Frio e congelado' }, { value: 'gas', label: 'Com gás' }, { value: 'none', label: 'Sem caixas' }]} />

      {orders.length === 0 ? <Empty>Nenhum volume encontrado.</Empty> : (
        <Stagger as="ul" className="rt-list" key={filter} count={orders.length}>
          {orders.map((o) => (
            <Item as="li" key={o.id}>
              <div className="rt-item rt-item-static">
                <span className="rt-name">
                  <b>#{o.id} · {o.name}</b>
                  <small>{place(o)}</small>
                  <span className="m-tags">
                    {o.boxes.length ? o.boxes.map((b) => <span key={b} className="tag">{b}</span>) : <span className="tag gas">Sem caixas</span>}
                    {o.cold > 0 && <span className="tag cold">Frio {o.cold}</span>}
                    {o.frozen > 0 && <span className="tag frozen">Congelado {o.frozen}</span>}
                    {o.gas > 0 && <span className="tag gas">Gás {o.gas}</span>}
                  </span>
                </span>
                <OrderPill status={o.status} />
              </div>
            </Item>
          ))}
        </Stagger>
      )}
    </>
  );
}
