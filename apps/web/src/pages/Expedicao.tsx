import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { suggestSequence } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header } from './ui';
import { Icon } from '../app/icons';
import { Counter, Item, Stagger } from '../app/motion';

export function Expedicao() {
  const { data, plan, setPlan } = useStore();
  const navigate = useNavigate();
  const [zone, setZone] = useState<string>('');
  const [selected, setSelected] = useState<number[]>(plan?.orderIds ?? []);
  const [vehicleId, setVehicleId] = useState<number>(plan?.vehicleId ?? 0);
  const [departure, setDeparture] = useState(plan?.departure ?? data.departures[0] ?? '');

  const loadingRoutes = data.routes.filter((r) => r.status === 'loading');
  const busy = new Set(data.routes.filter((r) => r.status !== 'finished').map((r) => r.vehicleId));
  const freeVehicles = data.vehicles.filter((v) => v.active !== false && !busy.has(v.id));
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
      <Header title="Montar carga" subtitle="Agrupe os bairros. O motorista mantém a decisão sobre a carga." />
      <Stagger className="rt-stats">
        <Item className="rt-stat"><span>Prontas para sair</span><b><Counter to={data.orders.filter((o) => o.status === 'ready' && o.boxes.length > 0).length} /></b><small>com volumes identificados</small></Item>
        <Item className="rt-stat"><span>Selecionadas</span><b className="green"><Counter to={selected.length} /></b><small>nesta carga</small></Item>
        <Item className="rt-stat"><span>Veículos livres</span><b className="blue"><Counter to={freeVehicles.length} /></b><small>de {data.vehicles.filter((v) => v.active !== false).length} ativos</small></Item>
        <Item className="rt-stat"><span>Em conferência</span><b><Counter to={loadingRoutes.length} /></b><small>carga(s) no carregamento</small></Item>
      </Stagger>
      {loadingRoutes.length > 0 && (
        <section className="card rt-panel" aria-label="Cargas em conferência">
          <div className="rt-panel-head"><h2>Cargas em conferência</h2><Link className="rt-link" to="/carregamento">Ver carregamento</Link></div>
          <ul className="rt-rows">
            {loadingRoutes.map((r) => (
              <li key={r.id} className="rt-row rt-row-static">
                <span className="rt-dot amber" aria-hidden="true"><Icon name="truck" size={18} /></span>
                <span className="rt-name"><b>Romaneio #{r.id}</b><small>{r.orders.length} pedido(s) · saída {r.departure} · {Object.keys(r.confirmed ?? {}).length} de {r.orders.length} confirmados</small></span>
                <Link className="btn primary" to="/carregamento">Retomar</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="chips">
        <button type="button" className={!zone ? 'chip on' : 'chip'} onClick={() => setZone('')}>Todas as regiões</button>
        {data.zones.map((z) => <button key={z} type="button" className={zone === z ? 'chip on' : 'chip'} onClick={() => setZone(z)}>{z}</button>)}
      </div>
      <section className="card">
        {ready.length === 0 ? <Empty>Nenhuma entrega pronta para esta região.</Empty> : (
          <>
            <div className="table-wrap has-cards">
              <table>
                <thead><tr><th /><th>Entrega</th><th>Bairro</th><th>Janela</th><th>Volumes</th></tr></thead>
                <tbody>
                  {ready.map((o) => (
                    <tr key={o.id}>
                      <td><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`Selecionar ${o.name}`} /></td>
                      <td>#{o.id} {o.name}</td><td>{o.neighborhood}</td><td className="nowrap">{o.window}</td><td>{o.boxes.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="m-list">
              {ready.map((o) => (
                <li key={o.id}>
                  <label className="m-row m-pick">
                    <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`Selecionar ${o.name}`} />
                    <span className="m-title"><span className="m-code">#{o.id}</span>{o.name}</span>
                    <span className="m-end">{o.boxes.length} vol.</span>
                    <span className="m-sub">{o.neighborhood} · <span className="nowrap">{o.window}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className={selected.length ? 'bar pinned' : 'bar'}>
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
