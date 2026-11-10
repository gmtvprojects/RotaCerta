import type { AnyRole } from '@rotacerta/domain';

/** `companyId` é nulo apenas para o perfil `plataforma`. */
export interface AuthUser { sub: number; name: string; role: AnyRole; companyId: number | null; driverId: number | null }

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}
