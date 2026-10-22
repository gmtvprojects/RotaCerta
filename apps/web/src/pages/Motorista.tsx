import { useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  OCCURRENCE_REASONS, activeRoute, availableManifests, nextStop, routeOrders, volumesOf,
  type Order, type Route as RouteT,
} from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header, Modal, RoutePill } from './ui';

export function Motorista() {
  return (
    <Routes>
      <Route index element={<Escolha />} />
      <Route path="romaneio/:routeId" element={<Previa />} />
      <Route path="viagem" element={<Viagem />} />
      <Route path="*" element={<Navigate to="/motorista" replace />} />
    </Routes>
  );
}

/** Seletor de motorista da demonstração (não existe login real ainda). */
function AsDriver() {
  const { data, driverId, setDriver } = useStore();
  return (
    <label className="as-driver">Motorista da demonstração
      <select value={driverId} onChange={(e) => setDriver(Number(e.target.value))}>
        {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </label>
  );
}

function ManifestCard({ r, action }: { r: RouteT; action: string }) {
  const { data } = useStore();
  const os = routeOrders(data, r);
  const vehicle = data.vehicles.find((v) => v.id === r.vehicleId);
  const vols = os.reduce((n, o) => n + volumesOf(o).length, 0);
  return (
    <section className="card">
      <div className="card-head"><h2>Romaneio #{r.id}</h2><RoutePill status={r.status} /></div>
      <div className="trip-meta"><span>{vehicle?.name}</span><span>Saída {r.departure}</span><span>{os.length} paradas</span><span>{vols} volumes</span></div>
      <Link className="btn primary" to={r.status === 'active' ? 'viagem' : `romaneio/${r.id}`}>{action}</Link>
    </section>
  );
}

function Escolha() {
  const { data, driverId, role } = useStore();
  const driver = data.drivers.find((d) => d.id === driverId);
  const mine = activeRoute(data, driverId);
  const available = availableManifests(data, driverId).filter((r) => r.id !== mine?.id);
  return (
    <div className="trip">
      <Header title="Escolha seu romaneio." subtitle={`Olá, ${driver?.name.split(' ')[0] ?? 'motorista'}. ${mine ? 'Sua viagem está em andamento.' : 'Qual viagem vamos fazer agora?'}`} />
      {role === 'gestao' && <AsDriver />}
      {mine && <ManifestCard r={mine} action="Continuar viagem" />}
      {available.length > 0 && <>
        {mine && <h3 className="muted">Disponíveis após sua viagem atual</h3>}
        {available.map((r) => <ManifestCard key={r.id} r={r} action="Ver romaneio" />)}
      </>}
      {!mine && available.length === 0 && (
        <section className="card"><Empty>Nenhum romaneio disponível agora. As cargas aparecem aqui assim que a expedição termina a conferência.</Empty></section>
      )}
      <p className="muted small">Somente cargas conferidas aparecem para escolha. Uma viagem já iniciada por outro motorista não fica disponível.</p>
    </div>
  );
}

function Previa() {
  const { routeId } = useParams();
  const { data, driverId, startRoute } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const r = data.routes.find((x) => x.id === Number(routeId));
  const driver = data.drivers.find((d) => d.id === driverId);
  if (!r) return <Navigate to="/motorista" replace />;
  if (r.status === 'active' && r.driverId === driverId) return <Navigate to="/motorista/viagem" replace />;
  const os = routeOrders(data, r);
  const vehicle = data.vehicles.find((v) => v.id === r.vehicleId);

  const start = () => {
    const err = startRoute(r.id);
    if (err) { setError(err); return; }
    navigate('/motorista/viagem');
  };

  return (
    <div className="trip">
      <Header title={`Romaneio #${r.id}`} subtitle="Confira a viagem antes de começar." actions={<Link className="btn" to="/motorista">Voltar</Link>} />
      {error && <div className="banner" role="alert">{error}</div>}
      <section className="card">
        <span className="pill green">Carga conferida</span>
        <div className="trip-meta"><span>{vehicle?.name} · {vehicle?.plate}</span><span>Saída {r.departure}</span></div>
        <ol className="stops">
          {os.map((o, i) => (
            <li key={o.id}>
              <div><strong>{i + 1}. {o.name}</strong>
                <div className="muted small">{o.street}, {o.number} — {o.neighborhood} · {o.window}</div>
                <div className="muted small">{volumesOf(o).length} volume(s){o.cold || o.frozen ? ' · tem frio' : ''}{o.gas ? ' · gás' : ''}</div></div>
            </li>
          ))}
        </ol>
        <button type="button" className="primary" onClick={start}>Iniciar viagem</button>
      </section>
      <p className="muted small">Ao iniciar, este romaneio fica vinculado a {driver?.name ?? 'este motorista'}. O aviso do primeiro cliente é simulado automaticamente.</p>
    </div>
  );
}

type Dialog = 'map' | 'contact' | 'deliver' | 'occurrence' | null;

function Viagem() {
  const { data, driverId, role, finishStop } = useStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const own = activeRoute(data, driverId);
  const admin = role === 'gestao';
  const r = own ?? (admin ? data.routes.find((x) => x.status === 'active') : undefined)
    ?? data.routes.filter((x) => x.driverId === driverId && x.status === 'finished').slice(-1)[0];
  if (!r) return <Navigate to="/motorista" replace />;

  const stops = routeOrders(data, r);
  const next = nextStop(data, r);
  const done = stops.filter((o) => o.status === 'delivered' || o.status === 'failed').length;
  const delivered = stops.filter((o) => o.status === 'delivered').length;
  const failed = stops.filter((o) => o.status === 'failed').length;
  const vehicle = data.vehicles.find((v) => v.id === r.vehicleId);
  const driver = data.drivers.find((d) => d.id === r.driverId);

  const submit = (outcome: Parameters<typeof finishStop>[1]) => {
    if (!next) return;
    const err = finishStop(next.id, outcome);
    if (err) { setError(err); setDialog(null); return; }
    setError('');
    setInfo(outcome.kind === 'delivered' ? 'Entrega concluída. Aviso automático do próximo cliente simulado.' : 'Ocorrência registrada. A entrega ficou como "Não entregue".');
    setDialog(null);
  };

  if (!next) {
    return (
      <div className="trip">
        <Header title={`Romaneio #${r.id}`} subtitle="Todas as paradas desta viagem foram registradas." actions={<Link className="btn" to="/motorista">Voltar</Link>} />
        <section className="card done">
          <h1>Viagem encerrada.</h1>
          <p>{delivered} entrega(s) concluída(s){failed ? ` · ${failed} não entregue(s)` : ''}</p>
          {failed > 0 && <p className="muted small">As entregas não realizadas voltam para a equipe combinar uma nova tentativa.</p>}
          <Link className="btn primary" to="/motorista">Escolher outro romaneio</Link>
        </section>
      </div>
    );
  }

  const index = Math.min(done + 1, stops.length);
  const last = stops.filter((o) => o.status === 'onroute').length === 1;
  return (
    <div className="trip">
      <Header title="Minha rota de entregas." subtitle={`Romaneio #${r.id} · ${vehicle?.name ?? ''} · ${driver?.name ?? ''}`} actions={<Link className="btn" to="/motorista">Romaneios</Link>} />
      {role === 'gestao' && <AsDriver />}
      {error && <div className="banner" role="alert">{error}</div>}
      {info && <div className="banner info" role="status">{info}</div>}
      <div className="progress"><span>Parada {index} de {stops.length} · {done} encerradas</span><div className="bar-track"><i style={{ width: `${(done / stops.length) * 100}%` }} /></div></div>

      <section className="card next">
        <span className="eyebrow">PRÓXIMA ENTREGA · #{next.id}</span>
        <h2>{next.name}</h2>
        <p>{next.street}, {next.number}{next.complement && ` · ${next.complement}`} — {next.neighborhood}</p>
        <p className="muted">{next.window}</p>
        <p>{next.boxes.length} caixa(s) · {volumesOf(next).length} volumes{next.gas ? ` · Fora das caixas: ${next.gas} gás` : ''}</p>
        {(next.cold > 0 || next.frozen > 0) && <p className="pill blue">{next.cold ? `Caixa do frio: ${next.cold}` : ''}{next.cold && next.frozen ? ' · ' : ''}{next.frozen ? `Congelado: ${next.frozen}` : ''}</p>}
        {next.notes && <p className="muted"><strong>Observações da entrega:</strong> "{next.notes}"</p>}
        <div className="actions">
          <button type="button" onClick={() => setDialog('map')}>Mapa</button>
          <button type="button" onClick={() => setDialog('contact')}>Falar com o cliente</button>
        </div>
        <div className="actions">
          <button type="button" className="primary" onClick={() => setDialog('deliver')}>Concluir entrega</button>
          <button type="button" className="danger" onClick={() => setDialog('occurrence')}>Não consegui entregar</button>
        </div>
        <p className="muted small">{last ? 'Última entrega. Ao concluir, o romaneio será encerrado.' : 'Ao concluir, o sistema simula o aviso ao próximo cliente.'}</p>
      </section>

      {dialog === 'map' && <MapDialog o={next} onClose={() => setDialog(null)} />}
      {dialog === 'contact' && <ContactDialog o={next} onClose={() => setDialog(null)} />}
      {dialog === 'deliver' && <DeliverDialog o={next} onClose={() => setDialog(null)} onSubmit={(receiver) => submit({ kind: 'delivered', receiver })} />}
      {dialog === 'occurrence' && <OccurrenceDialog o={next} onClose={() => setDialog(null)} onSubmit={(reason, notes) => submit({ kind: 'failed', reason, notes })} />}
    </div>
  );
}

function MapDialog({ o, onClose }: { o: Order; onClose: () => void }) {
  return (
    <Modal title="Endereço da próxima parada" onClose={onClose} footer={<button type="button" className="primary" onClick={onClose}>Fechar</button>}>
      <span className="pill amber">Endereço fictício</span>
      <strong>{o.name}</strong>
      <p>{o.street}, {o.number}<br />{o.neighborhood}{o.complement && <><br />{o.complement}</>}</p>
      {o.reference && <p className="muted">Referência: {o.reference}</p>}
      <p className="muted small">No aplicativo real, o botão abrirá o endereço no app de navegação. Aqui não abrimos o mapa para não traçar rota até um endereço inventado.</p>
    </Modal>
  );
}

function ContactDialog({ o, onClose }: { o: Order; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const digits = phone.replace(/\D/g, '');
  const valid = digits.length === 10 || digits.length === 11;
  return (
    <Modal title="Falar com o cliente" onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Voltar</button>
      {valid
        ? <a className="btn primary" href={`https://wa.me/55${digits}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Abrir conversa de teste</a>
        : <button type="button" className="primary" disabled>Abrir conversa de teste</button>}
    </>}>
      <div><strong>{o.name}</strong><div className="muted small">#{o.id} · {o.neighborhood} · {o.phone || 'Telefone não informado'}</div></div>
      <span className="pill amber">Contato de demonstração</span>
      <p className="muted small">Este atalho abre uma conversa manual. Não conclui a entrega e não substitui os avisos automáticos da rota. Os telefones deste cenário são fictícios: informe um número de teste com DDD.</p>
      <label className="field">Número de teste (com DDD)
        <input type="tel" inputMode="tel" maxLength={24} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="DDD + número do WhatsApp" />
      </label>
      <p className="muted small">Use um número seu ou autorizado. O campo não altera o cadastro do cliente e nenhuma mensagem é enviada por este botão. Use com o veículo estacionado.</p>
    </Modal>
  );
}

function DeliverDialog({ o, onClose, onSubmit }: { o: Order; onClose: () => void; onSubmit: (receiver: string) => void }) {
  const [receiver, setReceiver] = useState('');
  return (
    <Modal title="Concluir entrega" onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Cancelar</button>
      <button type="button" className="primary" onClick={() => onSubmit(receiver)}>Confirmar entrega</button>
    </>}>
      <div><strong>#{o.id} · {o.name}</strong><div className="muted small">{o.street}, {o.number} — {o.neighborhood}</div></div>
      <label className="field">Quem recebeu? (opcional)
        <input value={receiver} onChange={(e) => setReceiver(e.target.value)} maxLength={80} placeholder="Nome de quem recebeu" />
      </label>
    </Modal>
  );
}

function OccurrenceDialog({ o, onClose, onSubmit }: { o: Order; onClose: () => void; onSubmit: (reason: string, notes: string) => void }) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal title="Registrar ocorrência" onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Cancelar</button>
      <button type="button" className="danger" onClick={() => (reason ? onSubmit(reason, notes) : setError('Selecione o motivo.'))}>Registrar ocorrência</button>
    </>}>
      <div><strong>#{o.id} · {o.name}</strong><div className="muted small">A ocorrência não será registrada como entrega concluída.</div></div>
      <label className="field">O que aconteceu? *
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Selecione o motivo</option>
          {OCCURRENCE_REASONS.map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      <label className="field">Observações
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small">Esta tentativa será marcada como "Não entregue". A equipe deve combinar a solução ou uma nova tentativa.</p>
    </Modal>
  );
}
