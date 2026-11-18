import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Dataset, StopOutcome } from '@rotacerta/domain';
import { ApiError, call, fetchSnapshot, login as apiLogin, logout as apiLogout, renewSession, type SessionUser } from './api';

interface SessionCtx {
  status: 'booting' | 'out' | 'in';
  user: SessionUser | null;
  data: Dataset | null;
  driverId: number;
  error: string;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Comandos do motorista: devolvem a mensagem de erro do servidor ou null. */
  startRoute: (routeId: number) => Promise<string | null>;
  finishStop: (orderId: number, outcome: StopOutcome) => Promise<string | null>;
}

const Ctx = createContext<SessionCtx | null>(null);
const POLL_MS = 20_000;
const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Não foi possível concluir a operação.');

/** Sessão e dados do motorista. O servidor é a verdade: cada ação grava e depois rebusca o estado. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionCtx['status']>('booting');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try { const snap = await fetchSnapshot(); setData(snap.data); setError(''); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) { setUser(null); setStatus('out'); return; }
      setError(message(e));
    }
  }, []);

  // ao abrir: tenta retomar a sessão pelo cookie
  useEffect(() => {
    void (async () => {
      const s = await renewSession();
      if (s) { setUser(s.user); setStatus('in'); await refresh(); } else setStatus('out');
    })();
  }, [refresh]);

  // atualização periódica enquanto há sessão (posição de outros e mudanças da expedição)
  useEffect(() => {
    if (status !== 'in') return;
    const t = setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [status, refresh]);

  const value = useMemo<SessionCtx>(() => ({
    status, user, data, error,
    driverId: user?.driverId ?? 0,
    login: async (email, password) => {
      try { const s = await apiLogin(email, password); setUser(s.user); setStatus('in'); await refresh(); return null; }
      catch (e) { return message(e); }
    },
    logout: async () => { await apiLogout(); setUser(null); setData(null); setStatus('out'); },
    refresh,
    startRoute: async (routeId) => {
      try { await call('POST', `/routes/${routeId}/start`, {}); await refresh(); return null; } catch (e) { return message(e); }
    },
    finishStop: async (orderId, outcome) => {
      try { await call('POST', `/orders/${orderId}/stop`, outcome); await refresh(); return null; } catch (e) { return message(e); }
    },
  }), [status, user, data, error, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession fora do SessionProvider');
  return v;
}
