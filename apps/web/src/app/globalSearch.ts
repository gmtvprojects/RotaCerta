import { ORDER_STATUS_LABELS, ROUTE_STATUS_LABELS, canAccess, type Dataset, type Role } from '@rotacerta/domain';
import type { PaletteItem } from './Palette';

/**
 * Busca global do sistema (a do topo, Ctrl K): procura dados de verdade, não só telas.
 * Cada resultado leva ao lugar certo: a entrega abre a ficha, o cliente abre o cadastro, o romaneio é selecionado na
 * lista, motoristas e veículos abrem a seção da configuração. Só aparece o que o perfil pode ver.
 */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digits = (s: string) => s.replace(/\D/g, '');

export function searchSystem(params: {
  query: string;
  role: Role;
  data: Dataset;
  go: (path: string) => void;
  openOrder: (id: number) => void;
}): PaletteItem[] {
  const { role, data, go, openOrder } = params;
  const q = plain(params.query.trim());
  if (!q) return [];
  const qd = digits(q);
  const code = q.replace(/^#/, '');
  const has = (text: string) => plain(text).includes(q);
  const out: PaletteItem[] = [];

  // entregas: código, cliente, telefone, bairro, rua ou código de caixa
  if (canAccess(role, 'entregas')) {
    const hits = data.orders.filter((o) => String(o.id) === code || String(o.id).startsWith(code) && code.length >= 2
      || has(o.name) || has(o.neighborhood) || has(o.street) || (qd.length >= 4 && digits(o.phone).includes(qd))
      || o.boxes.some((b) => plain(b).includes(q)));
    for (const o of hits.slice(0, 6)) {
      const box = o.boxes.find((b) => plain(b).includes(q));
      out.push({ key: `order-${o.id}`, group: 'Entregas', label: `#${o.id} · ${o.name}`, hint: box ? `caixa ${box} · ${ORDER_STATUS_LABELS[o.status]}` : `${o.neighborhood} · ${ORDER_STATUS_LABELS[o.status]}`, icon: 'box', run: () => openOrder(o.id) });
    }
    if (hits.length > 6) out.push({ key: 'order-more', group: 'Entregas', label: `Ver todas as ${hits.length} entregas encontradas`, icon: 'arrow', run: () => go('/entregas') });
  }

  // clientes
  if (canAccess(role, 'clientes')) {
    const hits = data.clients.filter((c) => has(c.name) || (qd.length >= 4 && digits(c.phone).includes(qd)));
    for (const c of hits.slice(0, 5)) {
      out.push({ key: `client-${c.id}`, group: 'Clientes', label: c.name, hint: `${c.phone} · ${c.neighborhood}`, icon: 'user', run: () => go(`/clientes?cliente=${c.id}`) });
    }
  }

  // romaneios: código ou nome do motorista
  if (canAccess(role, 'romaneio')) {
    const driverName = (id: number | null) => data.drivers.find((d) => d.id === id)?.name ?? '';
    const hits = data.routes.filter((r) => String(r.id) === code || String(r.id).startsWith(code) && code.length >= 2 || (q.length >= 3 && has(driverName(r.driverId))));
    for (const r of hits.slice(-4).reverse()) {
      out.push({ key: `route-${r.id}`, group: 'Romaneios', label: `Romaneio #${r.id}`, hint: `${driverName(r.driverId) || 'sem motorista'} · ${ROUTE_STATUS_LABELS[r.status]}`, icon: 'list', run: () => go(`/romaneios?romaneio=${r.id}`) });
    }
  }

  // cadastros da operação (configurações: só gestão)
  if (canAccess(role, 'configuracoes') && q.length >= 2) {
    for (const d of data.drivers.filter((x) => has(x.name)).slice(0, 3)) {
      const live = data.routes.find((r) => r.status === 'active' && r.driverId === d.id);
      out.push(live
        ? { key: `driver-${d.id}`, group: 'Equipe', label: d.name, hint: `em viagem · romaneio #${live.id}`, icon: 'pin', run: () => go('/acompanhamento') }
        : { key: `driver-${d.id}`, group: 'Equipe', label: d.name, hint: d.active === false ? 'motorista desativado' : 'motorista', icon: 'user', run: () => go('/configuracoes?secao=equipe') });
    }
    for (const v of data.vehicles.filter((x) => has(x.name) || has(x.plate)).slice(0, 3)) {
      out.push({ key: `vehicle-${v.id}`, group: 'Veículos', label: v.name, hint: `${v.plate} · ${v.capacity} caixas`, icon: 'truck', run: () => go('/configuracoes?secao=veiculos') });
    }
    const hoods = data.neighborhoods.filter((n) => has(n.name) || has(n.zone));
    for (const n of hoods.slice(0, 3)) {
      out.push({ key: `hood-${n.name}`, group: 'Bairros', label: n.name, hint: n.zone, icon: 'map', run: () => go('/configuracoes?secao=bairros') });
    }
  } else if (role === 'expedicao' && q.length >= 2) {
    // a expedição não edita cadastros, mas encontra o motorista em viagem
    for (const d of data.drivers.filter((x) => has(x.name)).slice(0, 3)) {
      const live = data.routes.find((r) => r.status === 'active' && r.driverId === d.id);
      if (live) out.push({ key: `driver-${d.id}`, group: 'Equipe', label: d.name, hint: `em viagem · romaneio #${live.id}`, icon: 'pin', run: () => go('/acompanhamento') });
    }
  }
  return out;
}

/** Seções de configuração e ações rápidas que entram na busca mesmo sem digitar nada. */
export const CONFIG_SECTIONS: Array<{ key: string; label: string }> = [
  { key: 'bairros', label: 'Bairros e zonas' }, { key: 'veiculos', label: 'Veículos' }, { key: 'equipe', label: 'Equipe (motoristas)' },
  { key: 'usuarios', label: 'Usuários e acessos' }, { key: 'auditoria', label: 'Auditoria' }, { key: 'horarios', label: 'Horários de saída' },
  { key: 'whatsapp', label: 'WhatsApp' }, { key: 'aparencia', label: 'Aparência (tema e menu)' },
];
