import { and, asc, eq, isNull } from 'drizzle-orm';
import type { PromemoriaAperto } from '../condiviso/api.ts';
import { contattoRichiesto, testoONiente } from './contatti.ts';
import type { Db } from './db/apri.ts';
import { promemoria } from './db/schema.ts';
import { Rifiuto, nonTrovato } from './errori.ts';

function testoRichiesto(testo: unknown): string {
  const pulito = testoONiente(testo);
  if (pulito === null) throw new Rifiuto(400, 'Scrivi cosa devi fare.');
  return pulito;
}

/** Un giorno senza ora, `AAAA-MM-GG`, che esiste davvero nel calendario. */
function giornoRichiesto(giorno: unknown): string {
  const valido =
    typeof giorno === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(giorno) &&
    new Date(`${giorno}T00:00:00Z`).toJSON()?.startsWith(giorno) === true;
  if (!valido) throw new Rifiuto(400, 'Il giorno non è valido.');
  return giorno;
}

export function aggiungi(db: Db, contattoId: number, dati: { testo?: unknown; giorno?: unknown }) {
  contattoRichiesto(db, contattoId);
  return db
    .insert(promemoria)
    .values({ contattoId, testo: testoRichiesto(dati.testo), giorno: giornoRichiesto(dati.giorno) })
    .returning()
    .get();
}

/** Modifica il testo, sposta a un altro giorno, oppure segna come fatto. */
export function modifica(
  db: Db,
  id: number,
  dati: { testo?: unknown; giorno?: unknown; fatto?: unknown },
  adesso: Date,
) {
  const modifiche: Partial<typeof promemoria.$inferInsert> = {};
  if (dati.testo !== undefined) modifiche.testo = testoRichiesto(dati.testo);
  if (dati.giorno !== undefined) modifiche.giorno = giornoRichiesto(dati.giorno);
  if (dati.fatto === true) modifiche.fattoIl = adesso.toISOString();
  if (dati.fatto === false) modifiche.fattoIl = null;

  const esistente = db.select().from(promemoria).where(eq(promemoria.id, id)).get();
  if (!esistente) throw nonTrovato('Promemoria');
  // Segnare come fatto un Promemoria già fatto non ne sposta la data di completamento.
  if (dati.fatto === true && esistente.fattoIl !== null) delete modifiche.fattoIl;
  if (Object.keys(modifiche).length === 0) return esistente;
  return db.update(promemoria).set(modifiche).where(eq(promemoria.id, id)).returning().get();
}

export function cancella(db: Db, id: number): void {
  const { changes } = db.delete(promemoria).where(eq(promemoria.id, id)).run();
  if (changes === 0) throw nonTrovato('Promemoria');
}

export function apertiDi(db: Db, contattoId: number): PromemoriaAperto[] {
  return db
    .select({ id: promemoria.id, testo: promemoria.testo, giorno: promemoria.giorno })
    .from(promemoria)
    .where(and(eq(promemoria.contattoId, contattoId), isNull(promemoria.fattoIl)))
    .orderBy(asc(promemoria.giorno), asc(promemoria.id))
    .all();
}
