import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../app/store';
import { Icon } from '../app/icons';
import { Counter, Item, Stagger } from '../app/motion';
import { OrderDetail } from './OrderDetail';
import { Header, OrderPill } from './ui';

const today = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Visão geral (layout "Painel operacional" do Rota): números do dia, fluxo e entregas em andamento. */
export function Dashboard() {
  const { data } = useStore();
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const count = (s: string) => data.orders.filter((o) => o.status === s).length;
  const total = data.orders.length;
  const delivered = count('delivered');
  const failed = count('failed');
  const onroute = count('onroute');
  const pct = total ? Math.round((delivered / total) * 100) : 0;

  // As etapas na ordem em que a entrega anda: do atendimento à porta do cliente.
  const flow = [
    ['Aguardando volumes', count('awaiting')],
    ['Prontas para planejar', count('ready') + count('queued')],
    ['Em carregamento', count('loading') + count('released')],
    ['Em rota', onroute],
    ['Entregues', delivered],
  ] as const;

  const active = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.orders
      .filter((o) => !['delivered', 'cancelled', 'draft'].includes(o.status))
      .filter((o) => !q || o.name.toLowerCase().includes(q) || String(o.id).includes(q))
      .slice(0, 8);
  }, [data.orders, query]);

  return (
    <>
      <Header title="Visão geral" subtitle={today()} actions={<>
        <label className="rt-search"><Icon name="search" size={18} />
          <input type="search" aria-label="Buscar entrega" placeholder="Buscar entrega" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Link to="/atendimento/nova" className="btn primary">Nova entrega</Link>
      </>} />

      <Stagger className="rt-stats">
        <Item className="rt-stat"><span>Entregas hoje</span><b><Counter to={total} /></b><small>{delivered} concluídas</small></Item>
        <Item className="rt-stat"><span>Em rota agora</span><b><Counter to={onroute} /></b><small className="blue">{data.routes.filter((r) => r.status === 'active').length} romaneio(s) ativos</small></Item>
        <Item className="rt-stat"><span>Não entregues</span><b className={failed ? 'red' : ''}><Counter to={failed} /></b><small>{failed ? 'aguardam nova tentativa' : 'nenhuma pendência'}</small></Item>
        <Item className="rt-stat"><span>Concluídas</span><b className="green"><Counter to={pct} />%</b><small>do total de hoje</small></Item>
      </Stagger>

      <div className="rt-split">
        <section className="card rt-panel rt-side" aria-label="Fluxo das entregas">
          <div className="rt-panel-head"><h2>Fluxo da operação</h2></div>
          <div className="rt-flow">
            {flow.map(([label, value], i) => (
              <div key={label} className={i === flow.length - 1 ? 'end' : ''}>
                <div><span>{label}</span><b>{value}</b></div>
                <i><b style={{ width: `${total ? (value / total) * 100 : 0}%` }} /></i>
              </div>
            ))}
          </div>
          <p className="muted small rt-note">{failed > 0 ? `${failed} não entregue(s), aguardando nova tentativa.` : 'Sem pendências de entrega.'}</p>
        </section>

        <section className="card rt-panel rt-main" aria-label="Entregas em andamento">
          <div className="rt-panel-head"><h2>Entregas em andamento</h2><Link to="/entregas" className="rt-link">Ver todas</Link></div>
          {active.length === 0 && <p className="empty">Nenhuma entrega em andamento{query ? ' para essa busca' : ''}.</p>}
          <Stagger as="ul" className="rt-rows" count={active.length}>
            {active.map((o) => (
              <Item as="li" key={o.id}>
                <button type="button" className="rt-row" onClick={() => setOpenId(o.id)} aria-label={`Detalhes da entrega #${o.id}, ${o.name}`}>
                  <span className="rt-name"><b>{o.name}</b><small>#{o.id} · {o.neighborhood}</small></span>
                  <span className="rt-when">{o.window}</span>
                  <OrderPill status={o.status} />
                </button>
              </Item>
            ))}
          </Stagger>
        </section>
      </div>
      {openId != null && <OrderDetail orderId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
