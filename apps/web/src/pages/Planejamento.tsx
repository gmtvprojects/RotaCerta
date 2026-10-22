import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { suggestSequence, type Order } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header } from './ui';

export function Planejamento() {
  const { data, plan, setPlan, createRoute } = useStore();
  const navigate = useNavigate();
  const [dragId, setDragId] = useState<number | null>(null);
  const [error, setError] = useState('');

  if (!plan) {
    return (
      <>
        <Header title="Planeje a sequência de paradas." subtitle="Comece selecionando as entregas que vão na mesma carga." />
        <section className="card"><Empty>Nenhuma carga em planejamento.</Empty>
          <div className="actions" style={{ justifyContent: 'center' }}><Link className="btn primary" to="/expedicao">Ir para expedição</Link></div>
        </section>
      </>
    );
  }

  const stops = plan.orderIds.map((id) => data.orders.find((o) => o.id === id)).filter((o): o is Order => !!o);
  const busy = new Set(data.routes.filter((r) => r.status !== 'finished').map((r) => r.vehicleId));
  const vehicles = data.vehicles.filter((v) => !busy.has(v.id) || v.id === plan.vehicleId);
  const vehicle = data.vehicles.find((v) => v.id === plan.vehicleId);
  const inTrip = new Set(data.routes.filter((r) => r.status === 'active' && r.driverId != null).map((r) => r.driverId));
  const volumes = stops.reduce((n, o) => n + o.boxes.length + o.gas, 0);
  const over = vehicle ? volumes > vehicle.capacity : false;
  const stale = stops.filter((o) => o.status !== 'ready');

  const setOrder = (ids: number[]) => setPlan({ ...plan, orderIds: ids });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= stops.length || from === to) return;
    const ids = plan.orderIds.slice();
    const [item] = ids.splice(from, 1);
    ids.splice(to, 0, item);
    setOrder(ids);
  };
  const remove = (id: number) => {
    const ids = plan.orderIds.filter((x) => x !== id);
    if (ids.length === 0) { setPlan(null); navigate('/expedicao'); return; }
    setOrder(ids);
  };

  const confirm = () => {
    if (stale.length) { setError('Uma entrega já foi atribuída a outra carga. Remova-a da lista.'); return; }
    if (!plan.vehicleId) { setError('Escolha um veículo disponível.'); return; }
    setError('');
    createRoute(plan.orderIds, plan.vehicleId, plan.departure, plan.driverId ?? null);
    setPlan(null);
    navigate('/carregamento');
  };

  return (
    <>
      <Header title="A ordem é sua. O controle, de todos." subtitle="Arraste as paradas ou use as setas. A sequência também orienta o carregamento."
        actions={<Link className="btn" to="/expedicao">Voltar à seleção</Link>} />

      <section className="card">
        <div className="bar" style={{ marginTop: 0 }}>
          <label>Veículo
            <select value={plan.vehicleId} onChange={(e) => setPlan({ ...plan, vehicleId: Number(e.target.value) })}>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.capacity} vol.</option>)}
            </select>
          </label>
          <label>Saída
            <select value={plan.departure} onChange={(e) => setPlan({ ...plan, departure: e.target.value })}>
              {data.departures.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label>Motorista
            <select value={plan.driverId ?? ''} onChange={(e) => setPlan({ ...plan, driverId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Qualquer um (escolhe ao iniciar)</option>
              {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}{inTrip.has(d.id) ? ' · em viagem' : ''}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setOrder(suggestSequence(stops, data.neighborhoods))}>Sugerir por região e bairro</button>
          <span className={`pill ${over ? 'red' : 'green'}`}>{volumes} de {vehicle?.capacity ?? 0} volumes</span>
        </div>
        {over && <p className="error">A carga passa da capacidade de referência do veículo. A decisão de seguir é da equipe.</p>}
      </section>

      <section className="card">
        <ol className="plan-list">
          {stops.map((o, i) => (
            <li key={o.id} draggable
              className={dragId === o.id ? 'dragging' : ''}
              onDragStart={() => setDragId(o.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId != null) move(plan.orderIds.indexOf(dragId), i); setDragId(null); }}>
              <span className="handle" aria-hidden>⋮⋮</span>
              <span className="num">{i + 1}</span>
              <div className="grow">
                <strong>#{o.id} · {o.name}</strong>
                <div className="muted small">{o.street}, {o.number} — {o.neighborhood} · {o.window} · {o.boxes.length} caixa(s){o.cold || o.frozen ? ' · frio' : ''}{o.gas ? ' · gás' : ''}</div>
                {o.status !== 'ready' && <div className="error small">Esta entrega já não está disponível para carga.</div>}
              </div>
              <button type="button" aria-label={`Subir parada ${i + 1}`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
              <button type="button" aria-label={`Descer parada ${i + 1}`} disabled={i === stops.length - 1} onClick={() => move(i, i + 1)}>↓</button>
              <button type="button" aria-label={`Remover parada ${i + 1}`} onClick={() => remove(o.id)}>✕</button>
            </li>
          ))}
        </ol>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="bar">
          <button type="button" className="primary" onClick={confirm}>Confirmar sequência e conferir carga</button>
          <button type="button" className="danger" onClick={() => { setPlan(null); navigate('/expedicao'); }}>Descartar planejamento</button>
        </div>
      </section>
    </>
  );
}
