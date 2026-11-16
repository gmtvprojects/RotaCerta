/**
 * Rotas decorativas da operação, sem dados reais. Tudo fica em coordenadas da página (não da tela):
 * as ruas passam pelos espaços livres entre e ao lado dos blocos, e a rota rola junto com o conteúdo.
 */
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; right: number; bottom: number }
/**
 * Faixa visível da página. `top`/`bottom`: onde as paradas podem nascer (fora da barra e da doca).
 * `outerTop`/`outerBottom`: além delas a seta está escondida (atrás da barra do topo ou abaixo da tela).
 */
export interface View { top: number; bottom: number; outerTop: number; outerBottom: number }
export interface Roads {
  width: number; height: number; top: number; bottom: number;
  xs: number[]; ys: number[]; blocks: Rect[];
  /** Por nó (j * xs.length + i): livre; ligação livre para a direita (`h`) e para baixo (`v`). */
  open: Uint8Array; h: Uint8Array; v: Uint8Array;
  /** Nós livres ligados a pelo menos uma rua. */
  destinations: number[];
}
/** Território de uma rota: a faixa de x onde ficam as paradas e o caminho dela. */
export interface Zone { minX: number; maxX: number }
export const FULL_ZONE: Zone = Object.freeze({ minX: -Infinity, maxX: Infinity });
export interface Edge { a: Point; b: Point; length: number }
export interface Sample extends Point { time: number; separate: boolean }
export const TRAIL_SECONDS = 2.2;
export const CONFIRM_SECONDS = 0.9;
const ARRIVAL_PAUSE = 1.1;
const STREET = 60;          // uma rua a cada 4 pontos da grade de 15px
const TURN_COST = 36;       // cada curva "custa" 36px: prefere caminhos com poucas dobras
const NODE_MARGIN = 9;      // folga entre uma parada e um bloco
const PATH_MARGIN = 7;      // folga entre o traço e um bloco
const SETTLE = 0.35;        // segundos sem rolar antes de a seta acompanhar a tela
export const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const inside = (p: Point, r: Rect, margin = 0) => p.x > r.x - margin && p.x < r.right + margin && p.y > r.y - margin && p.y < r.bottom + margin;
const segmentFree = (a: Point, b: Point, blocks: Rect[], m: number) => !blocks.some(r =>
  Math.min(a.x, b.x) < r.right + m && Math.max(a.x, b.x) > r.x - m && Math.min(a.y, b.y) < r.bottom + m && Math.max(a.y, b.y) > r.y - m);
export const nodePoint = (r: Roads, i: number): Point => ({ x: r.xs[i % r.xs.length]!, y: r.ys[Math.floor(i / r.xs.length)]! });

/**
 * Monta a malha de ruas: verticais a cada 60px (mais uma rente às margens quando os blocos ocupam
 * a largura toda) e horizontais a cada 60px mais uma no meio de cada vão entre blocos.
 */
