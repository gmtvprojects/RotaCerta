import { useState } from 'react';
import { IonContent, IonIcon, IonPage } from '@ionic/react';
import { alertCircleOutline, callOutline, checkmarkCircleOutline, locateOutline, navigateOutline } from 'ionicons/icons';
import { Link, Navigate } from 'react-router-dom';
import { OCCURRENCE_REASONS, activeRoute, nextStop, routeOrders, volumesOf, type Order, type StopOutcome } from '@rotacerta/domain';
import { useSession } from '../session';
import { SHARE_LABEL, useSharingStatus } from '../location';
import { MapCard, Sheet } from '../ui';

const RECEIVERS = ['O próprio cliente', 'Familiar', 'Portaria', 'Vizinho'];

/** Viagem em andamento (layout "Rastreio" do Rota): selo, próxima parada em destaque, mapa, etapas e ações. */
export function Viagem() {
  const { data, driverId, finishStop } = useSession();
  const [sheet, setSheet] = useState<'deliver' | 'fail' | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const r = data ? activeRoute(data, driverId) ?? data.routes.filter((x) => x.driverId === driverId && x.status === 'finished').slice(-1)[0] : undefined;
  // o envio roda no farol das abas (App.tsx); aqui só mostra a situação
  const share = useSharingStatus();
  if (!data) return null;
  if (!r) return <Navigate to="/inicio" replace />;

  const stops = routeOrders(data, r);
  const next = nextStop(data, r);
  const done = stops.filter((o) => o.status === 'delivered' || o.status === 'failed').length;
  const delivered = stops.filter((o) => o.status === 'delivered').length;
  const failed = stops.filter((o) => o.status === 'failed').length;

  const submit = async (o: Order, outcome: StopOutcome) => {
    const err = await finishStop(o.id, outcome);
    if (err) { setError(err); return false; }
    setError('');
    setInfo(outcome.kind === 'delivered' ? `Entrega de ${o.name} concluída. O próximo cliente foi avisado.` : `Ocorrência registrada para ${o.name}.`);
    setSheet(null);
    return true;
  };

  return (
    <IonPage>
      <IonContent>
        <div className="r-page">
          <div className="r-head">
            <div><span className="r-caption">Romaneio</span><span style={{ fontWeight: 600 }}>#{r.id} · {done} de {stops.length} paradas</span></div>
            <span className={`r-pill ${share.state === 'sharing' ? 'green' : share.state === 'off' ? '' : 'amber'}`} title={SHARE_LABEL[share.state]}>
              <IonIcon icon={locateOutline} style={{ verticalAlign: '-2px', marginRight: 4 }} />{share.state === 'sharing' ? 'GPS ativo' : share.state === 'off' ? 'GPS desligado' : 'GPS…'}
            </span>
          </div>

          {!next ? (
            <>
              <section className="r-hero">
                <span className="r-badge"><IonIcon icon={checkmarkCircleOutline} />Viagem encerrada</span>
                <div className="r-hero-title">{delivered} entrega(s) concluída(s)</div>
                <div className="r-hero-sub">{failed ? `${failed} não entregue(s): a equipe combina uma nova tentativa.` : 'Todas as paradas foram entregues.'}</div>
                <Link className="r-btn dark" to="/inicio">Voltar ao início</Link>
              </section>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span className="r-badge"><IonIcon icon={navigateOutline} />Parada {done + 1} de {stops.length}</span>
                <h1 className="r-display">{next.name}</h1>
                <p className="r-muted" style={{ margin: 0 }}>{next.street}, {next.number}{next.complement ? ` · ${next.complement}` : ''} — {next.neighborhood} · {next.window}</p>
              </div>

              <MapCard address={`${next.street}, ${next.number}, ${next.neighborhood}`} />

              <section className="r-card pad" style={{ gap: 12 }}>
                <div className="r-row-between">
                  <div className="r-kv"><span>Volumes</span><b>{next.boxes.length} caixa(s) · {volumesOf(next).length} volume(s)</b></div>
                </div>
                <div className="r-tags">
                  {next.boxes.map((b) => <span key={b} className="r-tag">{b}</span>)}
                  {next.cold > 0 && <span className="r-tag cold">Frio {next.cold}</span>}
                  {next.frozen > 0 && <span className="r-tag cold">Congelado {next.frozen}</span>}
                  {next.gas > 0 && <span className="r-tag gas">Gás {next.gas}</span>}
                </div>
                {next.notes && <div className="r-kv"><span>Observações</span><b>“{next.notes}”</b></div>}
              </section>

              {error && <div className="r-banner" role="alert">{error}</div>}
              {info && <div className="r-banner info" role="status">{info}</div>}

              <div className="r-btn-row">
                <a className="r-btn" href={`tel:${next.phone.replace(/\D/g, '')}`}><IonIcon icon={callOutline} />Ligar</a>
                <button type="button" className="r-btn danger" onClick={() => { setError(''); setSheet('fail'); }}><IonIcon icon={alertCircleOutline} />Não entreguei</button>
              </div>
              <button type="button" className="r-btn primary" onClick={() => { setError(''); setSheet('deliver'); }}><IonIcon icon={checkmarkCircleOutline} />Concluir entrega</button>
            </>
          )}

          <section className="r-card pad">
            <h2 className="r-h2" style={{ marginBottom: 12 }}>Etapas</h2>
            <ol className="r-steps">
              {stops.map((o, i) => {
                const tone = o.status === 'delivered' ? 'ok' : o.status === 'failed' ? 'fail' : o.id === next?.id ? 'now' : 'todo';
                return (
                  <li key={o.id} className={tone}>
                    <i />
                    <div><b>{i + 1}. {o.name}</b><small>{o.status === 'delivered' ? `Entregue${o.receiver ? ` · recebido por ${o.receiver}` : ''}` : o.status === 'failed' ? `Não entregue · ${o.occurrence?.reason ?? ''}` : `${o.neighborhood} · ${o.window}`}</small></div>
                  </li>
                );
              })}
            </ol>
          </section>
          <p className="r-small r-muted" style={{ margin: 0 }}>{SHARE_LABEL[share.state]}</p>
        </div>

        {next && <DeliverSheet open={sheet === 'deliver'} order={next} onClose={() => setSheet(null)} onSubmit={(receiver) => submit(next, { kind: 'delivered', receiver })} />}
        {next && <FailSheet open={sheet === 'fail'} order={next} onClose={() => setSheet(null)} onSubmit={(reason, notes) => submit(next, { kind: 'failed', reason, notes })} />}
      </IonContent>
    </IonPage>
  );
}

