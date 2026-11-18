import { useEffect, useState } from 'react';
import { ApiError, call } from './api';

interface Point { lat: number; lng: number; accuracy?: number; speed?: number; heading?: number; recordedAt: string }
export type ShareState = 'off' | 'starting' | 'sharing' | 'denied' | 'unsupported' | 'error' | 'stopped';

const SAMPLE_MS = 5_000;
const SEND_MS = 8_000;
const MAX_BUFFER = 500;
const finite = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : undefined);

/**
 * Envia a posição do motorista em lote enquanto a viagem está ativa (mesma regra do web).
 * Sem sinal, acumula e reenvia depois; o servidor ignora pontos repetidos.
 */
export function useLocationSharing(routeId: number | null, enabled: boolean, keepAwake: boolean) {
  const [state, setState] = useState<ShareState>('off');
  const [lastSent, setLastSent] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled || routeId === null) { setState('off'); return; }
    if (!('geolocation' in navigator)) { setState('unsupported'); return; }
    setState('starting');
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
        if (e instanceof ApiError && (e.status === 403 || e.status === 422)) { stopped = true; setState('stopped'); } else setState('error');
      } finally { sending = false; }
    };

    const watch = navigator.geolocation.watchPosition((pos) => {
      const now = Date.now();
      if (now - lastSample < SAMPLE_MS) return;
      lastSample = now;
      const c = pos.coords;
      buffer.push({
        lat: c.latitude, lng: c.longitude, accuracy: finite(c.accuracy),
        speed: finite(c.speed) !== undefined ? Math.max(0, c.speed as number) : undefined,
        heading: finite(c.heading), recordedAt: new Date(pos.timestamp || now).toISOString(),
      });
      if (buffer.length > MAX_BUFFER) buffer.shift();
      if (buffer.length === 1) void flush();
    }, (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'), { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 });
    const timer = setInterval(() => void flush(), SEND_MS);

    const awake = async () => { if (!keepAwake) return; try { wake = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* não suportado */ } };
    void awake();
    const onVisible = () => { if (document.visibilityState === 'visible') void awake(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void wake?.release();
    };
  }, [routeId, enabled, keepAwake]);

  return { state, lastSent };
}

export const SHARE_LABEL: Record<ShareState, string> = {
  off: 'Localização desligada em Ajustes',
  starting: 'Obtendo sua localização…',
  sharing: 'Localização compartilhada com a operação',
  denied: 'Localização bloqueada. Libere o acesso nas configurações do aparelho.',
  unsupported: 'Este aparelho não informa a localização.',
  error: 'Falha ao enviar a localização. Tentando de novo…',
  stopped: 'Viagem encerrada: a localização parou de ser enviada.',
};
