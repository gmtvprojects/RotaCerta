/**
 * Simula um motorista em viagem enviando posições, para demonstrar o acompanhamento sem sair com o celular.
 *
 *   pnpm --filter @rotacerta/api simulate:driver
 *   API_URL=http://localhost:3333 EMAIL=motorista@rotacerta.local PASSWORD=... INTERVAL=3 pnpm ... simulate:driver
 *
 * Precisa de uma viagem ativa do motorista (no seed, o romaneio 1047 do Carlos).
 */
import { pointAlong } from '../gps-sim';

const API = process.env.API_URL ?? 'http://localhost:3333';
const EMAIL = process.env.EMAIL ?? 'motorista@rotacerta.local';
const PASSWORD = process.env.PASSWORD ?? process.env.SEED_PASSWORD ?? 'rotacerta123';
const INTERVAL_S = Number(process.env.INTERVAL ?? 3);

// percurso por ruas de São Paulo (o mesmo do botão Simular da tela de acompanhamento)
const STEP_METERS = 25;

async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${(json as { error?: string }).error ?? 'erro'}`);
  return json as T;
}

const { token, user } = await api<{ token: string; user: { driverId: number | null } }>('/auth/login', undefined, { email: EMAIL, password: PASSWORD });
const { data } = await api<{ data: { routes: { id: number; status: string; driverId: number | null }[] } }>('/dataset', token);
const route = data.routes.find((r) => r.status === 'active' && r.driverId === user.driverId);
if (!route) throw new Error('Este motorista não tem viagem ativa. Inicie um romaneio primeiro.');
console.log(`Simulando a viagem #${route.id}, um ponto a cada ${INTERVAL_S} s. Ctrl+C para parar.`);

let meters = 0;
for (let step = 0; ; step++) {
  meters += STEP_METERS;
  const { lat, lng, heading } = pointAlong(meters);
  try {
    const r = await api<{ accepted: number }>(`/routes/${route.id}/locations`, token, {
      points: [{ lat, lng, speed: STEP_METERS / INTERVAL_S, heading, accuracy: 8, recordedAt: new Date().toISOString() }],
    });
    console.log(`#${step} ${lat.toFixed(5)}, ${lng.toFixed(5)} (${r.accepted} aceito)`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    if (String(e).startsWith('Error: 422') || String(e).startsWith('Error: 403')) break; // viagem encerrada
  }
  await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
}


