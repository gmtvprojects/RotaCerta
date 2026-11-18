import { IonContent, IonPage } from '@ionic/react';
import { API_URL } from '../api';
import { setPrefs, usePrefs, type Theme } from '../prefs';

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="r-row">
      <div className="r-row-main"><b>{label}</b><small>{hint}</small></div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="r-switch" onClick={() => onChange(!on)}><span /></button>
    </div>
  );
}

/** Ajustes (layout "Configurações" do Rota): grupos com rótulo, chaves e o seletor de tema. */
export function Ajustes() {
  const p = usePrefs();
  const themes: [Theme, string][] = [['light', 'Claro'], ['dark', 'Escuro'], ['system', 'Sistema']];
  return (
    <IonPage>
      <IonContent>
        <div className="r-page">
          <div className="r-head"><h1 className="r-h1">Ajustes</h1></div>

          <h2 className="r-section-label">Viagem</h2>
          <section className="r-card">
            <Toggle label="Compartilhar localização" hint="A operação acompanha a viagem no mapa" on={p.shareLocation} onChange={(v) => setPrefs({ shareLocation: v })} />
            <Toggle label="Manter a tela acesa" hint="Durante a viagem, para o GPS não pausar" on={p.keepAwake} onChange={(v) => setPrefs({ keepAwake: v })} />
          </section>

          <h2 className="r-section-label">Aparência</h2>
          <section className="r-card pad r-row-between">
            <b>Tema</b>
            <div className="r-seg" role="group" aria-label="Tema" style={{ width: 230 }}>
              {themes.map(([k, label]) => <button key={k} type="button" aria-pressed={p.theme === k} onClick={() => setPrefs({ theme: k })}>{label}</button>)}
            </div>
          </section>

          <h2 className="r-section-label">Sobre</h2>
          <section className="r-card">
            <div className="r-row"><div className="r-row-main"><b>RotaCerta Motorista</b><small>Versão 0.1 · servidor {API_URL.replace(/^https?:\/\//, '')}</small></div></div>
          </section>
        </div>
      </IonContent>
    </IonPage>
  );
}