function DeliverSheet({ open, order, onClose, onSubmit }: { open: boolean; order: Order; onClose: () => void; onSubmit: (receiver: string) => Promise<boolean> }) {
  const [receiver, setReceiver] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); const ok = await onSubmit(receiver.trim()); setBusy(false); if (ok) setReceiver(''); };
  return (
    <Sheet open={open} onClose={onClose} title="Concluir entrega" subtitle={`#${order.id} · ${order.name}`}>
      <div className="r-field">Quem recebeu?
        <div className="r-chips">
          {RECEIVERS.map((r) => <button key={r} type="button" className="r-chip" aria-pressed={receiver === r} onClick={() => setReceiver(r)}>{r}</button>)}
        </div>
        <input className="r-input" placeholder="Ou digite o nome" value={RECEIVERS.includes(receiver) ? '' : receiver} onChange={(e) => setReceiver(e.target.value)} />
      </div>
      <button type="button" className="r-btn primary" disabled={busy || receiver.trim().length < 2} onClick={() => void send()}>{busy ? 'Enviando…' : 'Confirmar entrega'}</button>
    </Sheet>
  );
}

function FailSheet({ open, order, onClose, onSubmit }: { open: boolean; order: Order; onClose: () => void; onSubmit: (reason: string, notes: string) => Promise<boolean> }) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); const ok = await onSubmit(reason, notes.trim()); setBusy(false); if (ok) { setReason(''); setNotes(''); } };
  return (
    <Sheet open={open} onClose={onClose} title="Não consegui entregar" subtitle={`#${order.id} · ${order.name}`}>
      <div className="r-field">Motivo
        <div className="r-chips">
          {OCCURRENCE_REASONS.map((r) => <button key={r} type="button" className="r-chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}
        </div>
      </div>
      <label className="r-field">Comentário <span className="r-small r-muted">(opcional)</span>
        <textarea className="r-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: portão fechado, ninguém atendeu" />
      </label>
      <button type="button" className="r-btn danger" disabled={busy || !reason} onClick={() => void send()}>{busy ? 'Registrando…' : 'Registrar ocorrência'}</button>
    </Sheet>
  );
}
