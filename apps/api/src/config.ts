import { existsSync } from 'node:fs';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Ativa o ambiente de TESTE (dados de demonstração, banco embutido se não houver DATABASE_URL). */
  AMBIENTE_TESTE: bool,
  /** Ativa o ambiente de PRODUÇÃO (exige banco e segredo reais, sem seed, cookie seguro). */
  AMBIENTE_PRODUCAO: bool,
  PORT: z.coerce.number().int().default(3333),
  /** `pglite` (ou vazio, só no ambiente de teste) usa o Postgres embutido em `.pglite/`. */
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter ao menos 32 caracteres').optional(),
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

type Parsed = z.infer<typeof schema>;
export type Config = Omit<Parsed, 'DATABASE_URL' | 'JWT_SECRET'> & {
  /** Ambiente ativo, derivado das chaves AMBIENTE_TESTE / AMBIENTE_PRODUCAO. */
  APP_ENV: 'test' | 'production';
  DATABASE_URL: string;
  JWT_SECRET: string;
};

const TEST_JWT_SECRET = 'ambiente-de-teste-rotacerta-nao-usar-em-producao';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Lê o .env (sem sobrescrever variáveis já definidas no processo).
  if (env === process.env && existsSync('.env')) process.loadEnvFile('.env');

  const parsed = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  const fail = (issues: string[]): never => {
    throw new Error(`Configuração inválida:\n${issues.join('\n')}`);
  };
  if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

  const c = parsed.data;
  if (c.AMBIENTE_TESTE === c.AMBIENTE_PRODUCAO) {
    return fail(['Ative exatamente um ambiente: AMBIENTE_TESTE=true ou AMBIENTE_PRODUCAO=true (o outro como false).']);
  }

  if (c.AMBIENTE_PRODUCAO) {
    const issues: string[] = [];
    if (!c.DATABASE_URL || c.DATABASE_URL === 'pglite') issues.push('DATABASE_URL: obrigatória em produção (Postgres real).');
    if (!c.JWT_SECRET) issues.push('JWT_SECRET: obrigatório em produção (32+ caracteres aleatórios).');
    if (issues.length) return fail(issues);
    return { ...c, NODE_ENV: 'production', APP_ENV: 'production', DATABASE_URL: c.DATABASE_URL!, JWT_SECRET: c.JWT_SECRET! };
  }

  return {
    ...c,
    NODE_ENV: 'development',
    APP_ENV: 'test',
    DATABASE_URL: c.DATABASE_URL || 'pglite',
    JWT_SECRET: c.JWT_SECRET ?? TEST_JWT_SECRET,
    SEED_PASSWORD: c.SEED_PASSWORD ?? 'rotacerta123',
  };
}