export function buildRoads(width: number, height: number, blocks: Rect[], headerBottom: number, pageBottom: number): Roads | null {
  const top = headerBottom + 10, bottom = Math.min(height - 16, pageBottom - 16);
  if (width < 200 || bottom - top < 70) return null;
  const xs: number[] = [];
  for (let x = STREET; x <= width - 9; x += STREET) xs.push(x);
  if (blocks.some(r => r.x < STREET + NODE_MARGIN + 5)) xs.unshift(Math.max(9, Math.min(15, ...blocks.map(r => r.x - 10))));
  const last = xs[xs.length - 1] ?? width;
  const edgeRight = Math.min(width - 9, Math.max(width - 15, ...blocks.map(r => r.right + 10)));
  if (blocks.some(r => r.right > last - NODE_MARGIN - 5) && edgeRight > last + 9) xs.push(edgeRight);
  const ys: number[] = [];
  for (let y = Math.ceil(top / STREET) * STREET; y <= bottom; y += STREET) ys.push(y);
  const intervals = blocks.map(r => [r.y, r.bottom] as const).sort((a, b) => a[0] - b[0]);
  let cursor = headerBottom;
  const gap = (end: number) => {
    if (end - cursor < 18) return;
    const center = (cursor + end) / 2, snapped = Math.round(center / 15) * 15;
    const y = snapped - cursor >= 9 && end - snapped >= 9 ? snapped : center;
    if (y >= top && y <= bottom && !ys.some(v => Math.abs(v - y) < 3)) ys.push(y);
  };
  for (const [start, end] of intervals) { gap(start); cursor = Math.max(cursor, end); }
  gap(pageBottom);
  ys.sort((a, b) => a - b);

  const nx = xs.length, n = nx * ys.length;
  const open = new Uint8Array(n), h = new Uint8Array(n), v = new Uint8Array(n);
  for (let k = 0; k < n; k++) open[k] = blocks.some(r => inside({ x: xs[k % nx]!, y: ys[Math.floor(k / nx)]! }, r, NODE_MARGIN)) ? 0 : 1;
  const roads: Roads = { width, height, top, bottom, xs, ys, blocks, open, h, v, destinations: [] };
  for (let k = 0; k < n; k++) {
    if (!open[k]) continue;
    const a = nodePoint(roads, k);
    if (k % nx < nx - 1 && open[k + 1] && segmentFree(a, nodePoint(roads, k + 1), blocks, PATH_MARGIN)) h[k] = 1;
    if (k + nx < n && open[k + nx] && segmentFree(a, nodePoint(roads, k + nx), blocks, PATH_MARGIN)) v[k] = 1;
  }
  for (let k = 0; k < n; k++) if (open[k] && (h[k] || v[k] || (k % nx > 0 && h[k - 1]) || (k >= nx && v[k - nx]))) roads.destinations.push(k);
  return roads.destinations.length >= 2 ? roads : null;
}

const inZone = (r: Roads, k: number, zone: Zone) => { const x = r.xs[k % r.xs.length]!; return x >= zone.minX && x <= zone.maxX; };

/** Abaixo desta largura (a mesma em que a doca e as tabelas mudam para o celular) há uma rota só. */
export const NARROW = 720;

/**
 * Duas rotas ao mesmo tempo: metade esquerda e metade direita, com uma faixa neutra no meio
 * (8% da largura de cada lado do centro, entre 50 e 140px). Nenhuma das duas entra nela, então as setas
 * nunca se cruzam e ficam sempre a pelo menos o dobro dessa folga de distância.
 * Em tela estreita, ou sem espaço para as duas, uma rota só usa a tela inteira.
 */
export function splitZones(r: Roads): Zone[] {
  if (r.width < NARROW) return [FULL_ZONE];
  const mid = r.width / 2, buffer = Math.max(50, Math.min(140, r.width * .08));
  const zones = [{ minX: -Infinity, maxX: mid - buffer }, { minX: mid + buffer, maxX: Infinity }];
  return zones.every(z => r.destinations.filter(k => inZone(r, k, z)).length >= 2) ? zones : [FULL_ZONE];
}

