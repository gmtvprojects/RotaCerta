import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { closeStop, createSeed, startTrip, volumesOf, type StopOutcome, type BoxInput, type Dataset, type DeliveryForm, type Order, type PaperForm, type PaperValues, type PlanDraft, type Role, type Route } from '@rotacerta/domain';

const KEY = 'rotacerta:v2';

interface Persisted { role: Role | null; driverId: number; data: Dataset; draft: DeliveryForm | null; plan: PlanDraft | null; papers: PaperForm[] }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Persisted;
      return { ...saved, draft: saved.draft ?? null, plan: saved.plan ?? null, papers: saved.papers ?? [] };
    }
  } catch { /* armazenamento indisponível: segue com dados fixos */ }
  return { role: null, driverId: 3, data: createSeed(), draft: null, plan: null, papers: [] };
}

interface Store extends Persisted {
  login: (role: Role) => void;
  logout: () => void;
  reset: () => void;
  saveDraft: (form: DeliveryForm | null) => void;
  /** Guarda (ou limpa) a carga em planejamento. */
  setPlan: (plan: PlanDraft | null) => void;
  /** Cadastra a entrega (e o cliente, se novo) como "aguardando volumes". */
  createOrder: (form: DeliveryForm) => number;
  /** Grava as caixas; sem caixas a entrega segue aguardando volumes. */
  saveBoxes: (orderId: number, boxes: BoxInput[], gas: number) => void;
  addPaper: (paper: Omit<PaperForm, "id" | "createdAt" | "status" | "orderId">, status?: PaperForm["status"]) => string;
  updatePaper: (id: string, patch: Partial<Pick<PaperForm, "status" | "values">>) => void;
  deletePaper: (id: string) => void;
  /** Cria a entrega a partir da ficha revisada e vincula os dois. Devolve o código da entrega. */
  importPaper: (id: string, values: PaperValues) => number | null;
  createRoute: (orderIds: number[], vehicleId: number, departure: string) => number;
  /** Marca ou desmarca volumes na conferência do carregamento. */
  setChecked: (routeId: number, keys: string[], value: boolean) => void;
  /** Libera o romaneio ao motorista; só vale com todos os volumes conferidos. */
  releaseRoute: (routeId: number) => void;
  /** Desfaz uma carga em conferência e devolve as entregas à fila. */
  discardRoute: (routeId: number) => void;
  setDriver: (driverId: number) => void;
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

const now = () => new Date().toTimeString().slice(0, 5);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignora */ }
  }, [state]);

  const patch = useCallback((fn: (d: Dataset) => Dataset) => setState((s) => ({ ...s, data: fn(s.data) })), []);

  const value = useMemo<Store>(() => ({
    ...state,
    login: (role) => setState((s) => ({ ...s, role })),
    logout: () => setState((s) => ({ ...s, role: null })),
    reset: () => setState((s) => ({ ...s, data: createSeed(), draft: null, plan: null, papers: [] })),
    setPlan: (plan) => setState((s) => ({ ...s, plan })),
    saveDraft: (form) => setState((s) => (JSON.stringify(s.draft) === JSON.stringify(form) ? s : { ...s, draft: form })),
    createOrder: (form) => {
      let id = 0;
      patch((d) => {
        id = Math.max(100, ...d.orders.map((o) => o.id)) + 1;
        let clientId = form.clientId;
        let clients = d.clients;
        if (clientId == null) {
          clientId = Math.max(0, ...d.clients.map((c) => c.id)) + 1;
          clients = [...d.clients, {
            id: clientId, name: form.name, phone: form.phone, neighborhood: form.neighborhood, street: form.street,
            number: form.number, complement: form.complement, reference: form.reference, consent: form.consent,
          }];
        }
        const order: Order = {
          id, clientId, name: form.name, phone: form.phone, neighborhood: form.neighborhood, street: form.street,
          number: form.number, complement: form.complement, reference: form.reference, consent: form.consent,
          window: form.window, notes: form.notes, boxes: [], cold: 0, frozen: 0, gas: 0,
          storage: 'Câmara fria 01', status: 'awaiting', routeId: null,
          created: `${new Date().toLocaleDateString('pt-BR')} · ${now()}`, completed: null,
          history: [{ label: 'Entrega cadastrada', time: now(), actor: 'Atendente' }],
        };
        return { ...d, clients, orders: [...d.orders, order] };
      });
      return id;
    },
    addPaper: (paper, status = 'captured') => {
      const id = `P${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      setState((s) => ({ ...s, papers: [...s.papers, { ...paper, id, status, orderId: null, createdAt: new Date().toISOString() }] }));
      return id;
    },
    updatePaper: (id, p) => setState((s) => ({ ...s, papers: s.papers.map((x) => (x.id === id && x.status !== 'imported' ? { ...x, ...p } : x)) })),
    deletePaper: (id) => setState((s) => ({ ...s, papers: s.papers.filter((x) => x.id !== id || x.status === 'imported') })),
    importPaper: (id, v) => {
      const paper = state.papers.find((p) => p.id === id);
      if (!paper || paper.status === 'imported') return null;
      const d = state.data;
      const orderId = Math.max(100, ...d.orders.map((o) => o.id)) + 1;
      const phoneKey = v.phone.replace(/\D/g, '');
      const known = v.clientId ?? d.clients.find((c) => c.phone.replace(/\D/g, '') === phoneKey)?.id ?? null;
      const clientId = known ?? Math.max(0, ...d.clients.map((c) => c.id)) + 1;
      const clients = known != null ? d.clients : [...d.clients, {
        id: clientId, name: v.name, phone: v.phone, neighborhood: v.neighborhood, street: v.street,
        number: v.number, complement: v.complement, reference: v.reference, consent: v.consent,
      }];
      const boxes = v.boxes.map((b) => ({ ...b, code: b.code.trim().toUpperCase() }));
      const order: Order = {
        id: orderId, clientId, name: v.name, phone: v.phone, neighborhood: v.neighborhood, street: v.street,
        number: v.number, complement: v.complement, reference: v.reference, consent: v.consent,
        window: v.window, notes: v.notes, boxes: boxes.map((b) => b.code),
        boxDetails: Object.fromEntries(boxes.map((b) => [b.code, { type: b.type, location: b.location }])),
        cold: boxes.filter((b) => b.type === 'cold').length, frozen: boxes.filter((b) => b.type === 'frozen').length, gas: v.gas,
        storage: 'Câmara fria 01', status: boxes.length && v.volumesReady ? 'ready' : 'awaiting', routeId: null,
        created: `${new Date().toLocaleDateString('pt-BR')} · ${now()}`, completed: null,
        history: [{ label: `Ficha ${paper.sheetNumber} revisada e entrega cadastrada`, time: now(), actor: 'Atendente' }],
      };
      setState((s) => ({
        ...s,
        data: { ...s.data, clients, orders: [...s.data.orders, order] },
        papers: s.papers.map((p) => (p.id === id ? { ...p, status: 'imported', values: v, orderId, importedAt: new Date().toISOString() } : p)),
      }));
      return orderId;
    },
    saveBoxes: (orderId, boxes, gas) => patch((d) => ({
      ...d,
      orders: d.orders.map((o) => o.id !== orderId ? o : {
        ...o,
        boxes: boxes.map((b) => b.code),
        boxDetails: Object.fromEntries(boxes.map((b) => [b.code, { type: b.type, location: b.location }])),
        cold: boxes.filter((b) => b.type === 'cold').length,
        frozen: boxes.filter((b) => b.type === 'frozen').length,
        gas,
        status: boxes.length ? 'ready' : 'awaiting',
        history: [...o.history, { label: boxes.length ? `${boxes.length} caixa(s) identificada(s)` : 'Caixas ainda não identificadas', time: now(), actor: 'Atendente' }],
      }),
    })),
    createRoute: (orderIds, vehicleId, departure) => {
      let id = 0;
      patch((d) => {
        id = Math.max(1000, ...d.routes.map((r) => r.id)) + 1;
        const route: Route = { id, vehicleId, driverId: null, orders: orderIds, status: 'loading', departure: departure || 'A definir', created: now(), checked: {} };
        return {
          ...d,
          routes: [...d.routes, route],
          orders: d.orders.map((o) => orderIds.includes(o.id)
            ? { ...o, status: 'loading', routeId: id, history: [...o.history, { label: `Romaneio #${id} em conferência`, time: now(), actor: 'Expedição' }] }
            : o),
        };
      });
      return id;
    },
    setChecked: (routeId, keys, value) => patch((d) => ({
      ...d,
      routes: d.routes.map((r) => {
        if (r.id !== routeId || r.status !== 'loading') return r;
        const checked = { ...(r.checked ?? {}) };
        keys.forEach((k) => { if (value) checked[k] = true; else delete checked[k]; });
        return { ...r, checked };
      }),
    })),
    releaseRoute: (routeId) => patch((d) => {
      const r = d.routes.find((x) => x.id === routeId);
      if (!r || r.status !== 'loading') return d;
      const orders = r.orders.map((id) => d.orders.find((o) => o.id === id)).filter((o): o is Order => !!o);
      if (orders.some((o) => o.routeId !== r.id || o.status !== 'loading')) return d;
      if (!orders.flatMap(volumesOf).every((v) => r.checked?.[v.key])) return d;
      return {
        ...d,
        routes: d.routes.map((x) => (x.id === routeId ? { ...x, status: 'released' } : x)),
        orders: d.orders.map((o) => r.orders.includes(o.id)
          ? { ...o, status: 'released', history: [...o.history, { label: `Volumes conferidos. Romaneio #${r.id} disponível para o motorista`, time: now(), actor: 'Expedição' }] }
          : o),
      };
    }),
    discardRoute: (routeId) => patch((d) => {
      const r = d.routes.find((x) => x.id === routeId);
      if (!r || r.status !== 'loading') return d;
      return {
        ...d,
        routes: d.routes.filter((x) => x.id !== routeId),
        orders: d.orders.map((o) => r.orders.includes(o.id)
          ? { ...o, status: 'ready', routeId: null, history: [...o.history, { label: `Carga #${r.id} desfeita`, time: now(), actor: 'Expedição' }] }
          : o),
      };
    }),
    setDriver: (driverId) => setState((s) => ({ ...s, driverId })),
    startRoute: (routeId) => {
      const r = startTrip(state.data, routeId, state.driverId, now());
      if (r.ok) setState((s) => ({ ...s, data: r.data }));
      return r.ok ? null : r.error;
    },
    finishStop: (orderId, outcome) => {
      const r = closeStop(state.data, orderId, state.driverId, state.role === 'gestao', now(), outcome);
      if (r.ok) setState((s) => ({ ...s, data: r.data }));
      return r.ok ? null : r.error;
    },
  }), [state, patch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

