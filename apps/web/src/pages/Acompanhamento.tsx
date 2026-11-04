import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { call } from '../app/api';
import { useStore } from '../app/store';
import { ReasonDialog } from './OrderActions';
import { Empty, Header, Modal } from './ui';

interface Last { lat: number; lng: number; accuracy: number | null; speed: number | null; heading: number | null; recordedAt: string }
interface Live {
  routeId: number; vehicle: string | null; driverId: number | null; driverName: string | null; departure: string;
  stops: number; done: number; current: { orderId: number; name: string; neighborhood: string; street: string; number: string } | null;
  last: Last | null;
}
interface TrailPoint { lat: number; lng: number; recordedAt: string }

/** Mapa: por padrão o OpenStreetMap (uso leve). Em produção, aponte `VITE_MAP_TILES_URL` para um provedor contratado. */
const TILES = (import.meta.env.VITE_MAP_TILES_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) ?? '&copy; OpenStreetMap';

const FRESH_S = 60;
const STALE_S = 180;
const ageOf = (iso: string, now: number) => Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
const freshness = (age: number) => (age <= FRESH_S ? 'green' : age <= STALE_S ? 'amber' : 'red');
const COLORS = { green: '#16a34a', amber: '#d97706', red: '#9ca3af' } as const;

function ageLabel(age: number) {
  if (age < 10) return 'agora';
  if (age < 60) return `há ${age} s`;
  if (age < 3600) return `há ${Math.floor(age / 60)} min`;
  return `há ${Math.floor(age / 3600)} h`;
}

/** Painel ao vivo das viagens em andamento: onde cada motorista está, qual a parada atual e o percurso. */
export function Acompanhamento() {
  const { data, subscribeLocations } = useStore();
  const [live, setLive] = useState<Live[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => call<Live[]>('GET', '/tracking').then((l) => { setLive(l); setError(''); }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Falha ao carregar.')), []);
  // recarrega quando as entregas mudam (parada concluída, viagem iniciada ou encerrada) e como reserva a cada 30 s
  useEffect(() => { void load(); }, [load, data]);
  useEffect(() => { const t = setInterval(() => void load(), 30_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5_000); return () => clearInterval(t); }, []);

  // seleciona a primeira viagem ao abrir; se a selecionada terminar, volta ao estado vazio
  useEffect(() => {
    if (!live.length) { setSelected(null); return; }
    setSelected((cur) => (cur !== null && live.some((l) => l.routeId === cur) ? cur : live[0].routeId));
  }, [live]);

  // posições chegam por WebSocket: atualiza o ponto e acrescenta à trilha
  useEffect(() => subscribeLocations((m) => {
    setLive((prev) => prev.map((l) => (l.routeId === m.routeId ? { ...l, last: { lat: m.lat, lng: m.lng, accuracy: m.accuracy, speed: m.speed, heading: m.heading, recordedAt: m.recordedAt } } : l)));
    setTrail((prev) => (selectedRef.current === m.routeId ? [...prev, { lat: m.lat, lng: m.lng, recordedAt: m.recordedAt }] : prev));
  }), [subscribeLocations]);
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    setTrail([]);
    if (selected === null) return;
    let alive = true;
    call<TrailPoint[]>('GET', `/routes/${selected}/track?limit=2000`).then((t) => { if (alive) setTrail(t); }).catch(() => undefined);
    return () => { alive = false; };
  }, [selected]);

  const current = useMemo(() => live.find((l) => l.routeId === selected) ?? null, [live, selected]);

  return (
    <>
      <Header title="Viagens ao vivo." subtitle="Onde cada motorista está e qual a próxima parada." />
      {error && <p className="error" role="alert">{error}</p>}
      {live.length === 0 ? (
        <Empty>Nenhuma viagem em andamento. Quando um motorista iniciar o romaneio, ele aparece aqui.</Empty>
      ) : (
        <div className="track">
          <div className="track-list">
            {live.map((l) => {
              const age = l.last ? ageOf(l.last.recordedAt, now) : null;
              const tone = age === null ? 'red' : freshness(age);
              return (
                <button type="button" key={l.routeId} className={`track-card ${selected === l.routeId ? 'on' : ''}`} onClick={() => setSelected(l.routeId)}>
                  <strong>Romaneio #{l.routeId}</strong>
                  <span>{l.driverName ?? 'Motorista'} · {l.vehicle}</span>
                  <span className="muted small">{l.done} de {l.stops} paradas</span>
                  {l.current && <span className="small">Próxima: {l.current.name} — {l.current.street}, {l.current.number} ({l.current.neighborhood})</span>}
                  <span className={`pill ${tone === 'green' ? 'green' : tone === 'amber' ? 'amber' : 'red'}`}>
                    {l.last && age !== null ? `${ageLabel(age)}${l.last.speed ? ` · ${Math.round(l.last.speed * 3.6)} km/h` : ''}` : 'Aguardando a primeira posição'}
                  </span>
                  {age !== null && age > STALE_S && <span className="small error">Sem posição nova há mais de {Math.floor(STALE_S / 60)} min. Verifique com o motorista.</span>}
                </button>
              );
            })}
          </div>
          <div>
            <TrackMap live={live} selected={current} trail={trail} now={now} onSelect={setSelected} />
            {current && <TripActions live={current} onDone={() => void load()} />}
          </div>
        </div>
      )}
    </>
  );
}

