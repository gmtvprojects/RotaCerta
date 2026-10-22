import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  BOX_TYPE_LABELS, confirmedCount, orderChecked, routeOrders, volumesOf, volumesSignature,
  type Order, type Route as RouteT,
} from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header } from './ui';
import { Etiquetas } from './Etiquetas';

export function Carregamento() {
  return (
    <Routes>
      <Route index element={<Lista />} />
      <Route path="etiquetas/:routeId" element={<Etiquetas />} />
      <Route path="*" element={<Navigate to="/carregamento" replace />} />
    </Routes>
  );
}

function Lista() {
  const { data } = useStore();
  const loading = data.routes.filter((r) => r.status === 'loading');
  return (
    <>
      <Header title="Nada fica para trás." subtitle="Confira fisicamente as caixas e os itens armazenados separadamente."
        actions={<Link className="btn" to="/expedicao">Montar nova carga</Link>} />
      {loading.length === 0 ? (
        <section className="card"><Empty>Nenhuma carga em conferência. Monte uma carga na expedição para começar.</Empty></section>
      ) : loading.map((r) => <Conferencia key={r.id} route={r} />)}
      <p className="muted small">O romaneio só fica disponível ao motorista depois que todos os pedidos forem conferidos e confirmados. Nenhum aviso ao cliente é disparado nesta etapa.</p>
    </>
  );
}

function Conferencia({ route }: { route: RouteT }) {
  const { data, setChecked, confirmOrder, releaseRoute, discardRoute, syncConference } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const orders = routeOrders(data, route);

  // Se os volumes de um pedido mudaram depois de conferidos, a conferência dele recomeça.
  const signature = orders.map(volumesSignature).join('|');
  useEffect(() => { syncConference(route.id); }, [signature, route.id, syncConference]);

  const volumes = orders.flatMap(volumesOf);
  const done = volumes.filter((v) => route.checked?.[v.key]).length;
  const confirmed = confirmedCount(route);
  const complete = volumes.length > 0 && done === volumes.length && confirmed === orders.length;
  const vehicle = data.vehicles.find((v) => v.id === route.vehicleId);
  const driver = data.drivers.find((d) => d.id === route.driverId);

  const confirmPedido = (orderId: number) => { const err = confirmOrder(route.id, orderId); setError(err ?? ''); };
  const release = () => {
    const err = releaseRoute(route.id);
    if (err) setError(err); else navigate('/romaneios');
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Romaneio #{route.id}</h2>
        <span className="muted">{vehicle?.name} · saída {route.departure}{driver ? ` · ${driver.name}` : ''}</span>
        <span className={`pill ${complete ? 'green' : 'amber'}`}>{done} de {volumes.length} volumes · {confirmed} de {orders.length} pedidos confirmados</span>
      </div>
      <div className="bar-track" aria-hidden><i style={{ width: `${volumes.length ? (done / volumes.length) * 100 : 0}%` }} /></div>

      {orders.map((o, i) => <Pedido key={o.id} route={route} order={o} stop={i + 1} onCheck={setChecked} onConfirm={confirmPedido} />)}

      {error && <p className="error" role="alert">{error}</p>}
      {!complete && <p className="muted small">Falta conferir {volumes.length - done} volume(s) e confirmar {orders.length - confirmed} pedido(s), inclusive os do frio, para liberar o romaneio.</p>}
      <div className="bar">
        <button type="button" className="primary" disabled={!complete} onClick={release}>Liberar romaneio ao motorista</button>
        <Link className="btn" to={`etiquetas/${route.id}`}>Etiquetas</Link>
        <button type="button" onClick={() => navigate('/expedicao')}>Continuar depois</button>
        <button type="button" className="danger" onClick={() => { if (confirm(`Desfazer a carga #${route.id}? As entregas voltam para a fila.`)) discardRoute(route.id); }}>Desfazer carga</button>
      </div>
      <p className="muted small">A conferência fica salva neste navegador. Para retomar, volte em Carregamento ou use "Retomar conferência" na expedição.</p>
    </section>
  );
}

function Pedido({ route, order: o, stop, onCheck, onConfirm }: {
  route: RouteT; order: Order; stop: number;
  onCheck: (routeId: number, keys: string[], value: boolean) => void;
  onConfirm: (orderId: number) => void;
}) {
  const vols = volumesOf(o);
  const all = orderChecked(route, o);
  const confirmed = !!route.confirmed?.[String(o.id)];
  return (
    <div className={`conf-order ${confirmed ? 'confirmed' : ''}`}>
      <div className="card-head">
        <strong>{stop}. #{o.id} · {o.name}</strong>
        <span className="muted small">{o.neighborhood}</span>
        {confirmed && <span className="pill green">Pedido confirmado</span>}
        <button type="button" disabled={confirmed} onClick={() => onCheck(route.id, vols.map((v) => v.key), !all)}>{all ? 'Desmarcar todos' : 'Marcar todos'}</button>
      </div>
      {vols.length === 0 ? <p className="error">Esta entrega não tem volumes cadastrados.</p> : vols.map((v) => {
        const a = route.audit?.[v.key];
        return (
          <label className={`conf-vol ${route.checked?.[v.key] ? 'ok' : ''}`} key={v.key}>
            <input type="checkbox" checked={!!route.checked?.[v.key]} disabled={confirmed}
              onChange={(e) => onCheck(route.id, [v.key], e.target.checked)} />
            <span className="grow">
              <strong>{v.label}</strong><span className="muted small"> · {v.location}</span>
              {a?.checked && <span className="muted small audit">Conferido por {a.actor} às {a.at}</span>}
            </span>
            {v.type === 'cold' || v.type === 'frozen'
              ? <span className="pill blue">{BOX_TYPE_LABELS[v.type]}</span>
              : v.type === 'extra' ? <span className="pill amber">Fora da caixa</span> : null}
          </label>
        );
      })}
      {!confirmed && vols.length > 0 && (
        <div className="bar" style={{ marginTop: 8 }}>
          <button type="button" disabled={!all} onClick={() => onConfirm(o.id)}>Confirmar pedido</button>
          {!all && <span className="muted small">Marque todos os volumes para confirmar.</span>}
        </div>
      )}
      {confirmed && <button type="button" className="textbtn" onClick={() => onCheck(route.id, vols.map((v) => v.key), false)}>Reabrir pedido (desmarca os volumes)</button>}
    </div>
  );
}
