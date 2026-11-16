import { useEffect, useRef } from 'react';
import { AmbientRoute, CONFIRM_SECONDS, TRAIL_SECONDS, buildRoads, clamp, type Rect } from './ambientRouteModel';

/** Fundo transparente da operação. Os blocos e controles nunca recebem eventos da animação. */
export function AmbientRoutes({ pageKey }: { pageKey: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, shell = canvas?.parentElement;
    const context = canvas?.getContext('2d');
    const main = shell?.querySelector<HTMLElement>('.main');
    if (!canvas || !shell || !context || !main) return;
    const ctx = context;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const theme = matchMedia('(prefers-color-scheme: dark)');
    let route: AmbientRoute | null = null, blocks: Rect[] = [], key = '';
    let width = 0, height = 0, frame = 0, measureFrame = 0, last = 0, scrollTimer = 0;
    let scrolling = false, obscured = false, disposed = false;
    let colors = { route: '', green: '', background: '', check: '' };
    const observed = new Set<Element>();
    const rect = (element: Element): Rect => {
      const r = element.getBoundingClientRect();
      return { x: r.left, y: r.top, right: r.right, bottom: r.bottom };
    };
    const visible = (element: Element) => {
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(element).visibility !== 'hidden';
    };
    const clear = () => ctx.clearRect(0, 0, width, height);
    const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
    const canRun = () => !!route && !motion.matches && !document.hidden && !scrolling && !obscured && !disposed;
    const palette = () => {
      const style = getComputedStyle(document.documentElement);
      colors = { route: style.getPropertyValue('--brand').trim(), green: style.getPropertyValue('--green').trim(), background: style.getPropertyValue('--bg').trim(), check: style.getPropertyValue('--accent-ink').trim() };
    };

    function draw() {
      clear(); if (!route || !canRun()) return;
      const m = route, compact = width < 500, radius = compact ? 80 : 110;
      const samples = m.trail.filter((_, i) => i % 3 === 0).map(p => ({ ...p, weight: (1 - clamp((m.clock - p.time) / TRAIL_SECONDS)) ** 2 }));
      samples.push({ ...m.position, time: m.clock, separate: false, weight: 1 });
      const cells = new Set<number>();
      const columns = Math.ceil(width / 15) + 1;
      for (const p of samples) {
        for (let x = Math.max(1, Math.floor((p.x - radius) / 15)); x <= Math.min(columns - 1, Math.ceil((p.x + radius) / 15)); x++) {
          for (let y = Math.max(1, Math.floor((p.y - radius) / 15)); y <= Math.min(Math.floor(height / 15), Math.ceil((p.y + radius) / 15)); y++) cells.add(y * columns + x);
        }
      }
      ctx.fillStyle = colors.route;
      for (const cell of cells) {
        const col = cell % columns, row = Math.floor(cell / columns), x = col * 15, y = row * 15;
        let weight = 0;
        for (const p of samples) { const d = Math.hypot(x - p.x, y - p.y); if (d < radius) weight = Math.max(weight, (1 - d / radius) ** 1.5 * p.weight); }
        const street = col % 4 === 0 || row % 4 === 0;
        ctx.globalAlpha = weight * (street ? .38 : .15);
        if (ctx.globalAlpha < .006) continue;
        ctx.beginPath(); ctx.arc(x, y, street ? 1.25 : .9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = .23; ctx.strokeStyle = colors.route; ctx.lineWidth = 1.3; ctx.setLineDash([3, 6]);
      for (let i = m.edge; i < m.edges.length; i++) {
        const edge = m.edges[i]!; if (edge.portal) continue;
        const a = i === m.edge ? m.position : edge.a;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(edge.b.x, edge.b.y); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.lineWidth = 2.1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const points = [...m.trail, { ...m.position, time: m.clock, separate: false }];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!, b = points[i]!;
        if (b.separate || (Math.abs(a.x - b.x) > .01 && Math.abs(a.y - b.y) > .01)) continue;
        ctx.globalAlpha = (1 - clamp((m.clock - a.time) / TRAIL_SECONDS)) * .8;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      const p = m.destination;
      ctx.globalAlpha = clamp((m.clock - m.born + .05) / .35);
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fillStyle = colors.background; ctx.fill(); ctx.strokeStyle = colors.route; ctx.lineWidth = 1.5; ctx.stroke();
      for (const p of m.arrivals) {
        const age = m.clock - p.time;
        ctx.globalAlpha = 1 - clamp(age / CONFIRM_SECONDS); ctx.fillStyle = colors.green;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = colors.check; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(p.x - 2.5, p.y); ctx.lineTo(p.x - .5, p.y + 2); ctx.lineTo(p.x + 3, p.y - 2); ctx.stroke();
        if (age < .7) { ctx.globalAlpha = 1 - age / .7; ctx.strokeStyle = colors.green; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p.x, p.y, 7 + age * 16, 0, Math.PI * 2); ctx.stroke(); }
      }
      // A confirmação termina antes de a seta reaparecer, inclusive no primeiro quadro da partida.
      if (m.arrowVisible) {
        ctx.save(); ctx.translate(m.position.x, m.position.y); ctx.rotate(m.angle); ctx.fillStyle = colors.route; ctx.globalAlpha = .13;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .92;
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5.5, -5.7); ctx.lineTo(-2, 0); ctx.lineTo(-5.5, 5.7); ctx.closePath(); ctx.fill(); ctx.restore();
      }
      // Apaga a união dos blocos, sem alterar o fundo sólido nem criar recortes em sobreposições.
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out';
      for (const r of blocks) ctx.fillRect(r.x - 3, r.y - 3, r.right - r.x + 6, r.bottom - r.y + 6);
      ctx.globalCompositeOperation = 'source-over';
    }

    function tick(time: number) {
      frame = 0; if (!canRun()) { last = 0; return; }
      const dt = last ? Math.min((time - last) / 1000, .06) : 0; last = time;
      route!.advance(dt); draw(); frame = requestAnimationFrame(tick);
    }
    function start() { if (!frame && canRun()) frame = requestAnimationFrame(tick); }
    const resize = new ResizeObserver(() => queueMeasure());
    function measure() {
      measureFrame = 0; if (disposed) return;
      width = document.documentElement.clientWidth;
      height = Math.min(innerHeight, window.visualViewport?.height ?? innerHeight);
      obscured = Array.from(shell!.querySelectorAll('[role="dialog"], .palette-back, .backdrop')).some(visible);
      const elements = [main!, ...Array.from(main!.children), ...Array.from(shell!.querySelectorAll('.topbar, .dock, .tour-bar'))];
      for (const element of observed) if (!elements.includes(element as HTMLElement)) { resize.unobserve(element); observed.delete(element); }
      for (const element of elements) if (!observed.has(element)) { observed.add(element); resize.observe(element); }
      blocks = Array.from(main!.children).filter(el => !el.matches('.backdrop, [role="dialog"]') && visible(el)).map(rect).filter(r => r.bottom > 0 && r.y < height);
      const bar = shell!.querySelector('.topbar'), dock = shell!.querySelector('.dock'), tour = shell!.querySelector('.tour-bar');
      const headerBottom = bar ? rect(bar).bottom : 0;
      const dockTop = Math.min(dock ? rect(dock).y : height, tour && visible(tour) ? rect(tour).y : height);
      const nextKey = JSON.stringify([width, height, headerBottom, dockTop, ...blocks.map(r => Object.values(r).map(Math.round))]);
      if (nextKey !== key) {
        key = nextKey; stop();
        const dpr = Math.min(devicePixelRatio || 1, 2);
        canvas!.width = Math.round(width * dpr); canvas!.height = Math.round(height * dpr);
        canvas!.style.height = `${height}px`; ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        const roads = buildRoads(width, height, blocks, headerBottom, dockTop);
        route = roads ? new AmbientRoute(roads) : null;
      }
      palette(); if (!canRun()) stop(); draw(); start();
    }
    function queueMeasure() { if (!measureFrame && !disposed) measureFrame = requestAnimationFrame(measure); }
    const mutation = new MutationObserver(queueMeasure);
    mutation.observe(shell, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
    const onScroll = () => {
      scrolling = true; stop(); clear(); clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => { scrolling = false; queueMeasure(); }, 120);
    };
    const onMotion = () => { stop(); clear(); queueMeasure(); };
    const onTheme = () => { palette(); draw(); };
    const onVisibility = () => { stop(); if (document.hidden) clear(); else queueMeasure(); };
    window.addEventListener('resize', queueMeasure);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.visualViewport?.addEventListener('resize', queueMeasure);
    motion.addEventListener('change', onMotion); theme.addEventListener('change', onTheme);
    document.addEventListener('visibilitychange', onVisibility);
    measure();
    return () => {
      disposed = true; stop(); cancelAnimationFrame(measureFrame); clearTimeout(scrollTimer);
      resize.disconnect(); mutation.disconnect();
      window.removeEventListener('resize', queueMeasure); window.removeEventListener('scroll', onScroll);
      window.visualViewport?.removeEventListener('resize', queueMeasure);
      motion.removeEventListener('change', onMotion); theme.removeEventListener('change', onTheme);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pageKey]);
  return <canvas ref={ref} className="ambient-routes" aria-hidden="true" />;
}
