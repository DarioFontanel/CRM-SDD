import { eq } from 'drizzle-orm';
import type { PuntoDiIngresso } from '../condiviso/dominio.ts';
import { chiaveEmail, testoONiente, trovaPerEmail } from './contatti.ts';
import type { Db } from './db/apri.ts';
import { contatti, invii } from './db/schema.ts';

/** Ciò che un punto di ingresso consegna al CRM, con i dati così come digitati. */
export interface Arrivo {
  /** Identificativo dato da chi consegna: lo stesso arrivo non diventa mai due Invii. */
  chiave: string;
  puntoDiIngresso: PuntoDiIngresso;
  ricevutoIl: string;
  email: string;
  nome: string | null;
  telefono: string | null;
  azienda: string | null;
  messaggio: string | null;
  risorsa: string | null;
  comeMiHaiConosciuto: string | null;
  pagina: string | null;
  privacyVersione: string | null;
}

export function invioConChiave(db: Db, chiave: string) {
  return db.select().from(invii).where(eq(invii.chiave, chiave)).get();
}

/**
 * La regola di ogni arrivo: l'Invio va sul Contatto con quell'email, creato in Stato Nuovo se non esiste.
 * I campi vuoti della scheda vengono riempiti; quelli già presenti non vengono mai sovrascritti.
 * Lo Stato non cambia.
 */
export function registraArrivo(
  db: Db,
  arrivo: Arrivo,
  adesso: Date,
  /** L'email che identifica il Contatto, se quella digitata è stata corretta a mano. */
  emailDelContatto = arrivo.email,
): { contattoId: number; invioId: number } {
  return db.transaction((tx) => {
    const dati = {
      nome: testoONiente(arrivo.nome),
      telefono: testoONiente(arrivo.telefono),
      azienda: testoONiente(arrivo.azienda),
    };

    let contatto = trovaPerEmail(tx, emailDelContatto);
    if (!contatto) {
      contatto = tx
        .insert(contatti)
        .values({
          email: emailDelContatto.trim(),
          emailChiave: chiaveEmail(emailDelContatto),
          ...dati,
          creatoIl: adesso.toISOString(),
        })
        .returning()
        .get();
    } else {
      tx.update(contatti)
        .set({
          nome: contatto.nome ?? dati.nome,
          telefono: contatto.telefono ?? dati.telefono,
          azienda: contatto.azienda ?? dati.azienda,
        })
        .where(eq(contatti.id, contatto.id))
        .run();
    }

    const invio = tx
      .insert(invii)
      .values({ ...arrivo, contattoId: contatto.id })
      .returning({ id: invii.id })
      .get();
    return { contattoId: contatto.id, invioId: invio.id };
  });
}
