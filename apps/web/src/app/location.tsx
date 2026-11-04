import { useEffect, useRef, useState } from 'react';
import { ApiError, call } from './api';

interface Point { lat: number; lng: number; accuracy?: number; speed?: number; heading?: number; recordedAt: string }

export type ShareState = 'starting' | 'sharing' | 'denied' | 'unsupported' | 'error' | 'stopped';

const SAMPLE_MS = 5_000;
const SEND_MS = 8_000;
const MAX_BUFFER = 500;

const finite = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : undefined);

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

    let buffer: Point[] = [];
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
        setLastSent(new Date());
        setState('sharing');
      } catch (e) {
        // viagem encerrada ou rota que não é do motorista: para de coletar
        if (e instanceof ApiError && (e.status === 403 || e.status === 422)) { stopped = true; setState('stopped'); }
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
        setWaiting(buffer.length);
        if (buffer.length === 1) void flush(); // primeiro ponto sai logo, o painel já mostra o motorista
      },
      (err) => { if (err.code === err.PERMISSION_DENIED) setState('denied'); else setState('error'); },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    const timer = setInterval(() => void flush(), SEND_MS);

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

/** Aviso transparente ao motorista: a posição só é enviada durante a viagem e com esta tela aberta. */
export function LocationSharing({ routeId }: { routeId: number }) {
  const { state, lastSent, waiting } = useLocationSharing(routeId, true);
  const ok = state === 'sharing' || state === 'starting';
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={`banner ${ok ? 'info' : ''}`} role="status">
      <span>
        {MESSAGES[state]}
        {state === 'sharing' && lastSent && <span className="muted small"> · último envio {lastSent.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
        {waiting > 1 && <span className="muted small"> · {waiting} pontos aguardando envio</span>}
      </span>
    </div>
  );
}
