import { eq, isNotNull, max, and } from 'drizzle-orm';
import type { VoceStorico } from '../condiviso/api.ts';
import type { Db } from './db/apri.ts';
import { cambiDiPrenotazione, cambiDiStato, invii, note, prenotazioni, promemoria } from './db/schema.ts';

/**
 * Lo Storico non è un'entità a sé: è l'elenco, dal più recente, di ciò che è successo al Contatto.
 */
export function storicoDi(db: Db, contattoId: number): VoceStorico[] {
  const voci: VoceStorico[] = [];

  for (const cambio of db.select().from(cambiDiStato).where(eq(cambiDiStato.contattoId, contattoId)).all()) {
    voci.push({ tipo: 'stato', quando: cambio.quando, da: cambio.da, a: cambio.a });
  }
  for (const invio of db.select().from(invii).where(eq(invii.contattoId, contattoId)).all()) {
    voci.push({
      tipo: 'invio',
      quando: invio.ricevutoIl,
      puntoDiIngresso: invio.puntoDiIngresso,
      email: invio.email,
      nome: invio.nome,
      telefono: invio.telefono,
      azienda: invio.azienda,
      messaggio: invio.messaggio,
      risorsa: invio.risorsa,
      comeMiHaiConosciuto: invio.comeMiHaiConosciuto,
      pagina: invio.pagina,
      privacyVersione: invio.privacyVersione,
    });
  }
  for (const p of db.select().from(prenotazioni).where(eq(prenotazioni.contattoId, contattoId)).all()) {
    voci.push({ tipo: 'prenotazione', quando: p.prenotataIl, inizio: p.inizioIniziale });
  }
  for (const c of db.select().from(cambiDiPrenotazione).where(eq(cambiDiPrenotazione.contattoId, contattoId)).all()) {
    voci.push(
      c.tipo === 'spostamento'
        ? { tipo: 'spostamento', quando: c.quando, da: c.da!, a: c.a! }
        : { tipo: 'annullamento', quando: c.quando, motivo: c.motivo },
    );
  }
  for (const nota of db.select().from(note).where(eq(note.contattoId, contattoId)).all()) {
    voci.push({ tipo: 'nota', quando: nota.quando, id: nota.id, testo: nota.testo });
  }
  const fatti = db
    .select()
    .from(promemoria)
    .where(and(eq(promemoria.contattoId, contattoId), isNotNull(promemoria.fattoIl)))
    .all();
  for (const fatto of fatti) {
    voci.push({ tipo: 'promemoria', quando: fatto.fattoIl!, testo: fatto.testo, giorno: fatto.giorno });
  }

  return voci.sort((a, b) => b.quando.localeCompare(a.quando));

}

/** Per ogni Contatto con qualcosa nello Storico, il momento della voce più recente. */
export function ultimeAttivita(db: Db): Map<number, string> {
  const ultime = new Map<number, string>();
  const fonti = [
    db
      .select({ contattoId: cambiDiStato.contattoId, quando: max(cambiDiStato.quando) })
      .from(cambiDiStato)
      .groupBy(cambiDiStato.contattoId)
      .all(),
    db.select({ contattoId: invii.contattoId, quando: max(invii.ricevutoIl) }).from(invii).groupBy(invii.contattoId).all(),
    db
      .select({ contattoId: cambiDiPrenotazione.contattoId, quando: max(cambiDiPrenotazione.quando) })
      .from(cambiDiPrenotazione)
      .groupBy(cambiDiPrenotazione.contattoId)
      .all(),
    db.select({ contattoId: note.contattoId, quando: max(note.quando) }).from(note).groupBy(note.contattoId).all(),
    db
      .select({ contattoId: promemoria.contattoId, quando: max(promemoria.fattoIl) })
      .from(promemoria)
      .groupBy(promemoria.contattoId)
      .all(),
  ];
  for (const { contattoId, quando } of fonti.flat()) {
    if (quando !== null && quando > (ultime.get(contattoId) ?? '')) ultime.set(contattoId, quando);
  }
  return ultime;
}
