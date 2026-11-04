import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  closeStop, confirmOrder, deletePaper as deletePaperLocal, discardRoute as discardRouteLocal,
  releaseTrip, retryNotice, saveBoxes as saveBoxesLocal, setChecks, startTrip, syncSignatures, updatePaper as updatePaperLocal,
  type BoxInput, type Clock, type Dataset, type DeliveryForm, type PaperForm, type PaperValues, type PlanDraft, type Role, type StopOutcome, type TripResult,
} from '@rotacerta/domain';
import { ApiError, call, fetchSnapshot, login as apiLogin, logout as apiLogout, openSocket, renewSession, send, type Req, type SessionUser } from './api';

/** Estado que fica só neste aparelho: rascunhos. Sessão (cookie httpOnly) e dados da operação vêm do servidor. */
const KEY = 'rotacerta:v4';

interface Local { driverId: number; draft: DeliveryForm | null; plan: PlanDraft | null }

const EMPTY_DATA: Dataset = { clients: [], neighborhoods: [], zones: [], vehicles: [], drivers: [], orders: [], routes: [], notifications: [], departures: [] };

function load(): Local {
  // versões anteriores guardavam o token de acesso aqui: apaga
  try { localStorage.removeItem('rotacerta:v3'); } catch { /* ignora */ }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Local>;
      return { driverId: s.driverId ?? 1, draft: s.draft ?? null, plan: s.plan ?? null };
    }
  } catch { /* armazenamento indisponível: segue sem rascunhos */ }
  return { driverId: 1, draft: null, plan: null };
}

export type Connection = 'loading' | 'ready' | 'offline';

/** Posição de um motorista em viagem, recebida em tempo real (só gestão e expedição). */
export interface LocationMsg { type: 'location'; routeId: number; driverId: number; lat: number; lng: number; accuracy: number | null; speed: number | null; heading: number | null; recordedAt: string }

interface Store {
  role: Role | null;
  user: SessionUser | null;
  driverId: number;
  data: Dataset;
  papers: PaperForm[];
  draft: DeliveryForm | null;
  plan: PlanDraft | null;
  /** `loading` enquanto busca os dados; `offline` se o servidor não respondeu e não há dados. */
  connection: Connection;
  /** Última falha de uma operação, para mostrar ao usuário. */
  problem: string | null;
  clearProblem: () => void;
  /** Recebe cada nova posição de motorista (tempo real). Devolve a função que cancela. */
  subscribeLocations: (fn: (m: LocationMsg) => void) => () => void;
  refresh: () => Promise<void>;
  /** Troca a própria senha; devolve a mensagem de erro, ou null. */
  changePassword: (current: string, password: string) => Promise<string | null>;
  /** Entra com e-mail e senha; devolve a mensagem de erro, ou null. */
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  saveDraft: (form: DeliveryForm | null) => void;
  /** Guarda (ou limpa) a carga em planejamento. */
  setPlan: (plan: PlanDraft | null) => void;
  /** Cadastra a entrega (e o cliente, se novo) como "aguardando volumes". Devolve o código da entrega. */
  createOrder: (form: DeliveryForm) => Promise<number>;
  /** Grava as caixas; devolve o erro de validação, ou null. */
  saveBoxes: (orderId: number, boxes: BoxInput[], gas: number) => string | null;
  addPaper: (paper: Omit<PaperForm, 'id' | 'createdAt' | 'status' | 'orderId'>, status?: PaperForm['status']) => Promise<string>;
  updatePaper: (id: string, patch: Partial<Pick<PaperForm, 'status' | 'values'>>) => void;
  deletePaper: (id: string) => void;
  /** Cria a entrega a partir da ficha revisada e vincula os dois. Devolve o código da entrega. */
  importPaper: (id: string, values: PaperValues) => Promise<number | null>;
  createRoute: (orderIds: number[], vehicleId: number, departure: string, driverId?: number | null) => Promise<number>;
  /** Marca ou desmarca volumes na conferência do carregamento. */
  setChecked: (routeId: number, keys: string[], value: boolean) => void;
  /** Confirma um pedido já com todos os volumes marcados; devolve o bloqueio, ou null. */
  confirmOrder: (routeId: number, orderId: number) => string | null;
  /** Reinicia a conferência de pedidos cujos volumes mudaram depois de conferidos. */
  syncConference: (routeId: number) => void;
  /** Libera o romaneio ao motorista; só vale com todos os volumes conferidos. */
  releaseRoute: (routeId: number) => string | null;
  /** Desfaz uma carga em conferência e devolve as entregas à fila. */
  discardRoute: (routeId: number) => void;
  /** Escolhe o motorista em nome de quem a gestão opera. */
  setDriver: (driverId: number) => void;
  /** Aplica uma alteração de configuração da loja; devolve o erro de validação, ou null. */
  change: (fn: (d: Dataset) => TripResult, request: Req) => string | null;
  /** Reenvia um aviso com falha; devolve o erro, ou null. */
  retryNotice: (id: string) => string | null;
  /** Inicia a viagem; devolve a mensagem de bloqueio, ou null se deu certo. */
  startRoute: (routeId: number) => string | null;
  /** Conclui ou registra ocorrência na parada atual; devolve o bloqueio, ou null. */
  finishStop: (orderId: number, outcome: StopOutcome) => string | null;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fora do StoreProvider');
  return s;
}

