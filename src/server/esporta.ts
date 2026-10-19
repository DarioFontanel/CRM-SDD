import { asc, eq, min } from 'drizzle-orm';
import { contattoRichiesto } from './contatti.ts';
import type { Db } from './db/apri.ts';
import { contatti, invii, note, prenotazioni, promemoria } from './db/schema.ts';
import { storicoDi } from './storico.ts';

/** Una cella CSV: tra virgolette se serve, e innocua se un foglio di calcolo la leggerebbe come formula. */
function cella(valore: string | null): string {
  let testo = valore ?? '';
  const sembraUnTelefono = /^[+-]?[\d\s().\/-]+$/.test(testo);
  if (/^[=@\t\r]/.test(testo) || (/^[+-]/.test(testo) && !sembraUnTelefono)) testo = `'${testo}`;
  return /[",\r\n]/.test(testo) ? `"${testo.replaceAll('"', '""')}"` : testo;
}

/** `AAAA-MM-GG OO:MM` nell'ora locale del Mac. */
function dataLocale(momento: string): string {
  const d = new Date(momento);
  const due = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())} ${due(d.getHours())}:${due(d.getMinutes())}`;
}

/** Tutti i Contatti, uno per riga: i campi della scheda, lo Stato e la data del primo Invio. */
export function csvDeiContatti(db: Db): string {
  const primiInvii = new Map(
    db
      .select({ contattoId: invii.contattoId, primo: min(invii.ricevutoIl) })
      .from(invii)
      .groupBy(invii.contattoId)
      .all()
      .map((riga) => [riga.contattoId, riga.primo]),
  );
  const righe = db
    .select()
    .from(contatti)
    .orderBy(asc(contatti.emailChiave))
    .all()
    .map((c) => {
      const primo = primiInvii.get(c.id);
      return [c.nome, c.email, c.telefono, c.azienda, c.stato, primo ? dataLocale(primo) : null];
    });

  const intestazione = ['nome', 'email', 'telefono', 'azienda', 'stato', 'primo_invio'];
  // Il BOM iniziale fa leggere bene le lettere accentate a Excel.
  return '\uFEFF' + [intestazione, ...righe].map((riga) => riga.map(cella).join(',') + '\r\n').join('');
}

/** Tutto ciò che il CRM sa di una persona, per "Esporta dati". */
export function datiDellaPersona(db: Db, id: number, adesso: Date) {
  const contatto = contattoRichiesto(db, id);
  const { emailChiave: _, ...scheda } = contatto;
  const del = <T extends { contattoId: number }>(righe: T[]) => righe.map(({ contattoId: _, ...resto }) => resto);
  return {
    esportatoIl: adesso.toISOString(),
    contatto: scheda,
    invii: del(db.select().from(invii).where(eq(invii.contattoId, id)).orderBy(asc(invii.ricevutoIl)).all()),
    prenotazioni: del(db.select().from(prenotazioni).where(eq(prenotazioni.contattoId, id)).all()),
    note: del(db.select().from(note).where(eq(note.contattoId, id)).orderBy(asc(note.quando)).all()),
    promemoria: del(db.select().from(promemoria).where(eq(promemoria.contattoId, id)).all()),
    storico: storicoDi(db, id),
  };
}