function TrackMap({ live, selected, trail, now, onSelect }: { live: Live[]; selected: Live | null; trail: TrailPoint[]; now: number; onSelect: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<number, L.CircleMarker>());
  const line = useRef<L.Polyline | null>(null);
  const fitted = useRef<number | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView([-15.78, -47.93], 4);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    map.current = m;
    const resize = setTimeout(() => m.invalidateSize(), 100);
    return () => { clearTimeout(resize); m.remove(); map.current = null; markers.current.clear(); line.current = null; };
  }, []);

  // um marcador por viagem, colorido pela idade da última posição
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const ids = new Set(live.map((l) => l.routeId));
    for (const [id, mk] of markers.current) if (!ids.has(id)) { mk.remove(); markers.current.delete(id); }
    for (const l of live) {
      if (!l.last) continue;
      const color = COLORS[freshness(ageOf(l.last.recordedAt, now))];
      const isSel = selected?.routeId === l.routeId;
      let mk = markers.current.get(l.routeId);
      if (!mk) { mk = L.circleMarker([l.last.lat, l.last.lng], { radius: 10 }).addTo(m); mk.on('click', () => onSelect(l.routeId)); markers.current.set(l.routeId, mk); }
      mk.setLatLng([l.last.lat, l.last.lng]);
      mk.setStyle({ color: isSel ? '#152540' : '#fff', weight: isSel ? 3 : 2, fillColor: color, fillOpacity: 0.95 });
      mk.bindTooltip(`#${l.routeId} · ${l.driverName ?? ''}`, { direction: 'top' });
    }
  }, [live, selected, now, onSelect]);

  // trilha da viagem selecionada
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    line.current?.remove();
    line.current = trail.length > 1 ? L.polyline(trail.map((p) => [p.lat, p.lng] as [number, number]), { color: '#2563eb', weight: 4, opacity: 0.7 }).addTo(m) : null;
  }, [trail]);

  // enquadra a viagem escolhida uma vez (depois o usuário mexe no mapa à vontade)
  useEffect(() => {
    const m = map.current;
    if (!m || !selected?.last || fitted.current === selected.routeId) return;
    fitted.current = selected.routeId;
    m.setView([selected.last.lat, selected.last.lng], Math.max(m.getZoom(), 14));
  }, [selected]);

  return <div className="track-map" ref={el} role="img" aria-label="Mapa com a posição dos motoristas em viagem" />;
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
    <div className="actions" style={{ marginTop: 12 }}>
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