/** Caminho mais curto pelas ruas (A*), contando cada curva como distância extra e sem sair da zona. Devolve os nós. */
export function findPath(r: Roads, from: number, to: number, zone: Zone = FULL_ZONE): number[] | null {
  if (from === to) return [from];
  const nx = r.xs.length, n = r.open.length, goal = nodePoint(r, to);
  // Estado = nó * 5 + direção de chegada (0 direita, 1 esquerda, 2 baixo, 3 cima, 4 parado).
  const g = new Float64Array(n * 5).fill(Infinity), prev = new Int32Array(n * 5).fill(-1), closed = new Uint8Array(n * 5);
  const heapF: number[] = [], heapS: number[] = [];
  const push = (f: number, s: number) => {
    let i = heapF.length; heapF.push(f); heapS.push(s);
    while (i > 0) {
      const p = (i - 1) >> 1; if (heapF[p]! <= f) break;
      heapF[i] = heapF[p]!; heapS[i] = heapS[p]!; i = p;
    }
    heapF[i] = f; heapS[i] = s;
  };
  const pop = () => {
    const s = heapS[0]!, f = heapF.pop()!, t = heapS.pop()!;
    if (heapF.length) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, rr = l + 1; let m = i, mf = f;
        if (l < heapF.length && heapF[l]! < mf) { m = l; mf = heapF[l]!; }
        if (rr < heapF.length && heapF[rr]! < mf) { m = rr; mf = heapF[rr]!; }
        if (m === i) break;
        heapF[i] = heapF[m]!; heapS[i] = heapS[m]!; i = m;
      }
      heapF[i] = f; heapS[i] = t;
    }
    return s;
  };
  const start = from * 5 + 4; g[start] = 0; push(distance(nodePoint(r, from), goal), start);
  while (heapS.length) {
    const s = pop();
    if (closed[s]) continue;
    closed[s] = 1;
    const node = Math.floor(s / 5), dir = s % 5;
    if (node === to) {
      const nodes: number[] = [];
      for (let k = s; k >= 0; k = prev[k]!) nodes.push(Math.floor(k / 5));
      return nodes.reverse();
    }
    const i = node % nx, here = nodePoint(r, node);
    const moves = [
      i < nx - 1 && r.h[node] ? node + 1 : -1,
      i > 0 && r.h[node - 1] ? node - 1 : -1,
      r.v[node] ? node + nx : -1,
      node >= nx && r.v[node - nx] ? node - nx : -1,
    ];
    for (let d = 0; d < 4; d++) {
      const next = moves[d]!;
      if (next < 0 || (dir < 4 && (dir ^ 1) === d) || !inZone(r, next, zone)) continue;   // nunca dá meia-volta nem sai da zona
      const p = nodePoint(r, next), ns = next * 5 + d;
      const cost = g[s]! + distance(here, p) + (dir < 4 && dir !== d ? TURN_COST : 0);
      if (cost < g[ns]!) { g[ns] = cost; prev[ns] = s; push(cost + distance(p, goal), ns); }
    }
  }
  return null;
}

/** Junta os nós em trechos retos. */
function toEdges(r: Roads, nodes: number[]): Edge[] {
  const pts = nodes.map(k => nodePoint(r, k)), edges: Edge[] = [];
  let a = pts[0]!;
  for (let k = 1; k < pts.length; k++) {
    const b = pts[k]!, c = pts[k + 1];
    if (c && ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) continue;
    edges.push({ a, b, length: distance(a, b) });
    a = b;
  }
  return edges;
}

export class AmbientRoute {
  clock = 0;
  sequence = 0;
  completed = 0;
  teleports = 0;
  position: Point;
  angle = 0;
  /** Nó de onde a rota em curso partiu (ou onde a seta está parada). */
  node: number;
  destination!: Readonly<Point>;
  target = -1;
  born = 0;
  edges: Edge[] = [];
  edge = 0;
  progress = 0;
  hold = 0;
  trail: Sample[] = [];
  arrivals: (Point & { time: number })[] = [];
  view: View;
  private viewChangedAt = -1;
  private hoppedFor = -2;
  private recent: Point[] = [];

  constructor(public roads: Roads, private readonly random: () => number = Math.random, view?: View, public zone: Zone = FULL_ZONE) {
    this.view = view ?? { top: roads.top, bottom: roads.bottom, outerTop: 0, outerBottom: roads.height };
    const own = this.own();
    const shown = own.filter(k => this.inView(nodePoint(roads, k)));
    const pool = this.interior(shown.length ? shown : own);
    this.node = pool[Math.floor(this.random() * pool.length)]!;
    this.position = nodePoint(roads, this.node);
    this.plan(this.node); this.remember(true);
  }

