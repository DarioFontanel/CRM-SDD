import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { creaApp } from './app.ts';
import { calcomDaAmbiente } from './calcom.ts';
import { faiBackup } from './backup.ts';
import { apriDatabase } from './db/apri.ts';
import { creaScarico } from './scarico.ts';
import { ponteDaAmbiente } from './supabase.ts';

const RADICE = join(import.meta.dirname, '../..');
const PERCORSO_DB = join(RADICE, 'data/crm.sqlite');
const PORTA = Number(process.env.PORT ?? 4310);
const OGNI_CINQUE_MINUTI = 5 * 60 * 1000;

if (existsSync(join(RADICE, '.env'))) process.loadEnvFile(join(RADICE, '.env'));

// Prima di toccare il database, se ne mette da parte una copia.
faiBackup({ percorsoDb: PERCORSO_DB, cartellaBackup: join(RADICE, 'data/backups'), adesso: new Date() });

const db = apriDatabase(PERCORSO_DB);
const adesso = () => new Date();
const scarico = creaScarico({ db, adesso, ponte: ponteDaAmbiente(process.env), calcom: calcomDaAmbiente(process.env) });
const app = creaApp({ db, adesso, scarico });

// L'interfaccia costruita da Vite: tutto ciò che non è /api.
app.use('*', serveStatic({ root: join(RADICE, 'dist') }));

// Solo 127.0.0.1: il CRM non ha login e non deve essere raggiungibile dalla rete.
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: PORTA }, () => {
  console.log(`\nCRM acceso: apri http://127.0.0.1:${PORTA} nel browser. Ctrl+C per spegnerlo.\n`);
});

// Il CRM scarica all'avvio e poi ogni 5 minuti, finché resta acceso.
void scarico.esegui();
const giro = setInterval(() => void scarico.esegui(), OGNI_CINQUE_MINUTI);

function spegni() {
  clearInterval(giro);
  server.close();
  process.exit(0);
}
process.on('SIGINT', spegni);
process.on('SIGTERM', spegni);
