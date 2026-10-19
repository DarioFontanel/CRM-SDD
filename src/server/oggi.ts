import { and, asc, desc, eq, gte, isNull, lt, lte, ne, sql } from 'drizzle-orm';
import type { Oggi, RigaCallDiOggi, RigaNuovoArrivo, RigaPromemoriaOggi, SezioneOggi } from '../condiviso/api.ts';
import type { Db } from './db/apri.ts';
import { contatti, invii, prenotazioni, promemoria } from './db/schema.ts';

/** Il giorno del calendario locale del Mac, `AAAA-MM-GG`. */
export function giornoLocale(momento: Date): string {
  const due = (n: number) => String(n).padStart(2, '0');
  return `${momento.getFullYear()}-${due(momento.getMonth() + 1)}-${due(momento.getDate())}`;
}

const nomeDelContatto = sql<string>`coalesce(${contatti.nome}, ${contatti.email})`;

/** I Contatti con un Invio non visto, dal più recente; di ognuno il più recente degli Invii non visti. */
function nuoviArrivi(db: Db): RigaNuovoArrivo[] {
  const nonVisti = db
    .select({
      contattoId: contatti.id,
      contatto: nomeDelContatto,
      puntoDiIngresso: invii.puntoDiIngresso,
      quando: invii.ricevutoIl,
      anteprima: sql<string | null>`coalesce(${invii.messaggio}, ${invii.risorsa})`,
    })
    .from(invii)
    .innerJoin(contatti, eq(contatti.id, invii.contattoId))
    .where(eq(invii.visto, false))
    .orderBy(desc(invii.ricevutoIl), desc(invii.id))
    .all();

  const perContatto = new Map<number, RigaNuovoArrivo>();
  for (const invio of nonVisti) {
    if (!perContatto.has(invio.contattoId)) perContatto.set(invio.contattoId, invio);
  }
  return [...perContatto.values()];
}

/** Le Prenotazioni non annullate che cadono nel giorno locale di `adesso`, in ordine di ora. */
function callDiOggi(db: Db, adesso: Date): RigaCallDiOggi[] {
  const mezzanotte = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const domani = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() + 1);
  return db
    .select({
      contattoId: contatti.id,
      contatto: nomeDelContatto,
      inizio: prenotazioni.inizio,
      stato: sql<RigaCallDiOggi['stato']>`${prenotazioni.stato}`,
    })
    .from(prenotazioni)
    .innerJoin(contatti, eq(contatti.id, prenotazioni.contattoId))
    .where(
      and(
        ne(prenotazioni.stato, 'annullata'),
        gte(prenotazioni.inizio, mezzanotte.toISOString()),
        lt(prenotazioni.inizio, domani.toISOString()),
      ),
    )
    .orderBy(asc(prenotazioni.inizio))
    .all();
}

export function daFareOggi(db: Db, adesso: Date): Oggi {
  const oggi = giornoLocale(adesso);

  const promemoriaAperti: RigaPromemoriaOggi[] = db
    .select({
      id: promemoria.id,
      testo: promemoria.testo,
      giorno: promemoria.giorno,
      contattoId: contatti.id,
      contatto: nomeDelContatto,
    })
    .from(promemoria)
    .innerJoin(contatti, eq(contatti.id, promemoria.contattoId))
    .where(and(isNull(promemoria.fattoIl), lte(promemoria.giorno, oggi)))
    .orderBy(asc(promemoria.giorno), asc(promemoria.id))
    .all();

  const sezioni: SezioneOggi[] = [
    { chiave: 'promemoria_scaduti' as const, righe: promemoriaAperti.filter((p) => p.giorno < oggi) },
    { chiave: 'promemoria_di_oggi' as const, righe: promemoriaAperti.filter((p) => p.giorno === oggi) },
    { chiave: 'call_di_oggi' as const, righe: callDiOggi(db, adesso) },
    { chiave: 'nuovi_arrivi' as const, righe: nuoviArrivi(db) },
  ];
  return { sezioni: sezioni.filter((sezione) => sezione.righe.length > 0) };
}

/** Il conteggio della cartella: quante righe ha Da fare oggi. */
export function conteggioOggi(db: Db, adesso: Date): number {
  return daFareOggi(db, adesso).sezioni.reduce((somma, sezione) => somma + sezione.righe.length, 0);
}
