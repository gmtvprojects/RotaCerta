import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { call } from '../app/api';
import { useStore } from '../app/store';
import { ReasonDialog } from './OrderActions';
import { Icon } from '../app/icons';
import { PageSkeleton } from './Skeletons';
import { Header, Modal } from './ui';

interface Last { lat: number; lng: number; accuracy: number | null; speed: number | null; heading: number | null; recordedAt: string }
interface Live {
  routeId: number; vehicle: string | null; driverId: number | null; driverName: string | null; departure: string;
  stops: number; done: number; current: { orderId: number; name: string; neighborhood: string; street: string; number: string } | null;
  last: Last | null; canSimulate?: boolean; simulating?: boolean;
}
interface TrailPoint { lat: number; lng: number; recordedAt: string }

/** Mapa: por padrão o OpenStreetMap (uso leve). Em produção, aponte `VITE_MAP_TILES_URL` para um provedor contratado. */
const TILES = (import.meta.env.VITE_MAP_TILES_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) ?? '&copy; OpenStreetMap';

const FRESH_S = 60;
const STALE_S = 180;
const TRAIL_MAX = 1500;
const ageOf = (iso: string, now: number) => Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
type Tone = 'green' | 'amber' | 'red';
const freshness = (age: number | null): Tone => (age === null ? 'red' : age <= FRESH_S ? 'green' : age <= STALE_S ? 'amber' : 'red');
const TONE_LABEL: Record<Tone, string> = { green: 'Ao vivo', amber: 'Sinal fraco', red: 'Sem sinal' };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ageLabel(age: number) {
  if (age < 10) return 'agora';
  if (age < 60) return `há ${age} s`;
  if (age < 3600) return `há ${Math.floor(age / 60)} min`;
  return `há ${Math.floor(age / 3600)} h`;
}
const initialsOf = (name: string | null) => (name ?? 'M').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Painel ao vivo das viagens em andamento: onde cada motorista está, qual a parada atual e o percurso. */
export function Acompanhamento() {
  const { data, subscribeLocations } = useStore();
  const [live, setLive] = useState<Live[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [follow, setFollow] = useState(true);
  const [simBusy, setSimBusy] = useState(false);

  const load = useCallback(() => call<Live[]>('GET', '/tracking')
    .then((l) => { setLive(l); setError(''); })
    .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Falha ao carregar.'))
    .finally(() => setLoaded(true)), []);
  // recarrega quando as entregas mudam (parada concluída, viagem iniciada ou encerrada) e como reserva a cada 30 s
  useEffect(() => { void load(); }, [load, data]);
  useEffect(() => { const t = setInterval(() => void load(), 30_000); return () => clearInterval(t); }, [load]);
  // o "há X s" anda sozinho
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 2_000); return () => clearInterval(t); }, []);

  // seleciona a primeira viagem ao abrir; se a selecionada terminar, passa para outra
  useEffect(() => {
    if (!live.length) { setSelected(null); return; }
    setSelected((cur) => (cur !== null && live.some((l) => l.routeId === cur) ? cur : live[0].routeId));
  }, [live]);

  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selected;
  // posições chegam por WebSocket: atualiza o ponto e acrescenta à trilha, sem recarregar nada
  useEffect(() => subscribeLocations((m) => {
    setLive((prev) => prev.map((l) => (l.routeId === m.routeId ? { ...l, last: { lat: m.lat, lng: m.lng, accuracy: m.accuracy, speed: m.speed, heading: m.heading, recordedAt: m.recordedAt } } : l)));
    if (selectedRef.current === m.routeId) setTrail((prev) => [...prev, { lat: m.lat, lng: m.lng, recordedAt: m.recordedAt }].slice(-TRAIL_MAX));
    setNow(Date.now());
  }), [subscribeLocations]);

  useEffect(() => {
    setTrail([]);
    setFollow(true);
    if (selected === null) return;
    let alive = true;
    call<TrailPoint[]>('GET', `/routes/${selected}/track?limit=${TRAIL_MAX}`).then((t) => { if (alive) setTrail(t); }).catch(() => undefined);
    return () => { alive = false; };
  }, [selected]);

  const current = useMemo(() => live.find((l) => l.routeId === selected) ?? null, [live, selected]);
  const age = current?.last ? ageOf(current.last.recordedAt, now) : null;
  const tone = freshness(age);
  const left = current ? Math.max(0, current.stops - current.done - (current.current ? 1 : 0)) : 0;
  const released = data.routes.filter((r) => r.status === 'released');

  const simulate = async (on: boolean) => {
    if (!current) return;
    setSimBusy(true);
    try { await call(on ? 'POST' : 'DELETE', `/routes/${current.routeId}/simulate`, on ? { minutes: 15 } : undefined); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível simular.'); }
    finally { setSimBusy(false); }
  };

  if (!loaded) return <PageSkeleton shape="map" />;
  if (live.length === 0) {
    return (
      <>
        <Header title="Acompanhar viagens" subtitle="Onde cada motorista está e qual a próxima parada, em tempo real." />
        {error && <p className="error" role="alert">{error}</p>}
        <section className="card trk-empty">
          <span className="trk-empty-ico"><Icon name="truck" size={26} /></span>
          <h2>Nenhuma viagem em andamento</h2>
          <p className="muted">Quando o motorista iniciar o romaneio no app (ou na tela Motorista do navegador), ele aparece aqui no mapa e a posição atualiza a cada poucos segundos.</p>
          {released.length > 0 && (
            <div className="trk-waiting">
              <b>Liberados, aguardando o motorista iniciar</b>
              {released.map((r) => (
                <div key={r.id} className="trk-wait-row">
                  <span>Romaneio #{r.id}</span>
                  <span className="muted small">{data.drivers.find((d) => d.id === r.driverId)?.name ?? 'Sem motorista definido'} · {r.orders.length} entrega(s) · saída {r.departure || 'sem horário'}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      <header className="trk-head">
        <div>
          <span className="eyebrow">Romaneio #{current?.routeId ?? '—'} · {current?.driverName ?? 'Motorista'}</span>
          <h1>{!current ? 'Carregando…' : current.current ? `Indo para ${current.current.name}` : 'Todas as paradas concluídas'}</h1>
          {current && <p className="muted">{current.current ? `${current.current.street}, ${current.current.number} · ${current.current.neighborhood} · ` : ''}{current.done} de {current.stops} paradas · saída {current.departure}</p>}
        </div>
        <span className={`trk-live ${tone}`} role="status"><i />{TONE_LABEL[tone]}{age !== null && <small>{ageLabel(age)}</small>}</span>
      </header>

      <div className="trk-grid">
        <section className="card trk-map-card" aria-label="Mapa">
          <TrackMap live={live} selected={current} trail={trail} now={now} follow={follow} onSelect={setSelected} onUserMove={() => setFollow(false)} />
          <div className="trk-map-tools">
            <button type="button" className={follow ? 'on' : ''} onClick={() => setFollow((f) => !f)} aria-pressed={follow}><Icon name="pin" size={15} />{follow ? 'Seguindo' : 'Seguir motorista'}</button>
          </div>
          <div className="rt-legend">
            <span><i className="bar" />Percorrido</span>
            <span><i className="dot green" />Ao vivo (até 1 min)</span>
            <span><i className="dot amber" />Sinal fraco (até 3 min)</span>
            <span><i className="dot gray" />Sem sinal</span>
          </div>
        </section>

        <aside className="trk-side">
          <section className="card trk-list" aria-label="Viagens ao vivo">
            <div className="card-head"><h2>Viagens ao vivo</h2><span className="pill blue">{live.length}</span></div>
            {live.map((l) => {
              const a = l.last ? ageOf(l.last.recordedAt, now) : null;
              const t = freshness(a);
              return (
                <button type="button" key={l.routeId} className={`trk-row ${l.routeId === selected ? 'sel' : ''}`} onClick={() => setSelected(l.routeId)} aria-pressed={l.routeId === selected}>
                  <span className="avatar">{initialsOf(l.driverName)}</span>
                  <span className="trk-row-main"><b>{l.driverName ?? 'Motorista'}</b><span className="muted small">#{l.routeId} · {l.done}/{l.stops} paradas{l.current ? ` · ${l.current.neighborhood}` : ''}</span></span>
                  <span className={`trk-age ${t}`}><i />{a === null ? 'sem posição' : ageLabel(a)}</span>
                </button>
              );
            })}
          </section>

          {current && (
            <>
              <section className="card" aria-label="Etapas">
                <h2>Etapas</h2>
                <ol className="rt-steps">
                  <li className="ok"><span /><div><b>Saída do romaneio</b><small>{current.vehicle} · {current.departure}</small></div></li>
                  <li className="ok"><span /><div><b>{current.done} de {current.stops} paradas concluídas</b><small>{current.done === current.stops ? 'Viagem completa' : 'Já entregues'}</small></div></li>
                  {current.current
                    ? <li className="now"><span /><div><b>Agora: {current.current.name}</b><small>{current.current.street}, {current.current.number} · {current.current.neighborhood}</small></div></li>
                    : <li className="now"><span /><div><b>Sem próxima parada</b><small>Todas as entregas foram registradas.</small></div></li>}
                  <li className="todo"><span /><div><b>{left} parada(s) depois</b><small>Ainda por fazer</small></div></li>
                </ol>
                {age !== null && age > STALE_S && <p className="error small" role="alert">Sem posição nova há mais de {Math.floor(STALE_S / 60)} min. Verifique com o motorista (sinal, bateria ou app fechado).</p>}
                {age === null && <p className="muted small">Ainda sem posição: o motorista precisa estar com a viagem aberta no app e a localização liberada.</p>}
              </section>
              <section className="card trk-driver" aria-label="Motorista">
                <div className="avatar">{initialsOf(current.driverName)}</div>
                <div className="trk-driver-main">
                  <b>{current.driverName ?? 'Motorista'}</b>
                  <span className="muted small">{current.vehicle ?? 'Veículo'}</span>
                </div>
                <div className="trk-metrics">
                  <span><b>{current.last?.speed != null ? Math.round(current.last.speed * 3.6) : '—'}</b><small>km/h</small></span>
                  <span><b>{current.last?.accuracy != null ? Math.round(current.last.accuracy) : '—'}</b><small>m de precisão</small></span>
                </div>
              </section>
              <TripActions live={current} onDone={() => void load()} />
              {current.canSimulate && (
                <div className="trk-sim">
                  <span className="muted small">Ambiente de teste: simular o deslocamento deste motorista por ruas (15 min).</span>
                  <button type="button" disabled={simBusy} onClick={() => void simulate(!current.simulating)}>{current.simulating ? 'Parar simulação' : 'Simular deslocamento'}</button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </>
  );
}

/** Marcador do motorista: seta na direção do movimento, cor pela idade da posição, anel quando selecionado. */
function driverIcon(tone: Tone, heading: number | null, selected: boolean, initials: string) {
  const arrow = heading == null ? '' : `<span class="trk-arrow" style="transform: rotate(${heading}deg)"></span>`;
  return L.divIcon({
    className: '',
    html: `<span class="trk-marker ${tone} ${selected ? 'sel' : ''}">${arrow}<span class="trk-dot">${initials}</span></span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function TrackMap({ live, selected, trail, now, follow, onSelect, onUserMove }: {
  live: Live[]; selected: Live | null; trail: TrailPoint[]; now: number; follow: boolean; onSelect: (id: number) => void; onUserMove: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<number, L.Marker>());
  const anim = useRef(new Map<number, number>());
  const line = useRef<L.Polyline | null>(null);
  const fitted = useRef<number | null>(null);
  const userMove = useRef(onUserMove);
  userMove.current = onUserMove;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView([-15.78, -47.93], 4);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    // arrastar o mapa = a pessoa quer olhar outra coisa: para de seguir o motorista
    m.on('dragstart', () => userMove.current());
    map.current = m;
    const resize = setTimeout(() => m.invalidateSize(), 100);
    return () => { clearTimeout(resize); anim.current.forEach((f) => cancelAnimationFrame(f)); m.remove(); map.current = null; markers.current.clear(); line.current = null; };
  }, []);

  /** Desliza o marcador até a nova posição (sem pulos), se o movimento for curto. */
  const glide = (id: number, mk: L.Marker, to: L.LatLng) => {
    const from = mk.getLatLng();
    cancelAnimationFrame(anim.current.get(id) ?? 0);
    if (reducedMotion() || from.distanceTo(to) > 1500 || from.equals(to)) { mk.setLatLng(to); return; }
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const e = 1 - (1 - k) ** 3;
      mk.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]);
      if (k < 1) anim.current.set(id, requestAnimationFrame(step));
    };
    anim.current.set(id, requestAnimationFrame(step));
  };

  // um marcador por viagem
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const ids = new Set(live.map((l) => l.routeId));
    for (const [id, mk] of markers.current) if (!ids.has(id)) { mk.remove(); markers.current.delete(id); }
    for (const l of live) {
      if (!l.last) continue;
      const isSel = selected?.routeId === l.routeId;
      const icon = driverIcon(freshness(ageOf(l.last.recordedAt, now)), l.last.heading, isSel, initialsOf(l.driverName));
      const to = L.latLng(l.last.lat, l.last.lng);
      let mk = markers.current.get(l.routeId);
      if (!mk) {
        mk = L.marker(to, { icon, keyboard: false }).addTo(m);
        mk.on('click', () => onSelect(l.routeId));
        mk.bindTooltip(`${l.driverName ?? 'Motorista'} · #${l.routeId}`, { direction: 'top', offset: [0, -20] });
        markers.current.set(l.routeId, mk);
      } else {
        mk.setIcon(icon);
        glide(l.routeId, mk, to);
      }
      mk.setZIndexOffset(isSel ? 1000 : 0);
    }
  }, [live, selected, now, onSelect]);

  // trilha da viagem escolhida
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    line.current?.remove();
    // um trecho por período contínuo: sem sinal por mais de 2 min (ou um salto grande) não vira uma reta falsa no mapa
    const segments: Array<Array<[number, number]>> = [];
    let prev: TrailPoint | null = null;
    for (const p of trail) {
      const gap = prev && (Date.parse(p.recordedAt) - Date.parse(prev.recordedAt) > 120_000 || L.latLng(prev.lat, prev.lng).distanceTo([p.lat, p.lng]) > 500);
      if (!prev || gap) segments.push([]);
      segments[segments.length - 1].push([p.lat, p.lng]);
      prev = p;
    }
    const drawn = segments.filter((seg) => seg.length > 1);
    line.current = drawn.length
      ? L.polyline(drawn, { color: getComputedStyle(el.current!).color || '#1b4fd8', weight: 4, opacity: 0.8, lineJoin: 'round' }).addTo(m)
      : null;
  }, [trail]);

  // enquadra a viagem escolhida ao abrir; depois, se estiver "seguindo", acompanha o motorista
  useEffect(() => {
    const m = map.current;
    if (!m || !selected?.last) return;
    const at: [number, number] = [selected.last.lat, selected.last.lng];
    if (fitted.current !== selected.routeId) {
      fitted.current = selected.routeId;
      m.setView(at, Math.max(m.getZoom(), 15));
    } else if (follow) {
      m.panTo(at, { animate: !reducedMotion(), duration: 0.9 });
    }
  }, [selected, follow]);

  const withPos = live.filter((l) => l.last);
  const fitAll = () => {
    const m = map.current;
    const points = withPos.map((l) => [l.last!.lat, l.last!.lng] as [number, number]);
    if (!m || !points.length) return;
    userMove.current();
    if (points.length === 1) m.setView(points[0], Math.max(m.getZoom(), 14));
    else m.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 });
  };

  return (
    <div className="track-map-wrap">
      <div className="track-map" ref={el} role="img" aria-label="Mapa com a posição dos motoristas em viagem" />
      {withPos.length > 1 && <button type="button" className="track-fit" onClick={fitAll}>Ver todos ({withPos.length})</button>}
      {withPos.length === 0 && <div className="trk-map-empty"><b>Aguardando a primeira posição</b><span>O mapa centraliza no motorista assim que o app dele enviar a localização.</span></div>}
    </div>
  );
}

/** Exceções de uma viagem em andamento: trocar de motorista ou interromper. */
function TripActions({ live, onDone }: { live: Live; onDone: () => void }) {
  const { data, command } = useStore();
  const [dialog, setDialog] = useState<'driver' | 'interrupt' | null>(null);
  const [driverId, setDriverId] = useState<number | ''>('');
  const [error, setError] = useState('');
  const busyDrivers = new Set(data.routes.filter((r) => r.status === 'active' && r.driverId != null).map((r) => r.driverId));
  const options = data.drivers.filter((d) => d.active !== false && d.id !== live.driverId && !busyDrivers.has(d.id));

  const reassign = async () => {
    if (driverId === '') { setError('Escolha o novo motorista.'); return; }
    const err = await command({ method: 'POST', path: `/routes/${live.routeId}/driver`, body: { driverId } });
    if (err) setError(err); else { setDialog(null); onDone(); }
  };

  return (
    <div className="actions rt-trip-actions">
      <button type="button" onClick={() => { setError(''); setDialog('driver'); }}>Trocar motorista</button>
      <button type="button" className="danger" onClick={() => setDialog('interrupt')}>Interromper viagem</button>
      {dialog === 'driver' && (
        <Modal title={`Trocar o motorista do romaneio #${live.routeId}`} onClose={() => setDialog(null)} footer={<>
          <button type="button" onClick={() => setDialog(null)}>Cancelar</button>
          <button type="button" className="primary" onClick={() => void reassign()}>Trocar</button>
        </>}>
          <p className="muted">Hoje: {live.driverName}. O motorista antigo deixa de enviar posição e de registrar paradas; o novo assume a próxima entrega.</p>
          <label className="field">Novo motorista
            <select value={driverId} onChange={(e) => setDriverId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Selecione</option>
              {options.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          {options.length === 0 && <p className="muted small">Não há outro motorista livre (ativo e fora de viagem).</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </Modal>
      )}
      {dialog === 'interrupt' && (
        <ReasonDialog title={`Interromper o romaneio #${live.routeId}`} confirm="Interromper viagem" danger
          hint="As paradas que faltam ficam como 'não entregue: viagem interrompida'. Quando os volumes voltarem, confirme a devolução na entrega e agende nova tentativa."
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => { const err = await command({ method: 'POST', path: `/routes/${live.routeId}/interrupt`, body: { reason } }); if (!err) onDone(); return !err; }} />
      )}
    </div>
  );
}
