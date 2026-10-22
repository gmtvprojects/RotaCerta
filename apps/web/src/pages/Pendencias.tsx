import { Link } from 'react-router-dom';
import { useStore } from '../app/store';
import { Empty, Header, OrderPill } from './ui';

export function Pendencias() {
  const { data, draft, papers } = useStore();
  const pendingPapers = papers.filter((p) => p.status !== 'imported');
  const awaiting = data.orders.filter((o) => o.status === 'awaiting');
  const ready = data.orders.filter((o) => o.status === 'ready');

  return (
    <>
      <Header title="Continuar atendimento." subtitle="Abra apenas o que falta concluir."
        actions={<Link className="btn primary" to="/atendimento/nova">Nova entrega</Link>} />

      <section className="card">
        <h2>Cadastro em rascunho</h2>
        {draft ? (
          <div className="row-item">
            <div><strong>{draft.name || 'Novo cliente'}</strong><div className="muted small">{draft.phone || 'Número ainda não informado'}</div></div>
            <Link className="btn" to="/atendimento/nova">Continuar</Link>
          </div>
        ) : <Empty>Nenhum rascunho. Os dados digitados ficam salvos neste navegador.</Empty>}
      </section>

      <section className="card">
        <h2>Fichas para revisar</h2>
        {pendingPapers.length === 0 ? <Empty>Nenhuma ficha aguardando revisão.</Empty> : pendingPapers.map((p) => (
          <div className="row-item" key={p.id}>
            <div><strong>{p.sheetNumber}</strong> <span className={`pill ${p.status === 'draft' ? 'amber' : 'blue'}`}>{p.status === 'draft' ? 'Rascunho salvo' : 'Foto anexada'}</span>
              <div className="muted small">{p.values.name || 'Sem nome ainda'}</div></div>
            <Link className="btn primary" to={`/atendimento/ficha/${p.id}`}>Continuar</Link>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Compras aguardando caixas</h2>
        {awaiting.length === 0 ? <Empty>Tudo em dia.</Empty> : awaiting.map((o) => (
          <div className="row-item" key={o.id}>
            <div><strong>#{o.id} · {o.name}</strong><div className="muted small">{o.street}, {o.number} — {o.neighborhood}</div></div>
            <Link className="btn primary" to={`/atendimento/caixas/${o.id}`}>Identificar caixas</Link>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Prontas para a expedição</h2>
        {ready.length === 0 ? <Empty>Nenhuma compra pronta.</Empty> : ready.map((o) => (
          <div className="row-item" key={o.id}>
            <div><strong>#{o.id} · {o.name}</strong><div className="muted small">{o.boxes.length} caixa(s) · {o.window}</div></div>
            <span><OrderPill status={o.status} /> <Link className="btn" to={`/atendimento/caixas/${o.id}`}>Editar caixas</Link></span>
          </div>
        ))}
      </section>
    </>
  );
}
