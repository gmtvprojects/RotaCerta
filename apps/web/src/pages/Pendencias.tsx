import { Link } from 'react-router-dom';
import { useStore } from '../app/store';
import type { ReactNode } from 'react';
import { Header } from './ui';
import { Icon, type IconName } from '../app/icons';
import { Counter, Item, Stagger } from '../app/motion';

export function Pendencias() {
  const { data, draft, papers } = useStore();
  const pendingPapers = papers.filter((p) => p.status !== 'imported');
  const awaiting = data.orders.filter((o) => o.status === 'awaiting');
  const ready = data.orders.filter((o) => o.status === 'ready');

  return (
    <>
      <Header title="Continuar atendimento" subtitle="Abra apenas o que falta concluir."
        actions={<Link className="btn primary" to="/atendimento/nova">Nova entrega</Link>} />

      <Stagger className="rt-stats">
        <Item className="rt-stat"><span>Rascunho</span><b><Counter to={draft ? 1 : 0} /></b><small>cadastro iniciado</small></Item>
        <Item className="rt-stat"><span>Fichas para revisar</span><b className="blue"><Counter to={pendingPapers.length} /></b><small>fotos e rascunhos</small></Item>
        <Item className="rt-stat"><span>Aguardando caixas</span><b className={awaiting.length ? 'red' : ''}><Counter to={awaiting.length} /></b><small>compras sem volumes</small></Item>
        <Item className="rt-stat"><span>Prontas</span><b className="green"><Counter to={ready.length} /></b><small>para a expedição</small></Item>
      </Stagger>

      <div className="rt-split">
        <div className="rt-main rt-stack">
          <Panel title="Compras aguardando caixas" empty="Tudo em dia." count={awaiting.length}>
            {awaiting.map((o) => (
              <Row key={o.id} icon="box" tone="red" title={`#${o.id} · ${o.name}`} sub={`${o.street}, ${o.number} — ${o.neighborhood}`}>
                <Link className="btn primary" to={`/atendimento/caixas/${o.id}`}>Identificar caixas</Link>
              </Row>
            ))}
          </Panel>
          <Panel title="Prontas para a expedição" empty="Nenhuma compra pronta." count={ready.length}>
            {ready.map((o) => (
              <Row key={o.id} icon="check" tone="green" title={`#${o.id} · ${o.name}`} sub={`${o.boxes.length} caixa(s) · ${o.window}`}>
                <Link className="btn" to={`/atendimento/caixas/${o.id}`}>Editar caixas</Link>
              </Row>
            ))}
          </Panel>
        </div>
        <div className="rt-side rt-stack">
          <Panel title="Cadastro em rascunho" empty="Nenhum rascunho. Os dados digitados ficam salvos neste navegador." count={draft ? 1 : 0}>
            {draft && (
              <Row icon="user" tone="blue" title={draft.name || 'Novo cliente'} sub={draft.phone || 'Número ainda não informado'}>
                <Link className="btn primary" to="/atendimento/nova">Continuar</Link>
              </Row>
            )}
          </Panel>
          <Panel title="Fichas para revisar" empty="Nenhuma ficha aguardando revisão." count={pendingPapers.length}>
            {pendingPapers.map((p) => (
              <Row key={p.id} icon="list" tone={p.status === 'draft' ? 'amber' : 'blue'} title={p.sheetNumber} sub={`${p.status === 'draft' ? 'Rascunho salvo' : 'Foto anexada'} · ${p.values.name || 'sem nome ainda'}`}>
                <Link className="btn" to={`/atendimento/ficha/${p.id}`}>Continuar</Link>
              </Row>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Panel({ title, empty, count, children }: { title: string; empty: string; count: number; children: ReactNode }) {
  return (
    <section className="card rt-panel" aria-label={title}>
      <div className="rt-panel-head"><h2>{title}</h2><span className="pill">{count}</span></div>
      {count === 0 ? <p className="rt-empty">{empty}</p> : <ul className="rt-rows">{children}</ul>}
    </section>
  );
}

function Row({ icon, tone, title, sub, children }: { icon: IconName; tone: string; title: string; sub: string; children: ReactNode }) {
  return (
    <li className="rt-row rt-row-static">
      <span className={`rt-dot ${tone}`} aria-hidden="true"><Icon name={icon} size={18} /></span>
      <span className="rt-name"><b>{title}</b><small>{sub}</small></span>
      {children}
    </li>
  );
}
