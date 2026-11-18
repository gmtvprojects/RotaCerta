import { useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError, call } from './api';

interface Point { lat: number; lng: number; accuracy?: number; speed?: number; heading?: number; recordedAt: string }

export type ShareState = 'starting' | 'sharing' | 'denied' | 'unsupported' | 'error' | 'stopped';

const SAMPLE_MS = 5_000;
const SEND_MS = 8_000;
const MAX_BUFFER = 500;

const finite = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : undefined);

/**
 * Fila de pontos guardada no aparelho: se o app fechar, recarregar ou o celular reiniciar sem sinal, os pontos da
 * viagem não se perdem e são enviados quando ela volta (o servidor ignora repetidos e recusa pontos com mais de 24 h).
 */
const queueKey = (routeId: number) => `rotacerta:gps:${routeId}`;
function loadQueue(routeId: number): Point[] {
  try {
    const raw = JSON.parse(localStorage.getItem(queueKey(routeId)) ?? '[]') as Point[];
    const cutoff = Date.now() - 23 * 3_600_000;
    return Array.isArray(raw) ? raw.filter((p) => typeof p?.lat === 'number' && Date.parse(p.recordedAt) > cutoff).slice(-MAX_BUFFER) : [];
  } catch { return []; }
}
function saveQueue(routeId: number, points: Point[]) {
  try {
    if (points.length) localStorage.setItem(queueKey(routeId), JSON.stringify(points));
    else localStorage.removeItem(queueKey(routeId));
  } catch { /* sem armazenamento: fica só na memória */ }
}

/**
 * Compartilha a posição do motorista enquanto a viagem está ativa e esta tela aberta.
 * Guarda os pontos e envia em lote; sem sinal, acumula e reenvia depois (o servidor ignora repetidos).
 * Navegador não rastreia em segundo plano: para isso existe o app do motorista (Expo).
 */
export function useLocationSharing(routeId: number, enabled: boolean) {
  const [state, setState] = useState<ShareState>('starting');
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) { setState('unsupported'); return; }

    let buffer: Point[] = loadQueue(routeId);
    let sending = false;
    let stopped = false;
    let lastSample = 0;
    let wake: WakeLockSentinel | null = null;

    const flush = async () => {
      if (sending || stopped || !buffer.length) return;
      sending = true;
      const batch = buffer.slice(0, 100);
      try {
        await call('POST', `/routes/${routeId}/locations`, { points: batch });
        buffer = buffer.slice(batch.length);
        saveQueue(routeId, buffer);
        setLastSent(new Date());
        setState('sharing');
      } catch (e) {
        // viagem encerrada ou rota que não é do motorista: para de coletar
        if (e instanceof ApiError && (e.status === 403 || e.status === 422)) { stopped = true; saveQueue(routeId, []); setState('stopped'); }
        else setState('error');
      } finally {
        sending = false;
        setWaiting(buffer.length);
      }
    };

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSample < SAMPLE_MS) return;
        lastSample = now;
        const c = pos.coords;
        buffer.push({
          lat: c.latitude, lng: c.longitude, accuracy: finite(c.accuracy), speed: finite(c.speed) !== undefined ? Math.max(0, c.speed!) : undefined,
          heading: finite(c.heading), recordedAt: new Date(pos.timestamp || now).toISOString(),
        });
        if (buffer.length > MAX_BUFFER) buffer.shift();
        saveQueue(routeId, buffer);
        setWaiting(buffer.length);
        if (buffer.length === 1) void flush(); // primeiro ponto sai logo, o painel já mostra o motorista
      },
      (err) => { if (err.code === err.PERMISSION_DENIED) setState('denied'); else setState('error'); },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    const timer = setInterval(() => void flush(), SEND_MS);
    if (buffer.length) void flush();

    // mantém a tela acesa para o navegador continuar recebendo posições (melhor esforço)
    const keepAwake = async () => {
      try { wake = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* não suportado ou negado */ }
    };
    void keepAwake();
    const onVisible = () => { if (document.visibilityState === 'visible') void keepAwake(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void wake?.release();
    };
  }, [routeId, enabled]);

  return { state, lastSent, waiting };
}

const MESSAGES: Record<ShareState, string> = {
  starting: 'Obtendo sua localização…',
  sharing: 'Localização compartilhada com a operação',
  denied: 'Localização bloqueada. Libere o acesso à localização nas configurações do navegador para a operação acompanhar a viagem.',
  unsupported: 'Este aparelho não informa a localização.',
  error: 'Sem sinal para enviar a localização. Os pontos ficam guardados e são enviados quando voltar.',
  stopped: 'Compartilhamento encerrado.',
};

/* Estado do envio compartilhado entre o "farol" (que roda em qualquer tela) e os avisos das telas. */
interface Shared { routeId: number | null; state: ShareState; lastSent: Date | null; waiting: number }
let shared: Shared = { routeId: null, state: 'stopped', lastSent: null, waiting: 0 };
const listeners = new Set<() => void>();
const publish = (next: Shared) => { shared = next; listeners.forEach((l) => l()); };
const useShared = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => shared);

/**
 * Farol do motorista: montado uma vez no app, envia a posição enquanto ele tiver uma viagem em andamento, em QUALQUER
 * tela (início, romaneio, busca), e não só na tela da viagem. Fora da viagem não coleta nada.
 */
export function DriverBeacon({ routeId }: { routeId: number | null }) {
  const { state, lastSent, waiting } = useLocationSharing(routeId ?? 0, routeId !== null);
  useEffect(() => { publish({ routeId, state: routeId === null ? 'stopped' : state, lastSent, waiting }); }, [routeId, state, lastSent, waiting]);
  return null;
}

/** Aviso transparente ao motorista: a posição é enviada durante a viagem, com o app aberto. */
export function LocationSharing({ routeId }: { routeId: number }) {
  const { state, lastSent, waiting, routeId: sharing } = useShared();
  const current = sharing === routeId ? state : 'starting';
  const ok = current === 'sharing' || current === 'starting';
  return (
    <div className={`banner ${ok ? 'info' : ''}`} role="status">
      <span>
        {MESSAGES[current]}
        {current === 'sharing' && lastSent && <span className="muted small"> · último envio {lastSent.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
        {waiting > 1 && <span className="muted small"> · {waiting} pontos aguardando envio</span>}
      </span>
    </div>
  );
}
