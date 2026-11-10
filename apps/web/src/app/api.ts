import type { AnyRole, Dataset, PaperForm } from '@rotacerta/domain';

/** Endereço da API. Em produção vem do build (`VITE_API_URL`); local, aponta para a API de desenvolvimento. */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3333';

/** `companyId` é nulo só para o perfil `plataforma`. */
export interface SessionUser { sub: number; name: string; role: AnyRole; companyId: number | null; driverId: number | null }
export interface Snapshot { data: Dataset; papers: PaperForm[] }
/** `mustChangePassword`: a senha foi definida por outra pessoa e precisa ser trocada antes de usar o sistema. */
export interface Session { token: string; user: SessionUser; mustChangePassword: boolean }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Requisição que o store enfileira para o servidor. */
export interface Req { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; body?: unknown }

/** Token de acesso (curto) só em memória. A sessão longa fica num cookie httpOnly que o JavaScript não lê. */
let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };

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

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((json as { error?: string }).error ?? 'Não foi possível concluir a operação.', res.status);
  return json as T;
}

/**
 * Renova a sessão pelo cookie. Uma renovação por vez: abas e chamadas simultâneas esperam a mesma resposta
 * (cada cookie só vale uma troca).
 */
let renewing: Promise<Session | null> | null = null;
export function renewSession(): Promise<Session | null> {
  renewing ??= (async () => {
    try {
      const res = await raw('POST', '/auth/refresh', undefined, false);
      if (res.status === 401 || res.status === 403) { token = null; return null; }
      const session = await parse<Session>(res);
      token = session.token;
      return session;
    } finally {
      setTimeout(() => { renewing = null; }, 0);
    }
  })();
  return renewing;
}

export async function call<T = unknown>(method: 'GET' | Req['method'], path: string, body?: unknown): Promise<T> {
  let res = await raw(method, path, body);
  // token de acesso vencido: renova pelo cookie e repete uma vez
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await renewSession()) res = await raw(method, path, body);
  }
  return parse<T>(res);
}

export const send = (r: Req) => call(r.method, r.path, r.body);

export async function login(email: string, password: string): Promise<Session> {
  const session = await parse<Session>(await raw('POST', '/auth/login', { email, password }, false));
  token = session.token;
  return session;
}

export async function logout(): Promise<void> {
  try { await raw('POST', '/auth/logout', undefined, false); } catch { /* sem rede: a sessão local é descartada mesmo assim */ }
  token = null;
}

export const fetchSnapshot = () => call<Snapshot>('GET', '/dataset');

/** Abre o canal em tempo real com um ticket de 30 s, sem colocar o token de acesso na URL. */
export async function openSocket(): Promise<WebSocket> {
  const { ticket } = await call<{ ticket: string }>('POST', '/auth/ws-ticket');
  return new WebSocket(`${API_URL.replace(/^http/, 'ws')}/api/ws?ticket=${encodeURIComponent(ticket)}`);
}
