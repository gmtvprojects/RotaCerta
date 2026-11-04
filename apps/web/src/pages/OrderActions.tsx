import { useState } from 'react';
import { DELIVERY_WINDOWS, type Order } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Modal } from './ui';

type Dialog = 'edit' | 'cancel' | 'requeue' | null;

const EDITABLE: Order['status'][] = ['draft', 'awaiting', 'ready', 'queued', 'loading', 'released'];
const CANCELLABLE: Order['status'][] = [...EDITABLE, 'failed'];

/** Correções e exceções de uma entrega: editar dados, cancelar, confirmar devolução e agendar nova tentativa. */
export function OrderActions({ order: o }: { order: Order }) {
  const { role, data, command } = useStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState('');
  if (!role || role === 'motorista') return null;

  const route = data.routes.find((r) => r.id === o.routeId);
  const canReturn = (role === 'expedicao' || role === 'gestao') && o.status === 'failed' && !o.returned && route?.status !== 'active';
  const waitingTrip = o.status === 'failed' && !o.returned && route?.status === 'active';

  const act = async (path: string, body?: unknown) => {
    setError('');
    const err = await command({ method: 'POST', path, body });
    if (err) setError(err);
    return !err;
  };

  const buttons = [
    EDITABLE.includes(o.status) && <button key="e" type="button" onClick={() => setDialog('edit')}>Editar dados</button>,
    canReturn && <button key="r" type="button" className="primary" onClick={() => void act(`/orders/${o.id}/return`)}>Confirmar devolução dos volumes</button>,
    o.status === 'failed' && o.returned && <button key="q" type="button" className="primary" onClick={() => setDialog('requeue')}>Agendar nova tentativa</button>,
    CANCELLABLE.includes(o.status) && <button key="c" type="button" className="danger" onClick={() => setDialog('cancel')}>Cancelar entrega</button>,
  ].filter(Boolean);

  return (
    <>
      {o.status === 'cancelled' && o.cancelled && <div className="banner"><strong>Cancelada: {o.cancelled.reason}</strong><div className="muted small">{o.cancelled.at} · {o.cancelled.actor}</div></div>}
      {o.status === 'failed' && (
        <p className="muted small">
          {o.returned ? `Volumes devolvidos (${o.returned.at}, ${o.returned.actor}). Pode agendar nova tentativa ou cancelar.`
            : waitingTrip ? 'Os volumes voltam com o motorista. A devolução é confirmada quando a viagem terminar.'
              : 'Confirme a devolução dos volumes para liberar a nova tentativa.'}
        </p>
      )}
      {buttons.length > 0 && <div className="actions">{buttons}</div>}
      {error && <p className="error" role="alert">{error}</p>}
      {dialog === 'edit' && <EditDialog order={o} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && (
        <ReasonDialog title={`Cancelar a entrega #${o.id}`} confirm="Cancelar entrega" danger
          hint={o.routeId && route && route.status !== 'finished' ? 'A entrega sai da carga e a conferência dela é desfeita.' : undefined}
          onClose={() => setDialog(null)} onSubmit={(reason) => act(`/orders/${o.id}/cancel`, { reason })} />
      )}
      {dialog === 'requeue' && <RequeueDialog order={o} onClose={() => setDialog(null)} onSubmit={(b) => act(`/orders/${o.id}/requeue`, b)} />}
    </>
  );
}

export function ReasonDialog({ title, confirm, hint, danger, onClose, onSubmit }: {
  title: string; confirm: string; hint?: string; danger?: boolean; onClose: () => void; onSubmit: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (reason.trim().length < 3) { setError('Informe o motivo.'); return; }
    setBusy(true);
    const ok = await onSubmit(reason.trim());
    setBusy(false);
    if (ok) onClose(); else setError('Não foi possível concluir. Veja a mensagem na tela.');
  };
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Voltar</button>
      <button type="button" className={danger ? 'danger' : 'primary'} disabled={busy} onClick={() => void submit()}>{confirm}</button>
    </>}>
      {hint && <p className="muted">{hint}</p>}
      <label className="field">Motivo<input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="Ex.: cliente desistiu" /></label>
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  );
}

function RequeueDialog({ order: o, onClose, onSubmit }: { order: Order; onClose: () => void; onSubmit: (b: { window: string; notes: string }) => Promise<boolean> }) {
  const [window, setWindow] = useState<string>(o.window);
  const [notes, setNotes] = useState(o.notes);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Nova tentativa · entrega #${o.id}`} onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Voltar</button>
      <button type="button" className="primary" disabled={busy} onClick={async () => { setBusy(true); const ok = await onSubmit({ window, notes }); setBusy(false); if (ok) onClose(); }}>Colocar na fila</button>
    </>}>
      <p className="muted">Anterior: {o.occurrence?.reason ?? 'não entregue'}. A entrega volta para "Pronta para planejar" com as mesmas caixas.</p>
      <label className="field">Nova janela de entrega
        <select value={window} onChange={(e) => setWindow(e.target.value)}>{DELIVERY_WINDOWS.map((w) => <option key={w}>{w}</option>)}</select>
      </label>
      <label className="field">Observações<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    </Modal>
  );
}

function EditDialog({ order: o, onClose }: { order: Order; onClose: () => void }) {
  const { data, command } = useStore();
  const [f, setF] = useState({ name: o.name, phone: o.phone, neighborhood: o.neighborhood, street: o.street, number: o.number, complement: o.complement, reference: o.reference, window: o.window, notes: o.notes, consent: o.consent });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    const changed = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== o[k as keyof Order]));
    if (!Object.keys(changed).length) { setError('Nada foi alterado.'); return; }
    setBusy(true);
    const err = await command({ method: 'PATCH', path: `/orders/${o.id}`, body: changed });
    setBusy(false);
    if (err) setError(err); else onClose();
  };

  return (
    <Modal title={`Editar entrega #${o.id}`} onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Cancelar</button>
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>Salvar</button>
    </>}>
      <label className="field">Nome<input value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
      <label className="field">Telefone<input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
      <label className="field">Bairro
        <select value={f.neighborhood} onChange={(e) => set('neighborhood', e.target.value)}>{data.neighborhoods.map((n) => <option key={n.name} value={n.name}>{n.name} · {n.zone}</option>)}</select>
      </label>
      <label className="field">Rua<input value={f.street} onChange={(e) => set('street', e.target.value)} /></label>
      <label className="field">Número<input value={f.number} onChange={(e) => set('number', e.target.value)} /></label>
      <label className="field">Complemento<input value={f.complement} onChange={(e) => set('complement', e.target.value)} /></label>
      <label className="field">Referência<input value={f.reference} onChange={(e) => set('reference', e.target.value)} /></label>
      <label className="field">Janela de entrega
        <select value={f.window} onChange={(e) => set('window', e.target.value)}>{DELIVERY_WINDOWS.map((w) => <option key={w}>{w}</option>)}</select>
      </label>
      <label className="field">Observações<input value={f.notes} onChange={(e) => set('notes', e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} /> Cliente autorizou avisos por WhatsApp</label>
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  );
}
