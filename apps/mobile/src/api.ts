import { sessionResponse, snapshotResponse, type Session, type Snapshot } from '@rotacerta/contracts';
import type { ZodType } from 'zod';

export type { Session, SessionUser, Snapshot } from '@rotacerta/contracts';

/**
 * Endereço da API (o mesmo backend do web). No build vem de `VITE_API_URL`.
 * No aparelho (Capacitor), use o IP/domínio da API, nunca "localhost".
 */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3333';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Token de acesso curto só em memória; a sessão longa fica no cookie httpOnly da API. */
let token: string | null = null;

async function raw(method: string, path: string, body?: unknown, auth = true): Promise<Response> {
  try {
    return await fetch(`${API_URL}/api${path}`, {
      method,
      credentials: 'include',
      headers: {
        'x-requested-with': 'rotacerta',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique a internet e tente de novo.', 0);
  }
}

async function parse<T>(res: Response, schema?: ZodType<T>): Promise<T> {
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((json as { error?: string }).error ?? 'Não foi possível concluir a operação.', res.status);
  if (!schema) return json as T;
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError('O servidor devolveu dados em um formato incompatível.', 502);
  return parsed.data;
}

let renewing: Promise<Session | null> | null = null;
/** Renova a sessão pelo cookie (uma renovação por vez). */
export function renewSession(): Promise<Session | null> {
  renewing ??= (async () => {
    try {
      const res = await raw('POST', '/auth/refresh', undefined, false);
      if (res.status === 401 || res.status === 403) { token = null; return null; }
      const session = await parse(res, sessionResponse);
      token = session.token;
      return session;
    } catch {
      return null;
    } finally {
      setTimeout(() => { renewing = null; }, 0);
    }
  })();
  return renewing;
}

export async function call<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res = await raw(method, path, body);
  if (res.status === 401 && !path.startsWith('/auth/') && await renewSession()) res = await raw(method, path, body);
  return parse<T>(res);
}

export async function login(email: string, password: string): Promise<Session> {
  const session = await parse(await raw('POST', '/auth/login', { email, password }, false), sessionResponse);
  token = session.token;
  return session;
}

export async function logout(): Promise<void> {
  try { await raw('POST', '/auth/logout', undefined, false); } catch { /* sem rede: descarta a sessão local mesmo assim */ }
  token = null;
}

export async function fetchSnapshot(): Promise<Snapshot> {
  let res = await raw('GET', '/dataset');
  if (res.status === 401 && await renewSession()) res = await raw('GET', '/dataset');
  return parse(res, snapshotResponse);
}
