import { useEffect, useRef, type RefObject } from 'react';

/**
 * Mapa decorativo da tela de entrar: as quadras de um bairro em pontos e duas rotas que saem da loja.
 * Uma seta percorre as ruas e marca cada parada entregue. É só ilustração: não usa dados da operação.
 * Com mouse, as quadras perto do cursor se afastam um pouco e deixam um rastro que assenta sozinho.
 */
const GAP = 15;      // distância entre pontos
const BLOCK = 4;     // a cada 4 pontos passa uma rua
const SPEED = 85;    // px por segundo
const PAUSE = 0.7;   // segundos parado em cada entrega

// Rastro do cursor: as quadras se afastam um pouco do ponteiro e voltam devagar.
const WARP_R = 120;    // raio de influência, px
const WARP_PUSH = 9;   // deslocamento máximo de um ponto, px
const TRAIL = 0.65;    // segundos que o rastro leva para assentar

const ROUTES: { delay: number; stops: [number, number][] }[] = [
  { delay: 0, stops: [[0.22, 0.42], [0.46, 0.16], [0.74, 0.26], [0.9, 0.1]] },
  { delay: 2.4, stops: [[0.22, 0.42], [0.44, 0.52], [0.7, 0.44], [0.92, 0.3]] },
];

interface Pt { x: number; y: number }
interface Leg { pts: Pt[]; len: number }
interface Built { delay: number; stops: Pt[]; legs: Leg[]; dur: number }

const dist = (a: Pt, b: Pt) => Math.abs(b.x - a.x) + Math.abs(b.y - a.y);

function build(w: number, h: number): Built[] {
  const snap = (f: number, size: number) => Math.max(BLOCK, Math.round((f * size) / GAP / BLOCK) * BLOCK) * GAP;
  return ROUTES.map((def) => {
    const stops = def.stops.map(([x, y]) => ({ x: snap(x, w), y: snap(y, h) }));
    const legs: Leg[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i]!, b = stops[i + 1]!;
      const pts = a.x !== b.x && a.y !== b.y ? [a, { x: b.x, y: a.y }, b] : [a, b];
      legs.push({ pts, len: pts.slice(1).reduce((n, p, k) => n + dist(pts[k]!, p), 0) });
    }
    return { delay: def.delay, stops, legs, dur: legs.reduce((n, l) => n + l.len / SPEED + PAUSE, 0) };
  });
}

/** Posição e direção depois de andar `d` px pelo trecho. */
function along(pts: Pt[], d: number) {
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!, b = pts[k]!, l = dist(a, b);
    if (d <= l || k === pts.length - 1) {
      const f = l ? Math.min(d / l, 1) : 1;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ang: Math.atan2(b.y - a.y, b.x - a.x), k };
    }
    d -= l;
  }
  return { ...pts[0]!, ang: 0, k: 1 };
}

/** Onde a seta está no instante `t`, o caminho já percorrido e quantas paradas foram entregues. */
function stateAt(r: Built, t: number) {
  const trail: Pt[] = [r.stops[0]!];
  let done = 0, since = 99;
  for (const leg of r.legs) {
    const travel = leg.len / SPEED;
    if (t < travel) {
      const p = along(leg.pts, t * SPEED);
      trail.push(...leg.pts.slice(1, p.k), p);
      return { trail, arrow: p, done, since };
    }
    t -= travel; trail.push(...leg.pts.slice(1)); done++; since = t;
    if (t < PAUSE) return { trail, arrow: null, done, since };
    t -= PAUSE;
  }
  return { trail, arrow: null, done, since };
}

/**
 * A grade de pontos cobre o elemento pai inteiro; as rotas ficam dentro de `area`
 * (um elemento no canto de cima à esquerda do pai), para não passarem por baixo do que vem por cima.
 */
