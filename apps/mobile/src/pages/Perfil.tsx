import { IonContent, IonIcon, IonPage } from '@ionic/react';
import { busOutline, logOutOutline } from 'ionicons/icons';
import { activeRoute } from '@rotacerta/domain';
import { useSession } from '../session';
import { initials } from '../ui';

/** Perfil (layout "Perfil" do Rota): avatar, números do motorista e dados da operação. */
export function Perfil() {
  const { data, user, driverId, logout } = useSession();
  if (!data || !user) return null;
  const mine = data.routes.filter((r) => r.driverId === driverId);
  const ids = new Set(mine.flatMap((r) => r.orders));
  const orders = data.orders.filter((o) => ids.has(o.id));
  const current = activeRoute(data, driverId);
  const vehicle = data.vehicles.find((v) => v.id === current?.vehicleId);

  return (
    <IonPage>
      <IonContent>
        <div className="r-page">
          <div className="r-head"><h1 className="r-h1">Perfil</h1></div>
          <section className="r-card r-profile">
            <div className="r-avatar">{initials(user.name)}</div>
            <b style={{ fontSize: 20, lineHeight: '26px' }}>{user.name}</b>
            <span className="r-role">MOTORISTA</span>
            <div className="r-profile-stats">
              <div><b>{mine.filter((r) => r.status === 'finished').length}</b><span>Viagens</span></div>
              <div><b>{orders.filter((o) => o.status === 'delivered').length}</b><span>Entregues</span></div>
              <div><b>{orders.filter((o) => o.status === 'failed').length}</b><span>Ocorrências</span></div>
            </div>
          </section>

          <h2 className="r-section-label">Viagem atual</h2>
          <section className="r-card">
            <div className="r-row">
              <span className="r-dot blue"><IonIcon icon={busOutline} /></span>
              <div className="r-row-main"><b>{current ? `Romaneio #${current.id}` : 'Nenhuma viagem em andamento'}</b><small>{current ? `${vehicle?.name ?? ''} · ${vehicle?.plate ?? ''} · saída ${current.departure}` : 'Escolha um romaneio no início.'}</small></div>
            </div>
          </section>

          <button type="button" className="r-btn danger" onClick={() => void logout()}><IonIcon icon={logOutOutline} />Sair da conta</button>
        </div>
      </IonContent>
    </IonPage>
  );
}
