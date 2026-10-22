import { Link } from 'react-router-dom';
import { BOX_TYPE_LABELS, volumesOf, type Order, type Route } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header } from './ui';

export function Carregamento() {
  const { data } = useStore();
  const loading = data.routes.filter((r) => r.status === 'loading');
  return (
    <>
      <Header title="Nada fica para trás." subtitle="Confira fisicamente as caixas e os itens armazenados separadamente."
        actions={<Link className="btn" to="/expedicao">Montar nova carga</Link>} />
      {loading.length === 0 ? (
        <section className="card"><Empty>Nenhuma carga em conferência. Monte uma carga na expedição para começar.</Empty></section>
      ) : loading.map((r) => <Conferencia key={r.id} route={r} />)}
      <p className="muted small">O romaneio só fica disponível ao motorista depois que todos os volumes forem conferidos. Nenhum aviso ao cliente é disparado nesta etapa.</p>
    </>
  );
}

function Conferencia({ route }: { route: Route }) {
  const { data, setChecked, releaseRoute, discardRoute } = useStore();
  const orders = route.orders.map((id) => data.orders.find((o) => o.id === id)).filter((o): o is Order => !!o);
  const volumes = orders.flatMap(volumesOf);
  const done = volumes.filter((v) => route.checked?.[v.key]).length;
  const complete = volumes.length > 0 && done === volumes.length;
  const vehicle = data.vehicles.find((v) => v.id === route.vehicleId);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Romaneio #{route.id}</h2>
        <span className="muted">{vehicle?.name} · saída {route.departure}</span>
        <span className={`pill ${complete ? 'green' : 'amber'}`}>{done} de {volumes.length} conferidos</span>
      </div>
      <div className="bar-track" aria-hidden><i style={{ width: `${volumes.length ? (done / volumes.length) * 100 : 0}%` }} /></div>

      {orders.map((o) => {
        const vols = volumesOf(o);
        const all = vols.every((v) => route.checked?.[v.key]);
        return (
          <div className="conf-order" key={o.id}>
            <div className="card-head">
              <strong>#{o.id} · {o.name}</strong>
              <span className="muted small">{o.neighborhood}</span>
              <button type="button" onClick={() => setChecked(route.id, vols.map((v) => v.key), !all)}>{all ? 'Desmarcar todos' : 'Marcar todos'}</button>
            </div>
            {vols.length === 0 ? <p className="error">Esta entrega não tem volumes cadastrados.</p> : vols.map((v) => (
              <label className={`conf-vol ${route.checked?.[v.key] ? 'ok' : ''}`} key={v.key}>
                <input type="checkbox" checked={!!route.checked?.[v.key]} onChange={(e) => setChecked(route.id, [v.key], e.target.checked)} />
                <span className="grow"><strong>{v.label}</strong><span className="muted small"> · {v.location}</span></span>
                {v.type === 'cold' || v.type === 'frozen'
                  ? <span className="pill blue">{BOX_TYPE_LABELS[v.type]}</span>
                  : v.type === 'extra' ? <span className="pill amber">Fora da caixa</span> : null}
              </label>
            ))}
          </div>
        );
      })}

      {!complete && <p className="muted small">Falta conferir {volumes.length - done} volume(s), inclusive os do frio, para liberar o romaneio.</p>}
      <div className="bar">
        <button type="button" className="primary" disabled={!complete} onClick={() => releaseRoute(route.id)}>Liberar romaneio ao motorista</button>
        <button type="button" className="danger" onClick={() => { if (confirm(`Desfazer a carga #${route.id}? As entregas voltam para a fila.`)) discardRoute(route.id); }}>Desfazer carga</button>
      </div>
    </section>
  );
}
