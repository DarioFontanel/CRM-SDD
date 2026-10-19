import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const NOME_COPIA = /^crm-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sqlite$/;

/** `crm-AAAA-MM-GG_OO-MM-SS.sqlite`, nell'ora locale: l'ordine alfabetico è l'ordine di tempo. */
function nomeCopia(adesso: Date): string {
  const due = (n: number) => String(n).padStart(2, '0');
  const giorno = `${adesso.getFullYear()}-${due(adesso.getMonth() + 1)}-${due(adesso.getDate())}`;
  const ora = `${due(adesso.getHours())}-${due(adesso.getMinutes())}-${due(adesso.getSeconds())}`;
  return `crm-${giorno}_${ora}.sqlite`;
}

/**
 * Copia il database nella cartella dei backup e tiene solo le copie più recenti.
 * Se il database non esiste ancora (primissimo avvio) non fa nulla.
 */
export function faiBackup(opzioni: { percorsoDb: string; cartellaBackup: string; adesso: Date; daTenere?: number }): void {
  const { percorsoDb, cartellaBackup, adesso, daTenere = 10 } = opzioni;
  if (!existsSync(percorsoDb)) return;

  mkdirSync(cartellaBackup, { recursive: true });
  const destinazione = join(cartellaBackup, nomeCopia(adesso));
  rmSync(destinazione, { force: true });

  // VACUUM INTO scrive una copia coerente anche se il file è a metà di una scrittura.
  const sqlite = new Database(percorsoDb, { fileMustExist: true });
  try {
    sqlite.prepare('VACUUM INTO ?').run(destinazione);
  } finally {
    sqlite.close();
  }

  const copie = readdirSync(cartellaBackup).filter((nome) => NOME_COPIA.test(nome)).sort();
  for (const vecchia of copie.slice(0, Math.max(0, copie.length - daTenere))) {
    rmSync(join(cartellaBackup, vecchia));
  }
}
