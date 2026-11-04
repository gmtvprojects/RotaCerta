import type { Dataset, PaperForm, Role } from '@rotacerta/domain';

/** Endereço da API. Em produção vem do build (`VITE_API_URL`); local, aponta para a API de desenvolvimento. */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3333';

export interface SessionUser { sub: number; name: string; role: Role; driverId: number | null }
export interface Snapshot { data: Dataset; papers: PaperForm[] }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Requisição que o store enfileira para o servidor. */
export interface Req { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; body?: unknown }

let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };

export async function call<T = unknown>(method: 'GET' | Req['method'], path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique a internet e tente de novo.', 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((json as { error?: string }).error ?? 'Não foi possível concluir a operação.', res.status);
  return json as T;
}

export const send = (r: Req) => call(r.method, r.path, r.body);

export const login = (email: string, password: string) => call<{ token: string; user: SessionUser }>('POST', '/auth/login', { email, password });
export const fetchSnapshot = () => call<Snapshot>('GET', '/dataset');

export const wsUrl = (t: string) => `${API_URL.replace(/^http/, 'ws')}/api/ws?token=${encodeURIComponent(t)}`;
