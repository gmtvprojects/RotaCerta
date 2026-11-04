import { buildApp } from './app';
import { loadConfig } from './config';
import { connect } from './db/pg';
import { schedulePurge } from './tracking';

const config = loadConfig();
const { db, close } = connect(config.DATABASE_URL);
const app = await buildApp({ config, db });
schedulePurge(db, config.LOCATION_RETENTION_DAYS, app.log);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => { await app.close(); await close(); process.exit(0); });
}

await app.listen({ port: config.PORT, host: '0.0.0.0' });