export function RouteMap({ area }: { area?: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !canvas.parentElement) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, routes: Built[] = [], total = 0, t0 = performance.now(), raf = 0;

    // Ponteiro: alvo real, cabeça suavizada que o persegue e amostras do caminho recente.
    const host = canvas.parentElement;
    const target = { x: 0, y: 0, on: false };
    const head = { x: 0, y: 0, k: 0 };   // k: presença (0 a 1), some aos poucos quando o mouse sai
    let trail: { x: number; y: number; t: number }[] = [];
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const box = host.getBoundingClientRect();
      target.x = e.clientX - box.left; target.y = e.clientY - box.top;
      if (!target.on && head.k < 0.05) { head.x = target.x; head.y = target.y; }
      target.on = true;
    };
    const onLeave = () => { target.on = false; };
    if (!still) { host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave); }

    /** Quanto o ponto (x, y) é empurrado para longe da cabeça e do rastro. */
    const warp = (x: number, y: number, now: number) => {
      let ox = 0, oy = 0, lit = 0;
      const push = (sx: number, sy: number, weight: number) => {
        const dx = x - sx, dy = y - sy;
        if (dx > WARP_R || dx < -WARP_R || dy > WARP_R || dy < -WARP_R) return;
        const d = Math.hypot(dx, dy);
        if (d >= WARP_R || d < 0.01) return;
        const f = (1 - d / WARP_R) ** 2 * weight;
        ox += (dx / d) * f; oy += (dy / d) * f; lit = Math.max(lit, f);
      };
      if (head.k > 0.01) push(head.x, head.y, head.k);
      for (const s of trail) push(s.x, s.y, (1 - (now - s.t) / 1000 / TRAIL) ** 2 * 0.55);
      const m = Math.hypot(ox, oy);
      const scale = m > 1 ? 1 / m : 1;   // nunca passa do deslocamento máximo
      return { x: x + ox * scale * WARP_PUSH, y: y + oy * scale * WARP_PUSH, lit: Math.min(lit, 1) };
    };

    const line = (pts: Pt[]) => { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); };

    const draw = (now: number) => {
      let t = (now - t0) / 1000;
      if (t > total) { t0 = now; t = 0; }
      if (still) t = total - 1;   // sem animação: mostra as rotas já concluídas
      ctx.clearRect(0, 0, w, h);

      head.k += ((target.on ? 1 : 0) - head.k) * 0.08;
      if (target.on) {
        const px = head.x, py = head.y;
        head.x += (target.x - head.x) * 0.2; head.y += (target.y - head.y) * 0.2;
        const last = trail[trail.length - 1];
        if (Math.hypot(head.x - px, head.y - py) > 0.5 && (!last || Math.hypot(head.x - last.x, head.y - last.y) > 7)) trail.push({ x: head.x, y: head.y, t: now });
      }
      trail = trail.filter((s) => now - s.t < TRAIL * 1000);
      const active = head.k > 0.01 || trail.length > 0;

      if (head.k > 0.01) {   // luz fraca sob o cursor
        const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, WARP_R * 1.3);
        g.addColorStop(0, `rgba(126,178,255,${0.13 * head.k})`); g.addColorStop(1, 'rgba(126,178,255,0)');
        ctx.fillStyle = g; ctx.fillRect(head.x - WARP_R * 1.3, head.y - WARP_R * 1.3, WARP_R * 2.6, WARP_R * 2.6);
      }

      for (let x = GAP, c = 1; x < w; x += GAP, c++) {
        for (let y = GAP, r = 1; y < h; y += GAP, r++) {
          const street = c % BLOCK === 0 || r % BLOCK === 0;
          const p = active ? warp(x, y, now) : { x, y, lit: 0 };
          const a = (street ? 0.36 : 0.1) + p.lit * (street ? 0.4 : 0.3);
          ctx.fillStyle = `rgba(170,198,255,${a})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, (street ? 1.3 : 1) + p.lit * 0.5, 0, 7); ctx.fill();
        }
      }

      for (const r of routes) {
        ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(126,178,255,.4)'; ctx.lineWidth = 1.5;
        line(r.legs.flatMap((l, i) => (i ? l.pts.slice(1) : l.pts)));
        ctx.setLineDash([]);

        const s = t > r.delay ? stateAt(r, t - r.delay) : { trail: [], arrow: null, done: 0, since: 99 };
        if (s.trail.length > 1) { ctx.strokeStyle = '#7eb2ff'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; line(s.trail); }

        r.stops.slice(1).forEach((p, i) => {
          const ok = i < s.done;
          if (ok && i === s.done - 1 && s.since < 0.7) {   // onda ao concluir a parada
            ctx.strokeStyle = `rgba(52,211,153,${1 - s.since / 0.7})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p.x, p.y, 7 + s.since * 22, 0, 7); ctx.stroke();
          }
          ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, 7);
          ctx.fillStyle = ok ? '#34d399' : '#0b1c44'; ctx.fill();
          ctx.strokeStyle = ok ? '#34d399' : '#aac6ff'; ctx.lineWidth = 1.5; ctx.stroke();
          if (ok) { ctx.strokeStyle = '#04281a'; ctx.lineWidth = 1.8; line([{ x: p.x - 3, y: p.y }, { x: p.x - 0.8, y: p.y + 2.4 }, { x: p.x + 3.2, y: p.y - 2.4 }]); }
        });

        if (s.arrow) {
          ctx.save(); ctx.translate(s.arrow.x, s.arrow.y); ctx.rotate(s.arrow.ang);
          ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6.5); ctx.lineTo(-2.5, 0); ctx.lineTo(-6, 6.5); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }

      const store = routes[0]?.stops[0];
      if (store) {
        ctx.fillStyle = '#fff'; ctx.fillRect(store.x - 7, store.y - 7, 14, 14);
        ctx.font = "500 11px 'JetBrains Mono Variable', monospace"; ctx.fillText('LOJA', store.x - 13, store.y + 24);
      }
      if (!still) raf = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(() => {
      const box = host.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const dpr = window.devicePixelRatio || 1;
      w = box.width; h = box.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const zone = area?.current?.getBoundingClientRect();
      routes = build(zone?.width || w, zone?.height || h);
      total = Math.max(...routes.map((r) => r.delay + r.dur)) + 2.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    });
    observer.observe(host);
    if (area?.current) observer.observe(area.current);
    return () => {
      observer.disconnect(); cancelAnimationFrame(raf);
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return <canvas ref={ref} className="route-map" aria-hidden="true" />;
}
