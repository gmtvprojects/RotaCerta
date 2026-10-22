import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { suggestSequence } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header } from './ui';

export function Expedicao() {
  const { data, plan, setPlan } = useStore();
  const navigate = useNavigate();
  const [zone, setZone] = useState<string>('');
  const [selected, setSelected] = useState<number[]>(plan?.orderIds ?? []);
  const [vehicleId, setVehicleId] = useState<number>(plan?.vehicleId ?? 0);
  const [departure, setDeparture] = useState(plan?.departure ?? data.departures[0] ?? '');

  const loadingRoutes = data.routes.filter((r) => r.status === 'loading');
  const busy = new Set(data.routes.filter((r) => r.status !== 'finished').map((r) => r.vehicleId));
  const freeVehicles = data.vehicles.filter((v) => !busy.has(v.id));
  const zoneOf = (n: string) => data.neighborhoods.find((x) => x.name === n)?.zone ?? 'Sem região';
  const ready = data.orders.filter((o) => o.status === 'ready' && o.boxes.length > 0 && (!zone || zoneOf(o.neighborhood) === zone));
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const vehicle = vehicleId || freeVehicles[0]?.id || 0;

  const generate = () => {
    if (!selected.length || !vehicle) return;
    const kept = (plan?.orderIds ?? []).filter((id) => selected.includes(id));
    const added = data.orders.filter((o) => selected.includes(o.id) && !kept.includes(o.id));
    setPlan({ orderIds: [...kept, ...suggestSequence(added, data.neighborhoods)], vehicleId: vehicle, departure, driverId: plan?.driverId ?? null });
    navigate('/planejamento');
  };

  return (
    <>
      <Header title="A próxima viagem começa aqui." subtitle="Agrupe os bairros. O motorista mantém a decisão sobre a carga." />
      {loadingRoutes.length > 0 && (
        <section className="card">
          <h2>Cargas em conferência</h2>
          {loadingRoutes.map((r) => (
            <div className="row-item" key={r.id}>
              <div><strong>Romaneio #{r.id}</strong><div className="muted small">{r.orders.length} pedido(s) · saída {r.departure} · {Object.keys(r.confirmed ?? {}).length} de {r.orders.length} confirmados</div></div>
              <Link className="btn primary" to="/carregamento">Retomar conferência</Link>
            </div>
          ))}
        </section>
      )}
      <div className="chips">
        <button type="button" className={!zone ? 'chip on' : 'chip'} onClick={() => setZone('')}>Todas as regiões</button>
        {data.zones.map((z) => <button key={z} type="button" className={zone === z ? 'chip on' : 'chip'} onClick={() => setZone(z)}>{z}</button>)}
      </div>
      <section className="card">
        {ready.length === 0 ? <Empty>Nenhuma entrega pronta para esta região.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th /><th>Entrega</th><th>Bairro</th><th>Janela</th><th>Volumes</th></tr></thead>
              <tbody>
                {ready.map((o) => (
                  <tr key={o.id}>
                    <td><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`Selecionar ${o.name}`} /></td>
                    <td>#{o.id} {o.name}</td><td>{o.neighborhood}</td><td>{o.window}</td><td>{o.boxes.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="bar">
          <label>Veículo
            <select value={vehicle} onChange={(e) => setVehicleId(Number(e.target.value))}>
              {freeVehicles.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.capacity} vol.</option>)}
            </select>
          </label>
          <label>Saída
            <select value={departure} onChange={(e) => setDeparture(e.target.value)}>
              {data.departures.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <button type="button" className="primary" disabled={!selected.length || !vehicle} onClick={generate}>
            Planejar sequência ({selected.length})
          </button>
        </div>
      </section>
    </>
  );
}
