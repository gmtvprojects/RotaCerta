import { useState } from 'react';
import { IonContent, IonIcon, IonPage } from '@ionic/react';
import { arrowBackOutline } from 'ionicons/icons';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { activeRoute, routeOrders, volumesOf } from '@rotacerta/domain';
import { useSession } from '../session';
import { RoutePill } from '../ui';

/** Prévia do romaneio antes de iniciar: paradas em linha do tempo e o botão de começar a viagem. */
export function Romaneio() {
  const { routeId } = useParams();
  const { data, driverId, startRoute } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const r = data.routes.find((x) => x.id === Number(routeId));
  if (!r) return <Navigate to="/inicio" replace />;
  if (r.status === 'active' && r.driverId === driverId) return <Navigate to="/viagem" replace />;
  const os = routeOrders(data, r);
  const vehicle = data.vehicles.find((v) => v.id === r.vehicleId);
  const busyTrip = activeRoute(data, driverId);

  const start = async () => {
    setBusy(true);
    const err = await startRoute(r.id);
    setBusy(false);
    if (err) setError(err); else navigate('/viagem', { replace: true });
  };

  return (
    <IonPage>
      <IonContent>
        <div className="r-page">
          <div className="r-head">
            <button type="button" className="r-icon-btn" aria-label="Voltar" onClick={() => navigate(-1)}><IonIcon icon={arrowBackOutline} /></button>
            <div style={{ flex: 1 }}><span className="r-caption">Romaneio</span><h1 className="r-h1">#{r.id}</h1></div>
            <RoutePill status={r.status} />
          </div>

          <div className="r-stats">
            <div className="r-stat"><b>{os.length}</b><span>Paradas</span></div>
            <div className="r-stat"><b>{os.reduce((n, o) => n + volumesOf(o).length, 0)}</b><span>Volumes</span></div>
            <div className="r-stat"><b>{r.departure}</b><span>Saída</span></div>
          </div>
          <p className="r-small r-muted" style={{ margin: 0 }}>{vehicle?.name} · {vehicle?.plate} · carga conferida pela expedição</p>

          <section className="r-card pad">
            <h2 className="r-h2" style={{ marginBottom: 12 }}>Paradas</h2>
            <ol className="r-steps">
              {os.map((o, i) => (
                <li key={o.id} className={i === 0 ? 'now' : 'todo'}>
                  <i />
                  <div>
                    <b>{i + 1}. {o.name}</b>
                    <small>{o.street}, {o.number} — {o.neighborhood} · {o.window}</small>
                    <div className="r-tags">
                      <span className="r-tag">{volumesOf(o).length} volume(s)</span>
                      {(o.cold > 0 || o.frozen > 0) && <span className="r-tag cold">Frio</span>}
                      {o.gas > 0 && <span className="r-tag gas">Gás</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="r-sticky-foot">
            {error && <p className="r-error" role="alert">{error}</p>}
            {busyTrip && <p className="r-small r-muted">Termine o romaneio #{busyTrip.id} antes de iniciar outro.</p>}
            <button type="button" className="r-btn primary" disabled={busy || !!busyTrip} onClick={() => void start()}>{busy ? 'Iniciando…' : 'Iniciar viagem'}</button>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
