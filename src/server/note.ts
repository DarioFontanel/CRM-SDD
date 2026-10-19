import { eq } from 'drizzle-orm';
import { contattoRichiesto, testoONiente } from './contatti.ts';
import type { Db } from './db/apri.ts';
import { note } from './db/schema.ts';
import { Rifiuto, nonTrovato } from './errori.ts';

function testoRichiesto(testo: unknown): string {
  const pulito = testoONiente(testo);
  if (pulito === null) throw new Rifiuto(400, 'La Nota è vuota.');
  return pulito;
}

export function aggiungi(db: Db, contattoId: number, testo: unknown, adesso: Date) {
  contattoRichiesto(db, contattoId);
  return db
    .insert(note)
    .values({ contattoId, testo: testoRichiesto(testo), quando: adesso.toISOString() })
    .returning()
    .get();
}

export function correggi(db: Db, id: number, testo: unknown) {
  const nota = db.update(note).set({ testo: testoRichiesto(testo) }).where(eq(note.id, id)).returning().get();
  if (!nota) throw nonTrovato('Nota');
  return nota;
}

export function cancella(db: Db, id: number): void {
  const { changes } = db.delete(note).where(eq(note.id, id)).run();
  if (changes === 0) throw nonTrovato('Nota');
}
