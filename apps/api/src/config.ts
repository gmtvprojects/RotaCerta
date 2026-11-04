import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter ao menos 32 caracteres'),
  /** Validade do token de acesso. Curto: a renovação é feita pelo cookie de sessão. */
  JWT_EXPIRES_IN: z.string().default('15m'),
  /** Dias que uma sessão sobrevive sem uso (renovada a cada acesso). */
  REFRESH_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  /** `none` quando web e API ficam em domínios diferentes (exige HTTPS); `lax` no mesmo site (ex.: localhost). */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** Tentativas de login por minuto e por IP. */
  LOGIN_RATE_MAX: z.coerce.number().int().min(1).default(10),
  /** Dias de histórico de posições dos motoristas (dado pessoal: guardar só o necessário). */
  LOCATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Cookie só por HTTPS. Padrão: ligado em produção. */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** Origens permitidas no CORS, separadas por vírgula. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  APP_TZ: z.string().default('America/Sao_Paulo'),
  /** Senha dos usuários criados pelo seed de desenvolvimento. */
  SEED_PASSWORD: z.string().min(8).optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  return parsed.data;
}
