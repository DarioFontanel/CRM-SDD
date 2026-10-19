import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { creaApp } from '../src/server/app.ts';
import { faiBackup } from '../src/server/backup.ts';
import { apriDatabase } from '../src/server/db/apri.ts';
import { creaScarico } from '../src/server/scarico.ts';

let cartella: string;
let percorsoDb: string;
let cartellaBackup: string;

beforeEach(() => {
  cartella = mkdtempSync(join(tmpdir(), 'crm-backup-'));
  percorsoDb = join(cartella, 'crm.sqlite');
  cartellaBackup = join(cartella, 'backups');
});
afterEach(() => rmSync(cartella, { recursive: true, force: true }));

function crmSu(percorso: string) {
  const db = apriDatabase(percorso);
  const adesso = () => new Date('2026-10-04T10:10:00Z');
  const scarico = creaScarico({ db, adesso, ponte: { nonConfigurato: 'Non serve.' }, calcom: { nonConfigurato: 'Non serve.' } });
  return creaApp({ db, adesso, scarico });
}

test('il backup ha data e ora nel nome e si apre come un database valido con i Contatti dentro', async () => {
  const crm = crmSu(percorsoDb);
  await crm.request('/api/contatti', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'mario@studiorossi.example', nome: 'Mario Rossi' }),
  });

  // Le 10:10:05 UTC sono le 12:10:05 a Roma.
  faiBackup({ percorsoDb, cartellaBackup, adesso: new Date('2026-10-04T10:10:05Z') });

  expect(readdirSync(cartellaBackup)).toEqual(['crm-2026-10-04_12-10-05.sqlite']);
  const copia = crmSu(join(cartellaBackup, 'crm-2026-10-04_12-10-05.sqlite'));
  const elenco = await (await copia.request('/api/contatti')).json();
  expect(elenco.contatti.map((c: { nome: string }) => c.nome)).toEqual(['Mario Rossi']);
});

test("restano solo le ultime 10 copie: all'undicesimo avvio la più vecchia sparisce", () => {
  crmSu(percorsoDb);

  for (let avvio = 1; avvio <= 11; avvio++) {
    faiBackup({ percorsoDb, cartellaBackup, adesso: new Date(Date.UTC(2026, 9, avvio, 8, 0, 0)) });
  }

  const copie = readdirSync(cartellaBackup).sort();
  expect(copie).toHaveLength(10);
  expect(copie[0]).toBe('crm-2026-10-02_10-00-00.sqlite');
  expect(copie[9]).toBe('crm-2026-10-11_10-00-00.sqlite');
});

test('al primissimo avvio, quando il database non esiste ancora, non succede nulla', () => {
  expect(() => faiBackup({ percorsoDb, cartellaBackup, adesso: new Date('2026-10-04T10:10:05Z') })).not.toThrow();

  expect(existsSync(percorsoDb)).toBe(false);
  expect(existsSync(cartellaBackup) ? readdirSync(cartellaBackup) : []).toEqual([]);
});
