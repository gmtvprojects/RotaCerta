import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/app/ambientRouteModel.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { AmbientRoute, buildRoads, inside, distance, CONFIRM_SECONDS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
function random() { let seed = 73; return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

test('os destinos e os caminhos ficam nas áreas livres, inclusive sem espaço entre os blocos', () => {
  for (const [width, height, blocks] of [
    [1440, 900, [{ x: 190, y: 90, right: 1250, bottom: 180 }, { x: 190, y: 206, right: 1250, bottom: 330 }, { x: 190, y: 390, right: 1250, bottom: 650 }]],
    [320, 568, [{ x: 20, y: 84, right: 300, bottom: 170 }, { x: 20, y: 194, right: 300, bottom: 800 }]],
    [390, 844, [{ x: 20, y: 60, right: 370, bottom: 1200 }]],
  ]) {
    const roads = buildRoads(width, height, blocks, 60, height - 86);
    assert.ok(roads);
    const route = new AmbientRoute(roads, random());
    for (let i = 0; i < 150; i++) {
      assert.ok(!blocks.some(r => inside(route.destination, r, 8)));
      assert.ok(Object.isFrozen(route.destination));
      assert.ok(route.destination.y >= roads.top && route.destination.y <= roads.bottom);
      for (const e of route.edges) {
        assert.ok(e.a.x === e.b.x || e.a.y === e.b.y);
        if (e.portal) { assert.equal(e.length, 0); continue; }
        for (let d = 0; d <= e.length; d += 5) {
          const f = d / e.length, p = { x: e.a.x + (e.b.x - e.a.x) * f, y: e.a.y + (e.b.y - e.a.y) * f };
          if (p.x >= 0 && p.x <= width) assert.ok(!blocks.some(r => inside(p, r, 7)), JSON.stringify({ p, e }));
        }
      }
      route.position = { ...route.destination }; route.plan();
    }
  }
});

test('o destino fica parado até a chegada e o próximo surge imediatamente', () => {
  const route = new AmbientRoute(buildRoads(1024, 768, [], 60, 680), random());
  const first = route.destination;
  for (let i = 0; i < 10; i++) route.advance(.02);
  assert.equal(route.destination, first);
  while (!route.completed) route.advance(.02);
  assert.notEqual(route.destination, first);
  assert.ok(distance(route.destination, first) >= 70);
  assert.equal(route.arrivals.length, 1);
});

test('a seta não se sobrepõe à confirmação nem ao começar a próxima rota', () => {
  const route = new AmbientRoute(buildRoads(1024, 768, [], 60, 680), random());
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

test('a travessia lateral quebra o rastro, sem desenhar uma linha pela tela', () => {
  const route = new AmbientRoute(buildRoads(1024, 768, [], 60, 680), random());
  while (!route.teleports) route.advance(.02);
  assert.ok(route.trail.some(p => p.separate));
  assert.equal(route.teleports, 1);
  assert.ok(route.position.x < 0);
});

test('áreas pequenas não iniciam a animação', () => {
  assert.equal(buildRoads(320, 220, [], 60, 150), null);
});
