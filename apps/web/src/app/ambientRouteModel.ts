/** Rotas decorativas: os caminhos usam os espaços livres da tela, sem dados da operação. */
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; right: number; bottom: number }
export interface Roads {
  width: number; height: number; left: number; right: number; top: number; bottom: number;
  lanes: number[]; destinations: Point[];
}
export interface Edge { a: Point; b: Point; length: number; portal: boolean }
export interface Sample extends Point { time: number; separate: boolean }
export const TRAIL_SECONDS = 2.2;
export const CONFIRM_SECONDS = 0.9;
const ARRIVAL_PAUSE = 1.1;
export const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const inside = (p: Point, r: Rect, margin = 0) => p.x > r.x - margin && p.x < r.right + margin && p.y > r.y - margin && p.y < r.bottom + margin;

/** As faixas horizontais são os intervalos livres entre os blocos visíveis. */
export function buildRoads(width: number, height: number, blocks: Rect[], headerBottom: number, dockTop: number): Roads | null {
  const top = headerBottom + 10, bottom = Math.min(height - 16, dockTop - 16);
  if (width < 200 || height < 240 || bottom - top < 70) return null;
  const visible = blocks.filter(r => r.bottom > headerBottom && r.y < bottom);
  const left = Math.max(9, Math.min(15, ...visible.map(r => r.x - 10)));
  const right = Math.min(width - 9, Math.max(width - 15, ...visible.map(r => r.right + 10)));
  const intervals = visible.map(r => [Math.max(headerBottom, r.y), Math.min(dockTop, r.bottom)] as const).sort((a, b) => a[0] - b[0]);
  const lanes: number[] = [];
  let cursor = headerBottom;
  const gap = (end: number) => {
    if (end - cursor < 18) return;
    const center = (cursor + end) / 2, snapped = Math.round(center / 15) * 15;
    const y = snapped - cursor >= 9 && end - snapped >= 9 ? snapped : center;
    if (y >= top && y <= bottom) lanes.push(y);
  };
  for (const [start, end] of intervals) { gap(start); cursor = Math.max(cursor, end); }
  gap(dockTop);
  const destinations: Point[] = [];
  for (const y of lanes) for (let x = 60; x <= width - 60; x += width < 500 ? 30 : 60) destinations.push({ x, y });
  for (let y = top + 15; y <= bottom - 12; y += 60) destinations.push({ x: left, y }, { x: right, y });
  const safe = destinations.filter(p => !blocks.some(r => inside(p, r, 8)));
  return safe.length >= 2 ? { width, height, left, right, top, bottom, lanes, destinations: safe } : null;
}

export class AmbientRoute {
  clock = 0;
  sequence = 0;
  completed = 0;
  teleports = 0;
  position: Point;
  angle = 0;
  destination!: Readonly<Point>;
  born = 0;
  edges: Edge[] = [];
  edge = 0;
  progress = 0;
  hold = 0;
  trail: Sample[] = [];
  arrivals: (Point & { time: number })[] = [];

  constructor(readonly roads: Roads, private readonly random: () => number = Math.random) {
    this.position = roads.lanes.length
      ? { x: roads.right - Math.min(75, roads.width * .16), y: roads.lanes[0]! }
      : { x: roads.right, y: roads.top + 20 };
    this.plan(); this.remember(true);
  }

  /** O sorteio muda o destino; as conexões continuam horizontais e verticais. */
  plan() {
    const r = this.roads, index = this.sequence++;
    let choices = r.destinations.filter(p => distance(this.position, p) >= 70);
    if (!choices.length) choices = r.destinations.filter(p => distance(this.position, p) > 1);
    const interior = choices.filter(p => p.x > r.left + 20 && p.x < r.right - 20 && (index !== 0 || p.x < r.width * .45));
    if (interior.length) choices = interior;
    this.destination = Object.freeze({ ...choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))]! });
    this.born = this.clock; this.edge = 0; this.progress = 0; this.edges = [];
    let previous = { ...this.position };
    const add = (b: Point, portal = false) => {
      if (distance(previous, b) < .001) return;
      this.edges.push({ a: previous, b: { ...b }, portal, length: portal ? 0 : distance(previous, b) });
      previous = { ...b };
    };
    const onLeft = Math.abs(this.position.x - r.left) < .01;
    const onRight = Math.abs(this.position.x - r.right) < .01;
    const exitRight = onRight || (!onLeft && index % 2 === 0);
    const exit = exitRight ? r.right : r.left, enter = exitRight ? r.left : r.right;
    const lane = r.lanes[index % r.lanes.length] ?? Math.max(r.top, Math.min(r.bottom, this.position.y));
    add({ x: exit, y: previous.y });
    add({ x: exit, y: lane });
    if (index % 3 === 0 || !r.lanes.length) {
      add({ x: exitRight ? r.width + 18 : -18, y: lane });
      add({ x: exitRight ? -18 : r.width + 18, y: lane }, true);
    }
    add({ x: enter, y: lane });
    const targetSide = Math.abs(this.destination.x - r.left) < .01 ? r.left : Math.abs(this.destination.x - r.right) < .01 ? r.right : null;
    if (targetSide !== null && targetSide !== enter) {
      // Um alvo na outra margem usa uma rua livre, ou a travessia lateral quando não há rua.
      if (!r.lanes.length) {
        add({ x: enter === r.left ? -18 : r.width + 18, y: lane });
        add({ x: enter === r.left ? r.width + 18 : -18, y: lane }, true);
      }
      add({ x: targetSide, y: lane });
      add(this.destination);
    } else {
      add({ x: enter, y: this.destination.y });
      add(this.destination);
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
    if (this.hold > 0) { const paused = Math.min(dt, this.hold); this.hold -= paused; dt -= paused; }
    let remaining = (this.roads.width < 500 ? 38.4 : 48) * dt;
    while (remaining > .000001) {
      const edge = this.edges[this.edge];
      if (!edge) break;
      if (edge.portal) {
        this.remember(true); this.position = { ...edge.b }; this.progress = 0; this.edge++; this.teleports++;
        this.remember(true, true); continue;
      }
      this.angle = Math.atan2(edge.b.y - edge.a.y, edge.b.x - edge.a.x);
      const moved = Math.min(remaining, edge.length - this.progress);
      this.progress += moved; remaining -= moved;
      const f = this.progress / edge.length;
      this.position = { x: edge.a.x + (edge.b.x - edge.a.x) * f, y: edge.a.y + (edge.b.y - edge.a.y) * f };
      if (this.progress >= edge.length - .000001) {
        this.remember(true); this.edge++; this.progress = 0;
        if (this.edge === this.edges.length) {
          this.arrivals.push({ ...this.destination, time: this.clock }); this.completed++;
          this.plan(); this.hold = ARRIVAL_PAUSE; break;
        }
      }
    }
    this.remember();
  }
}
