import type { Scheda } from '../condiviso/api.ts';
import { contattoRichiesto } from './contatti.ts';
import { asc, eq } from 'drizzle-orm';
import type { Db } from './db/apri.ts';
import { invii } from './db/schema.ts';
import { apertiDi } from './promemoria.ts';
import { storicoDi } from './storico.ts';

/** Tutto ciò che il pannello di dettaglio mostra di un Contatto. */
export function schedaDi(db: Db, id: number): Scheda {
  const c = contattoRichiesto(db, id);
  const arrivi = db
    .select({ puntoDiIngresso: invii.puntoDiIngresso, comeMiHaiConosciuto: invii.comeMiHaiConosciuto })
    .from(invii)
    .where(eq(invii.contattoId, id))
    .orderBy(asc(invii.ricevutoIl), asc(invii.id))
    .all();
  return {
    id: c.id,
    email: c.email,
    nome: c.nome,
    telefono: c.telefono,
    azienda: c.azienda,
    stato: c.stato,
    creatoIl: c.creatoIl,
    arrivatoDa: arrivi[0]?.puntoDiIngresso ?? 'a_mano',
    comeMiHaConosciuto: arrivi.find((invio) => invio.comeMiHaiConosciuto !== null)?.comeMiHaiConosciuto ?? null,
    promemoria: apertiDi(db, c.id),
    storico: storicoDi(db, c.id),
  };
}
