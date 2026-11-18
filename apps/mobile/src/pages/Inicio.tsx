import { IonContent, IonIcon, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import { busOutline, checkmarkOutline, chevronForwardOutline, refreshOutline } from 'ionicons/icons';
import { Link } from 'react-router-dom';
import { activeRoute, availableManifests, nextStop, routeOrders, volumesOf } from '@rotacerta/domain';
import { useSession } from '../session';
import { RoutePill, today } from '../ui';

/** Início do motorista (layout "Dashboard" do Rota): saudação, cartão verde da viagem, números e romaneios. */
export function Inicio() {
  const { data, user, driverId, refresh } = useSession();
  if (!data) return <IonPage><IonContent><div className="r-page"><p className="r-muted">Carregando…</p></div></IonContent></IonPage>;

  const mine = activeRoute(data, driverId);
  const stops = mine ? routeOrders(data, mine) : [];
  const done = stops.filter((o) => o.status === 'delivered' || o.status === 'failed').length;
  const next = mine ? nextStop(data, mine) : undefined;
  const available = availableManifests(data, driverId).filter((r) => r.id !== mine?.id);
  const finished = data.routes.filter((r) => r.driverId === driverId && r.status === 'finished');
  const deliveredToday = data.orders.filter((o) => o.status === 'delivered' && data.routes.some((r) => r.id === o.routeId && r.driverId === driverId)).length;

  return (
    <IonPage>
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={(e) => void refresh().finally(() => e.detail.complete())}><IonRefresherContent /></IonRefresher>
        <div className="r-page">
          <div className="r-head">
            <div><span className="r-caption">{today()}</span><h1 className="r-h1">Olá, {user?.name.split(' ')[0] ?? 'motorista'}</h1></div>
            <button type="button" className="r-icon-btn" aria-label="Atualizar" onClick={() => void refresh()}><IonIcon icon={refreshOutline} /></button>
          </div>

          {mine ? (
            <section className="r-hero">
              <span className="r-badge"><IonIcon icon={busOutline} />Viagem em andamento</span>
              <div>
                <div className="r-hero-title">{next ? `Próxima: ${next.name}` : 'Todas as paradas registradas'}</div>
                <div className="r-hero-sub">Romaneio #{mine.id} · parada {Math.min(done + 1, stops.length)} de {stops.length}{next ? ` · ${next.neighborhood}` : ''}</div>
              </div>
              <div className="r-hero-bar" aria-hidden="true"><i style={{ width: `${stops.length ? (done / stops.length) * 100 : 0}%` }} /></div>
              <Link className="r-btn dark" to="/viagem">Continuar viagem</Link>
            </section>
          ) : (
            <section className="r-hero calm">
              <span className="r-badge">{available.length ? `${available.length} romaneio(s) para você` : 'Sem viagem agora'}</span>
              <div>
                <div className="r-hero-title">{available.length ? 'Escolha a próxima viagem' : 'Nenhum romaneio liberado'}</div>
                <div className="r-hero-sub">{available.length ? 'Confira as paradas antes de iniciar.' : 'As cargas aparecem aqui assim que a expedição termina a conferência.'}</div>
              </div>
            </section>
          )}

          <div className="r-stats">
            <div className="r-stat"><b>{stops.length}</b><span>Paradas</span></div>
            <div className="r-stat"><b className="green">{deliveredToday}</b><span>Entregues</span></div>
            <div className="r-stat"><b>{finished.length}</b><span>Viagens feitas</span></div>
          </div>

          <div className="r-row-between"><h2 className="r-h2">{mine ? 'Depois desta viagem' : 'Romaneios disponíveis'}</h2><Link className="r-link" to="/entregas">Ver entregas</Link></div>
          <div className="r-card">
            {available.length === 0 && <div className="r-row"><span className="r-dot green"><IonIcon icon={checkmarkOutline} /></span><div className="r-row-main"><b>Nada na fila</b><small>Você será avisado quando houver carga liberada.</small></div></div>}
            {available.map((r) => {
              const os = routeOrders(data, r);
              const vehicle = data.vehicles.find((v) => v.id === r.vehicleId);
              return (
                <Link key={r.id} className="r-row" to={`/romaneio/${r.id}`}>
                  <span className="r-dot blue"><IonIcon icon={busOutline} /></span>
                  <div className="r-row-main"><b>Romaneio #{r.id}</b><small>{vehicle?.name} · saída {r.departure} · {os.length} paradas · {os.reduce((n, o) => n + volumesOf(o).length, 0)} vol.</small></div>
                  <RoutePill status={r.status} />
                  <IonIcon icon={chevronForwardOutline} className="r-muted" />
                </Link>
              );
            })}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
