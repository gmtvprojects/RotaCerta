import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config';
import { connect } from './pg';

const { DATABASE_URL } = loadConfig();
const { db, close } = connect(DATABASE_URL);
await migrate(db, { migrationsFolder: './drizzle' });
await close();
console.log('Migrações aplicadas.');
