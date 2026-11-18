import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { API_URL } from '../app/api';
import { Logo } from '../app/icons';

/** O que a API pública devolve (só o necessário para o cliente; sem endereço nem telefone). */
interface Tracking {
  company: string; order: number; customer: string; status: string; statusLabel: string; window: string; neighborhood: string;
  steps: string[]; step: number; failed: boolean; driver: string | null; stopsBefore: number | null; isNext: boolean;
  position: { lat: number; lng: number; heading: number | null; ageSeconds: number } | null; completed: string | null; refreshSeconds: number;
}

const TILES = (import.meta.env.VITE_MAP_TILES_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) ?? '&copy; OpenStreetMap';

/** Página do link de acompanhamento que o cliente recebe. Não precisa de login; atualiza sozinho. */
export function Rastreio({ token }: { token: string }) {
  const [info, setInfo] = useState<Tracking | null>(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let wait = 30;
      try {
        const res = await fetch(`${API_URL}/api/public/tracking/${encodeURIComponent(token)}`);
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) { setError((json as { error?: string }).error ?? 'Não foi possível carregar o acompanhamento.'); setInfo(null); return; }
        setInfo(json as Tracking); setError(''); setUpdated(new Date());
        wait = (json as Tracking).refreshSeconds;
      } catch {
        if (alive) setError('Sem conexão. Tentando de novo…');
      }
      if (alive) timer = setTimeout(() => void load(), wait * 1000);
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [token]);

  const headline = !info ? '' : info.failed ? info.statusLabel
    : info.step === 3 ? 'Sua compra foi entregue'
    : info.isNext ? 'O entregador está indo até você'
    : info.step === 2 ? (info.stopsBefore ? `Sua compra está a caminho: ${info.stopsBefore} entrega(s) antes da sua` : 'Sua compra está a caminho')
    : info.step === 1 ? 'Estamos preparando sua entrega' : 'Recebemos sua compra';

  return (
    <div className="shell track-public">
      <header className="track-public-head"><Logo /><span className="muted small">{info?.company}</span></header>
      <main className="track-public-main">
        {error && <section className="card"><h1>Acompanhamento indisponível</h1><p className="muted">{error}</p></section>}
        {info && (
          <>
            <section className="card">
              <span className="eyebrow">Compra #{info.order} · janela {info.window}</span>
              <h1>{info.customer ? `${info.customer}, ` : ''}{headline.charAt(0).toLowerCase() + headline.slice(1)}</h1>
              {info.driver && info.step === 2 && <p className="muted">Entregador: {info.driver}</p>}
              <ol className="track-steps">
                {info.steps.map((s, i) => (
                  <li key={s} className={info.failed ? '' : i < info.step ? 'ok' : i === info.step ? 'cur' : ''}><span>{i < info.step && !info.failed ? '✓' : i + 1}</span>{s}</li>
                ))}
              </ol>
              {updated && <p className="muted small">Atualizado às {updated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Esta página se atualiza sozinha.</p>}
            </section>
            {info.position && <PublicMap position={info.position} />}
          </>
        )}
      </main>
    </div>
  );
}

function PublicMap({ position }: { position: NonNullable<Tracking['position']> }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([position.lat, position.lng], 15);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    marker.current = L.circleMarker([position.lat, position.lng], { radius: 11, color: '#fff', weight: 3, fillColor: '#1b4fd8', fillOpacity: 1 }).addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []); // o mapa é criado uma vez; as posições seguintes só movem o marcador

  useEffect(() => {
    marker.current?.setLatLng([position.lat, position.lng]);
    map.current?.panTo([position.lat, position.lng], { animate: true });
  }, [position.lat, position.lng]);

  return (
    <section className="card track-public-map" aria-label="Posição do entregador">
      <div ref={el} className="track-map" role="img" aria-label="Mapa com a posição do entregador" />
      <p className="muted small">{position.ageSeconds < 60 ? 'Posição de agora há pouco.' : `Última posição há ${Math.round(position.ageSeconds / 60)} min.`}</p>
    </section>
  );
}