  /** Paradas possíveis dentro do território (todas, se a zona não tiver nenhuma). */
  private own() {
    const mine = this.roads.destinations.filter(k => inZone(this.roads, k, this.zone));
    return mine.length ? mine : this.roads.destinations;
  }
  private inView(p: Point, pad = 0) { return p.y >= this.view.top + pad && p.y <= this.view.bottom - pad; }
  private hidden(p: Point) { return p.y < this.view.outerTop - 14 || p.y > this.view.outerBottom + 14; }
  /**
   * Evita paradas coladas na borda da tela. Em tela estreita não: ao lado de um bloco longo (uma lista,
   * uma tabela) as margens são as únicas ruas que descem com a página, e sem elas a seta ficaria presa no topo.
   */
  private interior(nodes: number[]) {
    if (this.roads.width < NARROW) return nodes;
    const inner = nodes.filter(k => { const x = nodePoint(this.roads, k).x; return x >= 30 && x <= this.roads.width - 30; });
    return inner.length ? inner : nodes;
  }
  private get speed() { return this.roads.width < 500 ? 44 : 56; }
  get remaining() { return this.edges.slice(this.edge).reduce((n, e) => n + e.length, 0) - this.progress; }

  /** Sorteia uma parada perto, de preferência na parte visível, e calcula o caminho até ela. */
  plan(from = this.node) {
    const r = this.roads, here = nodePoint(r, from), compact = r.width < 500;
    const min = compact ? 60 : 90, max = compact ? 180 : 270;
    const all = this.own().filter(k => k !== from);
    const shown = all.filter(k => this.inView(nodePoint(r, k)));
    let pool = this.interior(shown.length ? shown : all);
    const fresh = pool.filter(k => !this.recent.some(p => distance(p, nodePoint(r, k)) < 45));
    if (fresh.length) pool = fresh;
    let near: number[] = [];
    for (const limit of [max, max * 1.6, max * 2.6, Infinity]) {
      near = pool.filter(k => { const d = distance(here, nodePoint(r, k)); return d >= min && d <= limit; });
      if (near.length) break;
    }
    if (!near.length) near = pool;
    for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [near[i], near[j]] = [near[j]!, near[i]!]; }
    let best: { target: number; nodes: number[]; length: number } | null = null;
    for (const target of near.slice(0, 12)) {
      const nodes = findPath(r, from, target, this.zone);
      if (!nodes) continue;
      const length = toEdges(r, nodes).reduce((n, e) => n + e.length, 0), direct = distance(here, nodePoint(r, target));
      if (!best || length < best.length) best = { target, nodes, length };
      if (length <= Math.max(direct * 1.8, direct + 200)) { best = { target, nodes, length }; break; }
    }
    this.node = from; this.born = this.clock; this.edge = 0; this.progress = 0; this.sequence++;
    if (!best) { this.target = -1; this.edges = []; this.destination = Object.freeze({ ...here }); this.hold = Math.max(this.hold, ARRIVAL_PAUSE); return false; }
    this.target = best.target;
    this.destination = Object.freeze(nodePoint(r, best.target));
    this.edges = toEdges(r, best.nodes);
    this.recent = [...this.recent, this.destination].slice(-3);
    return true;
  }

  /** A tela rolou: guarda a nova faixa visível. */
  setView(view: View) {
    const v = this.view;
    if (Math.abs(v.top - view.top) > 1 || Math.abs(v.bottom - view.bottom) > 1 || Math.abs(v.outerTop - view.outerTop) > 1 || Math.abs(v.outerBottom - view.outerBottom) > 1) this.viewChangedAt = this.clock;
    this.view = view;
  }

  /** O layout mudou: troca a malha mantendo a seta onde está sempre que possível. */
  setRoads(roads: Roads, zone: Zone = this.zone) {
    this.roads = roads; this.zone = zone;
    const p = this.position, own = this.own();
    let snap = own[0]!;
    for (const k of own) if (distance(p, nodePoint(roads, k)) < distance(p, nodePoint(roads, snap))) snap = k;
    const s = nodePoint(roads, snap);
    const reach = distance(p, s) < .5 ? null : (p.x === s.x || p.y === s.y) && segmentFree(p, s, roads.blocks, PATH_MARGIN) ? { a: { ...p }, b: s, length: distance(p, s) } : undefined;
    if (reach === undefined) this.jump(snap);
    const old = this.destination;
    const same = own.find(k => distance(nodePoint(roads, k), old) < .5);
    const nodes = same !== undefined && same !== snap ? findPath(roads, snap, same, this.zone) : null;
    if (nodes) { this.node = snap; this.target = same!; this.edges = toEdges(roads, nodes); this.edge = 0; this.progress = 0; }
    else { const born = this.born; this.plan(snap); if (this.hold <= 0) this.born = born; }
    if (reach) this.edges.unshift(reach);
  }

  /** Move a seta de uma vez (só acontece fora da vista), sem desenhar o salto. */
  private jump(node: number) {
    this.remember(true); this.position = nodePoint(this.roads, node); this.node = node;
    this.remember(true, true); this.teleports++;
  }

  /**
   * Opção A: quando a rolagem deixa a seta fora da tela, ela reaparece pela borda mais próxima
   * (atrás da barra do topo ou por baixo da tela) e segue para uma parada visível.
   */
  private follow() {
    if (this.hoppedFor === this.viewChangedAt || this.clock - this.viewChangedAt < SETTLE || !this.hidden(this.position)) return;
    const shown = this.target >= 0 && this.inView(this.destination);
    if (shown && this.remaining <= 220) return;
    this.hoppedFor = this.viewChangedAt;
    const v = this.view, r = this.roads;
    const above: [number, number] = [v.outerTop - 80, v.outerTop - 16], below: [number, number] = [v.outerBottom + 16, v.outerBottom + 80];
    const bands = this.position.y < v.outerTop ? [above, below] : [below, above];
    for (const [lo, hi] of bands) {
      const options = this.interior(this.own().filter(k => { const y = nodePoint(r, k).y; return y >= lo && y <= hi; }));
      if (!options.length) continue;
      const entry = options[Math.floor(this.random() * options.length)]!;
      this.jump(entry); this.hold = 0;
      const nodes = shown && this.target !== entry ? findPath(r, entry, this.target, this.zone) : null;
      if (nodes) { this.edges = toEdges(r, nodes); this.edge = 0; this.progress = 0; }
      else this.plan(entry);
      return;
    }
  }

  private remember(force = false, separate = false) {
    const last = this.trail[this.trail.length - 1];
    if (force || !last || distance(last, this.position) >= 3 || this.clock - last.time >= .08) this.trail.push({ ...this.position, time: this.clock, separate });
    this.trail = this.trail.filter(p => this.clock - p.time < TRAIL_SECONDS);
    this.arrivals = this.arrivals.filter(p => this.clock - p.time < CONFIRM_SECONDS);
  }

  get arrowVisible() {
    return this.hold <= 0 && !this.arrivals.some(p => distance(p, this.position) < 24);
  }

  advance(dt: number) {
    this.clock += dt;
    this.follow();
    if (this.hold > 0) { const paused = Math.min(dt, this.hold); this.hold -= paused; dt -= paused; }
    if (this.hold <= 0 && !this.edges.length && this.target < 0) this.plan(this.node);
    let remaining = this.speed * dt;
    while (remaining > .000001) {
      const edge = this.edges[this.edge];
      if (!edge) break;
      this.angle = Math.atan2(edge.b.y - edge.a.y, edge.b.x - edge.a.x);
      const moved = Math.min(remaining, edge.length - this.progress);
      this.progress += moved; remaining -= moved;
      const f = edge.length ? this.progress / edge.length : 1;
      this.position = { x: edge.a.x + (edge.b.x - edge.a.x) * f, y: edge.a.y + (edge.b.y - edge.a.y) * f };
      if (this.progress >= edge.length - .000001) {
        this.remember(true); this.edge++; this.progress = 0;
        if (this.edge === this.edges.length) {
          this.arrivals.push({ ...this.destination, time: this.clock }); this.completed++;
          this.plan(this.target); this.hold = ARRIVAL_PAUSE; break;
        }
      }
    }
    this.remember();
  }
}
