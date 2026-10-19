import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.ts';

const CARTELLA_MIGRAZIONI = join(import.meta.dirname, '../../../drizzle');

/** Apre (o crea) il database e lo porta all'ultima migrazione. `:memory:` serve ai test. */
export function apriDatabase(percorso: string): Db {
  if (percorso !== ':memory:') mkdirSync(dirname(percorso), { recursive: true });
  const sqlite = new Database(percorso);
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: CARTELLA_MIGRAZIONI });
  return db;
}

/** Il database, oppure una transazione aperta su di esso. */
export type Db = BaseSQLiteDatabase<'sync', Database.RunResult, typeof schema>;
