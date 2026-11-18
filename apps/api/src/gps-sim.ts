import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import * as schema from './db/schema';
import { withTenant } from './db/tenants';
import type { EventBus } from './realtime/events';

/**
 * Simulador de GPS para o AMBIENTE DE TESTE: faz um motorista "andar" por ruas reais, para demonstrar e testar o
 * acompanhamento sem sair com o celular. Grava os pontos como o app do motorista gravaria e avisa o painel pelo
 * mesmo barramento. Nunca é registrado em produção (a rota que o liga só existe no ambiente de teste).
 */

/** Percurso de demonstração por ruas de São Paulo (Paulista → Consolação → Higienópolis → Pacaembu → volta). */
const WAYPOINTS: Array<[number, number]> = [
  [-23.56135, -46.65593], [-23.55935, -46.65813], [-23.55745, -46.66027], [-23.55576, -46.66223], [-23.55397, -46.66105],
  [-23.55184, -46.65952], [-23.54979, -46.65788], [-23.54788, -46.65642], [-23.54638, -46.65833], [-23.54486, -46.66052],
  [-23.54335, -46.66261], [-23.54469, -46.66463], [-23.54633, -46.66675], [-23.54797, -46.66887], [-23.55004, -46.66689],
  [-23.55219, -46.66489], [-23.55427, -46.66306], [-23.55576, -46.66223], [-23.55745, -46.66027], [-23.55935, -46.65813],
];

const STEP_MS = 3_000;
/** ~30 km/h: metros andados a cada passo. */
const METERS_PER_STEP = 25;

const toRad = (d: number) => (d * Math.PI) / 180;
function distance(a: [number, number], b: [number, number]) {
  const R = 6_371_000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a: [number, number], b: [number, number]) {
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Ponto a `meters` do início do percurso (dá voltas no circuito). */
export function pointAlong(meters: number): { lat: number; lng: number; heading: number } {
  const segs = WAYPOINTS.map((p, i) => [p, WAYPOINTS[(i + 1) % WAYPOINTS.length]] as const);
  const total = segs.reduce((s, [a, b]) => s + distance(a, b), 0);
  let m = ((meters % total) + total) % total;
  for (const [a, b] of segs) {
    const d = distance(a, b);
    if (m <= d) {
      const t = d ? m / d : 0;
      return { lat: a[0] + (b[0] - a[0]) * t, lng: a[1] + (b[1] - a[1]) * t, heading: Math.round(bearing(a, b)) };
    }
    m -= d;
  }
  return { lat: WAYPOINTS[0][0], lng: WAYPOINTS[0][1], heading: 0 };
}

interface Running { timer: ReturnType<typeof setInterval>; until: number; meters: number }

export class GpsSimulator {
  private readonly running = new Map<string, Running>();

  constructor(private readonly db: Db, private readonly events: EventBus, private readonly log?: { warn: (o: unknown, m: string) => void }) {}

  private key(companyId: number, routeId: number) { return `${companyId}:${routeId}`; }

  isRunning(companyId: number, routeId: number) { return this.running.has(this.key(companyId, routeId)); }

  /** Começa (ou prolonga) a simulação de uma viagem ativa. */
  start(companyId: number, routeId: number, minutes: number) {
    const key = this.key(companyId, routeId);
    const until = Date.now() + minutes * 60_000;
    const current = this.running.get(key);
    if (current) { current.until = until; return; }
    // cada viagem começa num ponto diferente do circuito: duas simulações não andam juntas
    const run: Running = { until, meters: (routeId * 977) % 3000, timer: setInterval(() => void this.tick(companyId, routeId, run), STEP_MS) };
    this.running.set(key, run);
    void this.tick(companyId, routeId, run);
  }

  stop(companyId: number, routeId: number) {
    const key = this.key(companyId, routeId);
    const run = this.running.get(key);
    if (run) clearInterval(run.timer);
    this.running.delete(key);
  }

  stopAll() { for (const run of this.running.values()) clearInterval(run.timer); this.running.clear(); }

  private async tick(companyId: number, routeId: number, run: Running) {
    if (Date.now() > run.until) { this.stop(companyId, routeId); return; }
    run.meters += METERS_PER_STEP * (0.8 + Math.random() * 0.4);
    const p = pointAlong(run.meters);
    const recordedAt = new Date();
    const speed = Math.round((METERS_PER_STEP / (STEP_MS / 1000)) * 10) / 10;
    try {
      const driverId = await withTenant(this.db, companyId, async (tx) => {
        const [route] = await tx.select().from(schema.routes).where(eq(schema.routes.id, routeId));
        if (!route || route.status !== 'active' || route.driverId == null) return null;
        await tx.insert(schema.driverLocations).values({ routeId, driverId: route.driverId, lat: p.lat, lng: p.lng, accuracy: 6, speed, heading: p.heading, recordedAt }).onConflictDoNothing();
        return route.driverId;
      });
      if (driverId == null) { this.stop(companyId, routeId); return; }
      this.events.publish({ type: 'location', companyId, routeId, driverId, lat: p.lat, lng: p.lng, accuracy: 6, speed, heading: p.heading, recordedAt: recordedAt.toISOString() });
    } catch (e) {
      this.log?.warn({ err: (e as Error).message, routeId }, 'simulador de GPS: falha ao gravar ponto');
    }
  }
}
