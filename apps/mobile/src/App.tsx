import { IonApp, IonContent, IonIcon, IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { homeOutline, navigateOutline, cubeOutline, personOutline, optionsOutline } from 'ionicons/icons';
import { Navigate, Route } from 'react-router-dom';
import { activeRoute } from '@rotacerta/domain';
import { useDriverBeacon } from './location';
import { usePrefs } from './prefs';
import { useSession } from './session';
import { Login } from './pages/Login';
import { Inicio } from './pages/Inicio';
import { Romaneio } from './pages/Romaneio';
import { Viagem } from './pages/Viagem';
import { Entregas } from './pages/Entregas';
import { Perfil } from './pages/Perfil';
import { Ajustes } from './pages/Ajustes';

/** Navegação do app: abas inferiores (barra de 64px do Rota) com a viagem no meio. */
function Tabs() {
  const { data, driverId } = useSession();
  const prefs = usePrefs();
  const active = data ? activeRoute(data, driverId) : undefined;
  useDriverBeacon(active?.status === 'active' ? active.id : null, prefs.shareLocation, prefs.keepAwake);
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route path="/inicio" element={<Inicio />} />
        <Route path="/viagem" element={<Viagem />} />
        <Route path="/entregas" element={<Entregas />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/ajustes" element={<Ajustes />} />
        <Route path="/romaneio/:routeId" element={<Romaneio />} />
        <Route path="/" element={<Navigate to="/inicio" replace />} />
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </IonRouterOutlet>
      <IonTabBar slot="bottom">
        <IonTabButton tab="inicio" href="/inicio"><IonIcon icon={homeOutline} /><IonLabel>Início</IonLabel></IonTabButton>
        <IonTabButton tab="entregas" href="/entregas"><IonIcon icon={cubeOutline} /><IonLabel>Entregas</IonLabel></IonTabButton>
        <IonTabButton tab="viagem" href="/viagem"><IonIcon icon={navigateOutline} /><IonLabel>Viagem</IonLabel></IonTabButton>
        <IonTabButton tab="perfil" href="/perfil"><IonIcon icon={personOutline} /><IonLabel>Perfil</IonLabel></IonTabButton>
        <IonTabButton tab="ajustes" href="/ajustes"><IonIcon icon={optionsOutline} /><IonLabel>Ajustes</IonLabel></IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
}

function NotDriver() {
  const { user, logout } = useSession();
  return (
    <IonPage>
      <IonContent>
        <div className="r-login">
          <h1 className="r-display">Este app é do motorista.</h1>
          <p className="r-muted">Você entrou como {user?.name}. Para a operação da loja, use o RotaCerta no navegador.</p>
          <button type="button" className="r-btn" onClick={() => void logout()}>Sair</button>
        </div>
      </IonContent>
    </IonPage>
  );
}

export function App() {
  const { status, user } = useSession();
  return (
    <IonApp>
      {status === 'booting' ? (
        <IonPage><IonContent><div className="r-login"><p className="r-muted">Abrindo…</p></div></IonContent></IonPage>
      ) : status === 'out' ? <Login /> : user?.role !== 'motorista' ? <NotDriver /> : (
        <IonReactRouter><Tabs /></IonReactRouter>
      )}
    </IonApp>
  );
}