const pad = (n: number) => String(n).padStart(2, '0');
const clockNow = (): Clock => {
  const d = new Date();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { time, stamp: `${d.toLocaleDateString('pt-BR')} · ${time}` };
};

const initial = load();

export function StoreProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState<Local>(initial);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [snapshot, setSnapshot] = useState<{ data: Dataset; papers: PaperForm[] }>({ data: EMPTY_DATA, papers: [] });
  // começa em 'loading' enquanto tenta retomar a sessão pelo cookie
  const [connection, setConnection] = useState<Connection>('loading');
  const [problem, setProblem] = useState<string | null>(null);

  const locationListeners = useRef(new Set<(m: LocationMsg) => void>());
  const userRef = useRef<SessionUser | null>(null);
  userRef.current = user;

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* ignora */ }
  }, [local]);

  /** Encerra a sessão aqui; `remote` também a encerra no servidor (logout do usuário, não expiração). */
  const logout = useCallback((remote = true) => {
    if (remote) void apiLogout();
    setUser(null);
    setSnapshot({ data: EMPTY_DATA, papers: [] });
    setConnection('ready');
    setLocal((s) => ({ ...s, plan: null, draft: null }));
  }, []);

  // retoma a sessão ao abrir o app
  useEffect(() => {
    let alive = true;
    renewSession().then((session) => {
      if (!alive) return;
      if (session) { setUser(session.user); setLocal((s) => ({ ...s, driverId: session.user.driverId ?? s.driverId })); } else setConnection('ready');
    }).catch(() => { if (alive) setConnection('offline'); });
    return () => { alive = false; };
  }, []);

  /* ---- fila de gravação: as operações vão ao servidor na ordem em que foram feitas ---- */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);

  const refresh = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const snap = await fetchSnapshot();
      setSnapshot(snap);
      setConnection('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { logout(false); return; }
      setConnection((c) => (c === 'loading' ? 'offline' : c));
      if (e instanceof Error) setProblem(e.message);
    }
  }, [logout]);

  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    pending.current += 1;
    const run = queue.current.catch(() => undefined).then(fn);
    queue.current = run;
    // com a fila vazia, o servidor é a verdade: busca o estado e descarta as previsões locais
    const drain = () => { pending.current -= 1; if (pending.current === 0) void refresh(); };
    run.then(drain, drain);
    return run;
  }, [refresh]);

  /** Mostra o resultado já (previsão local), grava no servidor e, se o servidor recusar, volta ao estado real. */
  const commit = useCallback((data: Dataset, request: Req) => {
    setSnapshot((s) => ({ ...s, data }));
    enqueue(() => send(request)).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) logout(false);
      else setProblem(e instanceof Error ? e.message : 'Não foi possível salvar a alteração.');
    });
  }, [enqueue, logout]);

  /* ---- carga inicial, tempo real e retorno ao app ---- */
  useEffect(() => {
    if (!user) return;
    void refresh();
    let ws: WebSocket | undefined;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    let debounce: ReturnType<typeof setTimeout>;
    const connect = async () => {
      try {
        ws = await openSocket();
      } catch {
        if (!closed) retry = setTimeout(connect, 5000);
        return;
      }
      if (closed) { ws.close(); return; }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type?: string };
          // posição é dado ao vivo, não muda o estado das entregas: não precisa rebuscar tudo
          if (msg.type === 'location') { locationListeners.current.forEach((fn) => fn(msg as LocationMsg)); return; }
        } catch { /* mensagem ilegível: trata como aviso de mudança */ }
        clearTimeout(debounce);
        // com gravações pendentes o refresh vem no fim da fila
        debounce = setTimeout(() => { if (pending.current === 0) void refresh(); }, 150);
      };
      ws.onclose = () => { if (!closed) retry = setTimeout(connect, 3000); };
    };
    void connect();
    const onVisible = () => { if (document.visibilityState === 'visible' && pending.current === 0) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { closed = true; clearTimeout(retry); clearTimeout(debounce); ws?.close(); document.removeEventListener('visibilitychange', onVisible); };
  }, [user, refresh]);

  const value = useMemo<Store>(() => {
    const { data, papers } = snapshot;
    const actor = user?.name ?? 'Equipe';
    const admin = user?.role === 'gestao';

    /** Aplica a regra localmente (mesma função do servidor); se passar, grava. */
    const rule = (r: TripResult, request: Req): string | null => {
      if (!r.ok) return r.error;
      commit(r.data, request);
      return null;
    };
    const queued = async <T,>(request: Req): Promise<T> => enqueue(() => send(request) as Promise<T>);

    return {
      role: user?.role ?? null,
      user,
      driverId: local.driverId,
      data, papers,
      draft: local.draft,
      plan: local.plan,
      connection, problem,
      clearProblem: () => setProblem(null),
      subscribeLocations: (fn) => { locationListeners.current.add(fn); return () => { locationListeners.current.delete(fn); }; },
      refresh,
      login: async (email, password) => {
        try {
          const session = await apiLogin(email, password);
          setConnection('loading');
          setUser(session.user);
          setLocal((s) => ({ ...s, driverId: session.user.driverId ?? s.driverId }));
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : 'Não foi possível entrar.';
        }
      },
      logout: () => logout(true),
      changePassword: async (current, password) => {
        try { await call('POST', '/auth/password', { current, password }); return null; }
        catch (e) { return e instanceof Error ? e.message : 'Não foi possível trocar a senha.'; }
      },
      saveDraft: (form) => setLocal((s) => (JSON.stringify(s.draft) === JSON.stringify(form) ? s : { ...s, draft: form })),
      setPlan: (plan) => setLocal((s) => ({ ...s, plan })),
      setDriver: (driverId) => setLocal((s) => ({ ...s, driverId })),

      createOrder: async (form) => (await queued<{ orderId: number }>({ method: 'POST', path: '/orders', body: form })).orderId,
      saveBoxes: (orderId, boxes, gas) => {
        const r = saveBoxesLocal(data, orderId, boxes, gas, clockNow(), actor);
        return rule(r, { method: 'PUT', path: `/orders/${orderId}/boxes`, body: { boxes, gas } });
      },

      addPaper: async (paper, status = 'captured') => {
        const body = { sheetNumber: paper.sheetNumber, mode: paper.mode, photo: paper.photo, photoName: paper.photoName, values: paper.values, status };
        return (await queued<{ id: string }>({ method: 'POST', path: '/papers', body })).id;
      },
      updatePaper: (id, patch) => {
        setSnapshot((s) => ({ ...s, papers: updatePaperLocal(s.papers, id, patch) }));
        enqueue(() => send({ method: 'PATCH', path: `/papers/${id}`, body: patch })).catch((e: unknown) => setProblem(e instanceof Error ? e.message : 'Falha ao salvar a ficha.'));
      },
      deletePaper: (id) => {
        setSnapshot((s) => ({ ...s, papers: deletePaperLocal(s.papers, id) }));
        enqueue(() => send({ method: 'DELETE', path: `/papers/${id}` })).catch((e: unknown) => setProblem(e instanceof Error ? e.message : 'Falha ao excluir a ficha.'));
      },
      importPaper: async (id, values) => {
        if (!papers.some((p) => p.id === id && p.status !== 'imported')) return null;
        return (await queued<{ orderId: number }>({ method: 'POST', path: `/papers/${id}/import`, body: values })).orderId;
      },

      createRoute: async (orderIds, vehicleId, departure, driverId = null) =>
        (await queued<{ routeId: number }>({ method: 'POST', path: '/routes', body: { orderIds, vehicleId, departure, driverId } })).routeId,
      setChecked: (routeId, keys, value) => {
        const next = setChecks(data, routeId, keys, value, clockNow().time, actor);
        if (next !== data) commit(next, { method: 'POST', path: `/routes/${routeId}/checks`, body: { keys, value } });
      },
      confirmOrder: (routeId, orderId) => rule(confirmOrder(data, routeId, orderId), { method: 'POST', path: `/routes/${routeId}/orders/${orderId}/confirm` }),
      syncConference: (routeId) => {
        const next = syncSignatures(data, routeId);
        if (next !== data) commit(next, { method: 'POST', path: `/routes/${routeId}/sync` });
      },
      releaseRoute: (routeId) => rule(releaseTrip(data, routeId, clockNow().time), { method: 'POST', path: `/routes/${routeId}/release` }),
      discardRoute: (routeId) => {
        const r = discardRouteLocal(data, routeId, clockNow(), actor);
        if (r.ok) commit(r.data, { method: 'DELETE', path: `/routes/${routeId}` });
        else setProblem(r.error);
      },

      change: (fn, request) => rule(fn(data), request),
      retryNotice: (id) => rule(retryNotice(data, id, clockNow().time), { method: 'POST', path: `/notifications/${id}/retry` }),
      startRoute: (routeId) => rule(
        startTrip(data, routeId, local.driverId, clockNow().time),
        { method: 'POST', path: `/routes/${routeId}/start`, body: admin ? { driverId: local.driverId } : {} },
      ),
      finishStop: (orderId, outcome) => rule(
        closeStop(data, orderId, local.driverId, admin, clockNow().time, outcome),
        { method: 'POST', path: `/orders/${orderId}/stop`, body: outcome },
      ),
    };
  }, [snapshot, local, user, connection, problem, commit, enqueue, refresh, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
