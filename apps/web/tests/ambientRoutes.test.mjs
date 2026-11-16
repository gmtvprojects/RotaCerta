import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/app/ambientRouteModel.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { AmbientRoute, buildRoads, splitZones, inside, distance, CONFIRM_SECONDS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
function random(seed = 73) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

// Coluna central de 1100px numa tela larga, como a tela de entregas: título, abas e uma tabela longa.
const wide = [1841, 2400, [{ x: 390, y: 90, right: 1450, bottom: 160 }, { x: 390, y: 180, right: 1450, bottom: 226 }, { x: 390, y: 236, right: 1450, bottom: 2250 }]];
const layouts = [
  wide,
  [1440, 900, [{ x: 190, y: 90, right: 1250, bottom: 180 }, { x: 190, y: 206, right: 1250, bottom: 330 }, { x: 190, y: 390, right: 1250, bottom: 650 }]],
  [320, 568, [{ x: 20, y: 84, right: 300, bottom: 170 }, { x: 20, y: 194, right: 300, bottom: 800 }]],
  [390, 1300, [{ x: 20, y: 60, right: 370, bottom: 1200 }]],
];
const view = (top, height = 900) => ({ top: top + 78, bottom: top + height - 100, outerTop: top + 62, outerBottom: top + height });
const pointAt = (e, d) => { const f = e.length ? d / e.length : 0; return { x: e.a.x + (e.b.x - e.a.x) * f, y: e.a.y + (e.b.y - e.a.y) * f }; };

test('paradas e caminhos ficam nas áreas livres, sem atravessar blocos', () => {
  for (const [width, height, blocks] of layouts) {
    const roads = buildRoads(width, height, blocks, 62, height);
    assert.ok(roads);
    const route = new AmbientRoute(roads, random());
    for (let i = 0; i < 120; i++) {
      assert.ok(!blocks.some(r => inside(route.destination, r, 8)));
      assert.ok(Object.isFrozen(route.destination));
      for (const e of route.edges) {
        assert.ok(e.a.x === e.b.x || e.a.y === e.b.y);
        for (let d = 0; d <= e.length; d += 5) {
          const p = pointAt(e, d);
          assert.ok(p.x >= 0 && p.x <= width);
          assert.ok(!blocks.some(r => inside(p, r, 7)), JSON.stringify({ p, e }));
        }
      }
      route.position = { ...route.destination }; route.plan(route.target);
    }
  }
});

test('as laterais livres viram ruas: a rota usa a altura toda, não só o topo', () => {
  const [width, height, blocks] = wide;
  const roads = buildRoads(width, height, blocks, 62, height);
  const route = new AmbientRoute(roads, random(11), view(0, 2400));
  const ys = new Set(), sides = new Set();
  for (let i = 0; i < 200; i++) {
    ys.add(Math.round(route.destination.y / 100));
    sides.add(route.destination.x < 390 ? 'esquerda' : route.destination.x > 1450 ? 'direita' : 'meio');
    route.position = { ...route.destination }; route.plan(route.target);
  }
  assert.ok(ys.size >= 10, `poucas alturas: ${ys.size}`);
  assert.ok(sides.has('esquerda') || sides.has('direita'));
});

test('a próxima parada fica perto e o caminho nunca passa por cima dela antes de chegar', () => {
  for (const [width, height, blocks] of layouts) {
    const roads = buildRoads(width, height, blocks, 62, height);
    const route = new AmbientRoute(roads, random(5), view(0, Math.min(900, height)));
    const limit = width < 500 ? 180 : 270;
    let near = 0;
    for (let i = 0; i < 100; i++) {
      const from = { ...route.position };
      if (distance(from, route.destination) <= limit) near++;
      route.edges.slice(0, -1).forEach(e => {
        for (let d = 0; d <= e.length; d += 1) assert.ok(distance(pointAt(e, d), route.destination) > .5, 'passou pela parada');
      });
      route.position = { ...route.destination }; route.plan(route.target);
    }
    assert.ok(near >= 80, `${width}px: só ${near} paradas por perto`);
  }
});

test('a parada fica fixa até a chegada e a próxima surge logo depois', () => {
  const route = new AmbientRoute(buildRoads(1024, 768, [], 60, 768), random());
  const first = route.destination;
  for (let i = 0; i < 10; i++) route.advance(.02);
  assert.equal(route.destination, first);
  while (!route.completed) route.advance(.02);
  assert.notEqual(route.destination, first);
  assert.ok(distance(route.destination, first) >= 90);
  assert.equal(route.arrivals.length, 1);
});

test('a seta não se sobrepõe à confirmação nem ao começar a próxima rota', () => {
  const route = new AmbientRoute(buildRoads(1024, 768, [], 60, 768), random());
  while (!route.completed) route.advance(.02);
  assert.equal(route.arrowVisible, false);
  let seenConfirmation = false, resumed = false;
  for (let i = 0; i < 100; i++) {
    const confirmation = route.arrivals.some(p => route.clock - p.time < CONFIRM_SECONDS);
    if (confirmation) { seenConfirmation = true; assert.equal(route.arrowVisible, false); }
    if (route.arrowVisible) { resumed = true; assert.equal(confirmation, false); break; }
    route.advance(.02);
  }
  assert.ok(seenConfirmation && resumed);
});

test('rolar não recomeça a rota; quando a seta sai da tela, ela entra pela borda e para na parte visível', () => {
  const [width, height, blocks] = wide;
  const route = new AmbientRoute(buildRoads(width, height, blocks, 62, height), random(3), view(0));
  for (let i = 0; i < 20; i++) route.advance(.02);
  const before = { ...route.position }, destination = route.destination;
  route.setView(view(1200));
  route.advance(.02);
  // Logo após rolar nada salta: a seta segue do mesmo ponto.
  assert.ok(distance(before, route.position) < 3);
  assert.equal(route.destination, destination);
  for (let i = 0; i < 30; i++) route.advance(.02);
  assert.equal(route.teleports, 1);
  assert.ok(route.trail.some(p => p.separate));
  const v = route.view;
  assert.ok(route.destination.y >= v.top && route.destination.y <= v.bottom);
  assert.ok(route.position.y < v.outerTop || route.position.y > v.outerBottom, 'entra escondida, pela borda');
  assert.ok(route.remaining < 400);
});

test('se a seta continua na tela depois de rolar, ela termina a entrega normalmente', () => {
  const route = new AmbientRoute(buildRoads(1024, 3000, [], 60, 3000), random(9), view(0));
  const destination = route.destination;
  route.setView(view(40));
  for (let i = 0; i < 40; i++) route.advance(.02);
  assert.equal(route.teleports, 0);
  assert.equal(route.destination, destination);
});

test('mudança de layout mantém a seta no lugar quando a rua continua livre', () => {
  const route = new AmbientRoute(buildRoads(1024, 1500, [], 60, 1500), random(4), view(0));
  for (let i = 0; i < 15; i++) route.advance(.02);
  const before = { ...route.position };
  route.setRoads(buildRoads(1024, 1600, [], 60, 1600));
  assert.deepEqual(route.position, before);
  assert.equal(route.teleports, 0);
  for (let i = 0; i < 400 && !route.completed; i++) route.advance(.02);
  assert.equal(route.completed, 1);
});

test('duas rotas, uma em cada metade, nunca entram na faixa neutra nem se aproximam', () => {
  for (const [width, height, blocks] of layouts) {
    const roads = buildRoads(width, height, blocks, 62, height);
    const zones = splitZones(roads);
    assert.equal(zones.length, 2, `${width}px deveria ter duas rotas`);
    const gap = zones[1].minX - zones[0].maxX;
    assert.ok(gap >= 100, `faixa neutra de ${gap}px`);
    let v = view(0, Math.min(900, height));
    const pair = zones.map((zone, i) => new AmbientRoute(roads, random(17 + i), v, zone));
    const check = (m, p) => assert.ok(p.x >= m.zone.minX - .01 && p.x <= m.zone.maxX + .01, JSON.stringify({ p, zone: m.zone }));
    for (let step = 0; step < 6000; step++) {
      if (step % 1500 === 750 && height > 1200) { v = view(v.top + 500 > height - 900 ? 0 : v.top + 500); pair.forEach(m => m.setView(v)); }
      for (const m of pair) {
        m.advance(.02);
        check(m, m.position); check(m, m.destination);
        for (const e of m.edges) { check(m, e.a); check(m, e.b); }
      }
      assert.ok(Math.abs(pair[0].position.x - pair[1].position.x) >= gap - .01);
    }
    assert.ok(pair.every(m => m.completed >= 3));
  }
});

test('sem espaço para duas, uma rota só usa a tela inteira', () => {
  // A metade direita está toda ocupada: só sobra espaço à esquerda.
  const roads = buildRoads(600, 700, [{ x: 250, y: 0, right: 600, bottom: 700 }], 62, 700);
  assert.equal(splitZones(roads).length, 1);
  const route = new AmbientRoute(roads, random());
  for (let i = 0; i < 500; i++) route.advance(.02);
  assert.ok(route.completed >= 1);
});

test('áreas pequenas não iniciam a animação', () => {
  assert.equal(buildRoads(320, 220, [], 60, 150), null);
});
