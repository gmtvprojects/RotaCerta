import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter ao menos 32 caracteres'),
  /** Validade do token de acesso (um turno de trabalho). */
  JWT_EXPIRES_IN: z.string().default('12h'),
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
