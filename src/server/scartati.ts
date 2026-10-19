import { desc, eq } from 'drizzle-orm';
import type { DettaglioScartato, RigaScartato } from '../condiviso/api.ts';
import { registraArrivo } from './arrivi.ts';
import { emailValida } from './contatti.ts';
import type { Db } from './db/apri.ts';
import { scartati } from './db/schema.ts';
import { Rifiuto, nonTrovato } from './errori.ts';
import { arrivoDaRiga, type RigaPonte } from './ponte.ts';

type Scartato = typeof scartati.$inferSelect;

const testo = (valore: unknown) => (typeof valore === 'string' && valore !== '' ? valore : null);

function riga(scartato: Scartato): RigaScartato {
  return { id: scartato.id, email: testo(scartato.riga.email), motivo: scartato.motivo, quando: scartato.quando };
}

function scartatoRichiesto(db: Db, id: number): Scartato {
  const scartato = db.select().from(scartati).where(eq(scartati.id, id)).get();
  if (!scartato) throw nonTrovato('Scartato');
  return scartato;
}

export function elenco(db: Db): RigaScartato[] {
  return db.select().from(scartati).orderBy(desc(scartati.quando), desc(scartati.id)).all().map(riga);
}

export function dettaglio(db: Db, id: number): DettaglioScartato {
  const scartato = scartatoRichiesto(db, id);
  return {
    ...riga(scartato),
    tipo: testo(scartato.riga.tipo),
    contenuto: testo(scartato.riga.messaggio) ?? testo(scartato.riga.risorsa),
    riga: scartato.riga,
  };
}

/**
 * "Recupera come contatto": lo Scartato diventa un Invio con le regole di ogni arrivo e lascia gli Scartati.
 * Se l'email arrivata non è valida serve quella corretta a mano.
 */
export function recupera(db: Db, id: number, emailCorretta: unknown, adesso: Date): { contattoId: number } {
  const scartato = scartatoRichiesto(db, id);
  const email = emailCorretta ?? scartato.riga.email;
  if (!emailValida(email)) {
    throw new Rifiuto(400, "L'email non è valida: correggila per recuperare il contatto.", 'email_non_valida');
  }
  return db.transaction((tx) => {
    const { contattoId } = registraArrivo(tx, arrivoDaRiga(scartato.riga as RigaPonte), adesso, email);
    tx.delete(scartati).where(eq(scartati.id, id)).run();
    return { contattoId };
  });
}

export function elimina(db: Db, id: number): void {
  const { changes } = db.delete(scartati).where(eq(scartati.id, id)).run();
  if (changes === 0) throw nonTrovato('Scartato');
}
