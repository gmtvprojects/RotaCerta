import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config';
import { connect } from './pg';
import { migrateAllTenants } from './tenants';

const { DATABASE_URL } = loadConfig();
const { db, close } = connect(DATABASE_URL);
// 1) tabelas compartilhadas (schema public); 2) o schema de cada empresa
await migrate(db, { migrationsFolder: './drizzle' });
const { companies, applied } = await migrateAllTenants(db);
await close();
console.log(`Migrações aplicadas (${companies} empresa(s), ${applied} migração(ões) de empresa).`);
