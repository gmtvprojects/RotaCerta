import { useState } from 'react';
import { IonContent, IonIcon, IonPage } from '@ionic/react';
import { busOutline } from 'ionicons/icons';
import { useSession } from '../session';

export function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await login(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <IonPage>
      <IonContent>
        <form className="r-login" onSubmit={(e) => void submit(e)}>
          <div className="r-logo"><span><IonIcon icon={busOutline} /></span><b>RotaCerta</b></div>
          <div>
            <h1 className="r-display">Sua rota de hoje começa aqui.</h1>
            <p className="r-muted">Entre com o e-mail e a senha que a loja cadastrou para você.</p>
          </div>
          <label className="r-field">E-mail
            <input className="r-input" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="r-field">Senha
            <input className="r-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="r-error" role="alert">{error}</p>}
          <button className="r-btn primary" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          <p className="r-small r-muted">Esqueceu a senha? Peça uma nova para a gestão da loja.</p>
        </form>
      </IonContent>
    </IonPage>
  );
}
