import { eq } from 'drizzle-orm';
import { isStato, type PuntoDiIngresso, type Stato } from '../condiviso/dominio.ts';
import type { RigaContatto } from '../condiviso/api.ts';
import type { Db } from './db/apri.ts';
import { cambiDiStato, contatti, invii, scartati } from './db/schema.ts';
import { Rifiuto, nonTrovato } from './errori.ts';
import { ultimeAttivita } from './storico.ts';

export type Contatto = typeof contatti.$inferSelect;

export interface DatiContatto {
  email?: unknown;
  nome?: unknown;
  telefono?: unknown;
  azienda?: unknown;
}

/** L'email identifica il Contatto senza badare a maiuscole e spazi ai bordi. */
export function chiaveEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailValida(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Un campo facoltativo: testo senza spazi ai bordi, oppure niente. */
export function testoONiente(valore: unknown): string | null {
  if (typeof valore !== 'string') return null;
  const testo = valore.trim();
  return testo === '' ? null : testo;
}

function emailRichiesta(email: unknown): string {
  if (!emailValida(email)) throw new Rifiuto(400, "L'email non è valida.", 'email_non_valida');
  return email.trim();
}

export function trovaPerEmail(db: Db, email: string): Contatto | undefined {
  return db.select().from(contatti).where(eq(contatti.emailChiave, chiaveEmail(email))).get();
}

export function contattoRichiesto(db: Db, id: number): Contatto {
  const contatto = db.select().from(contatti).where(eq(contatti.id, id)).get();
  if (!contatto) throw nonTrovato('Contatto');
  return contatto;
}

/** Aggiunta a mano: se l'email esiste già restituisce il Contatto esistente invece di crearne un secondo. */
export function aggiungiAMano(db: Db, dati: DatiContatto, adesso: Date) {
  const email = emailRichiesta(dati.email);
  const esistente = trovaPerEmail(db, email);
  if (esistente) return { contatto: esistente, esistente: true };

  const contatto = db
    .insert(contatti)
    .values({
      email,
      emailChiave: chiaveEmail(email),
      nome: testoONiente(dati.nome),
      telefono: testoONiente(dati.telefono),
      azienda: testoONiente(dati.azienda),
      creatoIl: adesso.toISOString(),
    })
    .returning()
    .get();
  return { contatto, esistente: false };
}

export function correggi(db: Db, id: number, dati: DatiContatto): Contatto {
  const contatto = contattoRichiesto(db, id);
  const modifiche: Partial<typeof contatti.$inferInsert> = {};

  if (dati.email !== undefined) {
    const email = emailRichiesta(dati.email);
    const altro = trovaPerEmail(db, email);
    if (altro && altro.id !== contatto.id) {
      throw new Rifiuto(409, 'Questa email è già usata da un altro Contatto.', 'email_gia_usata');
    }
    modifiche.email = email;
    modifiche.emailChiave = chiaveEmail(email);
  }
  if (dati.nome !== undefined) modifiche.nome = testoONiente(dati.nome);
  if (dati.telefono !== undefined) modifiche.telefono = testoONiente(dati.telefono);
  if (dati.azienda !== undefined) modifiche.azienda = testoONiente(dati.azienda);

  if (Object.keys(modifiche).length === 0) return contatto;
  return db.update(contatti).set(modifiche).where(eq(contatti.id, id)).returning().get();
}

/** Il passaggio è libero, da qualunque Stato a qualunque altro, e lascia un Cambio di Stato. */
export function cambiaStato(db: Db, id: number, stato: unknown, adesso: Date): void {
  if (!isStato(stato)) throw new Rifiuto(400, 'Stato sconosciuto.');
  const contatto = contattoRichiesto(db, id);
  if (contatto.stato === stato) return;
  db.transaction((tx) => {
    tx.update(contatti).set({ stato }).where(eq(contatti.id, id)).run();
    tx.insert(cambiDiStato)
      .values({ contattoId: id, da: contatto.stato, a: stato, quando: adesso.toISOString() })
      .run();
  });
}

/** Cancella il Contatto, a cascata tutto ciò che gli è legato, e gli Scartati arrivati con la sua email. */
export function elimina(db: Db, id: number): void {
  const contatto = contattoRichiesto(db, id);
  db.transaction((tx) => {
    tx.delete(contatti).where(eq(contatti.id, id)).run();
    // Gli Scartati non sono legati a un Contatto: quelli con la sua email si riconoscono dalla riga.
    for (const scartato of tx.select().from(scartati).all()) {
      const email = scartato.riga.email;
      if (typeof email === 'string' && chiaveEmail(email) === contatto.emailChiave) {
        tx.delete(scartati).where(eq(scartati.id, scartato.id)).run();
      }
    }
  });
}

/** Aprire la scheda segna come visti gli Invii del Contatto. */
export function segnaVisto(db: Db, id: number): void {
  contattoRichiesto(db, id);
  db.update(invii).set({ visto: true }).where(eq(invii.contattoId, id)).run();
}

export interface FiltriElenco {
  stato?: Stato;
  q?: string;
  /** Solo i Contatti che hanno un Invio da questo punto di ingresso. */
  ingresso?: PuntoDiIngresso;
}

export function elenco(db: Db, filtri: FiltriElenco): RigaContatto[] {
  const q = filtri.q?.trim().toLowerCase() ?? '';
  const attivita = ultimeAttivita(db);
  const arrivi = db.select({ contattoId: invii.contattoId, puntoDiIngresso: invii.puntoDiIngresso, visto: invii.visto }).from(invii).all();
  const nonVisti = new Set(arrivi.filter((invio) => !invio.visto).map((invio) => invio.contattoId));
  const daIngresso = new Set(
    arrivi.filter((invio) => invio.puntoDiIngresso === filtri.ingresso).map((invio) => invio.contattoId),
  );
  return db
    .select()
    .from(contatti)
    .all()
    .filter((c) => filtri.stato === undefined || c.stato === filtri.stato)
    .filter((c) => filtri.ingresso === undefined || daIngresso.has(c.id))
    .filter((c) => q === '' || [c.nome, c.email, c.azienda].some((campo) => campo?.toLowerCase().includes(q)))
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      email: c.email,
      azienda: c.azienda,
      stato: c.stato,
      ultimaAttivita: attivita.get(c.id) ?? c.creatoIl,
      nonVisto: nonVisti.has(c.id),
    }))
    .sort((a, b) => b.ultimaAttivita.localeCompare(a.ultimaAttivita));
}
