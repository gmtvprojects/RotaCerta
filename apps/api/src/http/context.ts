import type { Role } from '@rotacerta/domain';

export interface AuthUser { sub: number; name: string; role: Role; driverId: number | null }

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}
