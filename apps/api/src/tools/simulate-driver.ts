/**
 * Simula um motorista em viagem enviando posições, para demonstrar o acompanhamento sem sair com o celular.
 *
 *   pnpm --filter @rotacerta/api simulate:driver
 *   API_URL=http://localhost:3333 EMAIL=motorista@rotacerta.local PASSWORD=... INTERVAL=3 pnpm ... simulate:driver
 *
 * Precisa de uma viagem ativa do motorista (no seed, o romaneio 1047 do Carlos).
 */
const API = process.env.API_URL ?? 'http://localhost:3333';
const EMAIL = process.env.EMAIL ?? 'motorista@rotacerta.local';
const PASSWORD = process.env.PASSWORD ?? process.env.SEED_PASSWORD ?? 'rotacerta123';
const INTERVAL_S = Number(process.env.INTERVAL ?? 3);

// percurso fictício em volta de um ponto (Av. Paulista, São Paulo)
const CENTER = { lat: -23.5614, lng: -46.6559 };
const STEPS = 120;

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

let step = 0;
for (;;) {
  const t = (step / STEPS) * 2 * Math.PI;
  const lat = CENTER.lat + 0.006 * Math.sin(t);
  const lng = CENTER.lng + 0.009 * Math.sin(t) * Math.cos(t) + 0.003 * Math.cos(t);
  const heading = ((Math.atan2(Math.cos(t), -Math.sin(t)) * 180) / Math.PI + 360) % 360;
  try {
    const r = await api<{ accepted: number }>(`/routes/${route.id}/locations`, token, {
      points: [{ lat, lng, speed: 6 + 2 * Math.sin(t * 3), heading, accuracy: 8, recordedAt: new Date().toISOString() }],
    });
    console.log(`#${step} ${lat.toFixed(5)}, ${lng.toFixed(5)} (${r.accepted} aceito)`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    if (String(e).startsWith('Error: 422') || String(e).startsWith('Error: 403')) break; // viagem encerrada
  }
  step = (step + 1) % STEPS;
  await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
}

export {};
