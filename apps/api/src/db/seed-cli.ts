import { loadConfig } from '../config';
import { connect } from './pg';
import { seedDatabase } from './seed';

const config = loadConfig();
if (config.NODE_ENV === 'production') throw new Error('O seed de demonstração não roda em produção.');
if (!config.SEED_PASSWORD) throw new Error('Defina SEED_PASSWORD para criar os usuários de demonstração.');
const { db, close } = connect(config.DATABASE_URL);
console.log((await seedDatabase(db, config.SEED_PASSWORD)) ? 'Seed aplicado.' : 'Banco já tem dados; nada a fazer.');
await close();
