import { buildApp } from './app';
import { EventBus } from './realtime/events';
import { loadConfig } from './config';
import type { Db } from './db/client';
import { openEmbedded } from './db/embedded';
import { connect } from './db/pg';
import { seedDatabase } from './db/seed';
import { scheduleDispatcher } from './notifications/dispatcher';
import { SimulatedSender } from './notifications/sender';
import { schedulePurge } from './tracking';

const config = loadConfig();
let db: Db;
let close = async () => {};
if (config.DATABASE_URL === 'pglite') db = await openEmbedded(config);
else {
  ({ db, close } = connect(config.DATABASE_URL));
  // Ambiente de teste com Postgres externo (ex.: Docker): cria os dados de demonstração se o banco estiver vazio.
  if (config.APP_ENV === 'test' && (await seedDatabase(db, config.SEED_PASSWORD ?? 'rotacerta123'))) console.log('Ambiente de TESTE: dados de demonstração criados.');
}

const events = new EventBus();
const sender = new SimulatedSender();
const app = await buildApp({ config, db, events, sender });
if (config.REDIS_URL) { events.connectRedis(config.REDIS_URL, (e) => app.log.warn({ err: e.message }, 'Redis indisponível: tempo real só nesta instância')); app.log.info('Tempo real via Redis'); }
scheduleDispatcher(db, sender, events, app.log);
schedulePurge(db, config.LOCATION_RETENTION_DAYS, app.log);
app.log.info(`Ambiente: ${config.APP_ENV === 'production' ? 'PRODUÇÃO' : 'TESTE'} (banco: ${config.DATABASE_URL === 'pglite' ? 'embutido' : 'postgres'})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => { await app.close(); await events.close(); await close(); process.exit(0); });
}

await app.listen({ port: config.PORT, host: '0.0.0.0' });
