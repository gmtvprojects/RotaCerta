import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import { connect } from './pg';
import * as t from './schema';

/**
 * Cria o primeiro usuário de gestão em um banco vazio (produção não tem seed).
 * Os dados vêm de variáveis de ambiente, para a senha não ficar no histórico do terminal nem em argumentos:
 *   DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
 * Os demais usuários são criados depois, pela tela de Usuários.
 */
const { DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL) throw new Error('Defina DATABASE_URL.');
if (!ADMIN_NAME?.trim()) throw new Error('Defina ADMIN_NAME.');
if (!ADMIN_EMAIL?.includes('@')) throw new Error('Defina ADMIN_EMAIL com um e-mail válido.');
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) throw new Error('ADMIN_PASSWORD precisa ter ao menos 10 caracteres.');

const email = ADMIN_EMAIL.trim().toLowerCase();
const { db, close } = connect(DATABASE_URL);
try {
  const existing = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, email));
  if (existing.length) {
    console.log('Já existe um usuário com esse e-mail; nada a fazer.');
  } else {
    await db.insert(t.users).values({ name: ADMIN_NAME.trim(), email, role: 'gestao', passwordHash: await hashPassword(ADMIN_PASSWORD) });
    console.log(`Gestor criado: ${email}`);
  }
} finally {
  await close();
}
