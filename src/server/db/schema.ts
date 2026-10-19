import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { PuntoDiIngresso, Stato } from '../../condiviso/dominio.ts';

// Date e ore sono testo ISO in UTC: si ordinano come stringhe e l'interfaccia le mostra nell'ora locale.

export const contatti = sqliteTable(
  'contatti',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    /** L'email senza maiuscole né spazi ai bordi: è ciò che identifica il Contatto. */
    emailChiave: text('email_chiave').notNull(),
    nome: text('nome'),
    telefono: text('telefono'),
    azienda: text('azienda'),
    stato: text('stato').$type<Stato>().notNull().default('Nuovo'),
    creatoIl: text('creato_il').notNull(),
  },
  (t) => [uniqueIndex('contatti_email_chiave').on(t.emailChiave)],
);

/** Tutto ciò che è legato a un Contatto sparisce con lui. */
const delContatto = () =>
  integer('contatto_id')
    .notNull()
    .references(() => contatti.id, { onDelete: 'cascade' });

export const cambiDiStato = sqliteTable(
  'cambi_di_stato',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contattoId: delContatto(),
    da: text('da').$type<Stato>().notNull(),
    a: text('a').$type<Stato>().notNull(),
    quando: text('quando').notNull(),
  },
  (t) => [index('cambi_di_stato_contatto').on(t.contattoId)],
);

export const note = sqliteTable(
  'note',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contattoId: delContatto(),
    testo: text('testo').notNull(),
    quando: text('quando').notNull(),
  },
  (t) => [index('note_contatto').on(t.contattoId)],
);

export const promemoria = sqliteTable(
  'promemoria',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contattoId: delContatto(),
    testo: text('testo').notNull(),
    /** Giorno senza ora, `AAAA-MM-GG`, nel calendario locale del Mac. */
    giorno: text('giorno').notNull(),
    /** Vuoto finché il Promemoria è aperto; poi la data e ora in cui è stato fatto. */
    fattoIl: text('fatto_il'),
  },
  (t) => [index('promemoria_contatto').on(t.contattoId)],
);

export const invii = sqliteTable(
  'invii',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contattoId: delContatto(),
    /** L'identificativo dato da chi consegna l'Invio (riga del ponte, prenotazione di Cal.com): evita i doppioni. */
    chiave: text('chiave').notNull(),
    puntoDiIngresso: text('punto_di_ingresso').$type<PuntoDiIngresso>().notNull(),
    ricevutoIl: text('ricevuto_il').notNull(),
    // I dati così come digitati: la scheda del Contatto può dire altro.
    email: text('email').notNull(),
    nome: text('nome'),
    telefono: text('telefono'),
    azienda: text('azienda'),
    messaggio: text('messaggio'),
    risorsa: text('risorsa'),
    comeMiHaiConosciuto: text('come_mi_hai_conosciuto'),
    pagina: text('pagina'),
    privacyVersione: text('privacy_versione'),
    visto: integer('visto', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('invii_chiave').on(t.chiave), index('invii_contatto').on(t.contattoId)],
);

/** Per ogni canale (ponte, Cal.com), il momento dell'ultimo scarico riuscito. */
export const scarichi = sqliteTable('scarichi', {
  canale: text('canale').$type<'ponte' | 'calcom'>().primaryKey(),
  ultimoRiuscito: text('ultimo_riuscito').notNull(),
});

/** Un arrivo dal ponte che non è diventato un Invio, tenuto da parte per essere controllato. */
export const scartati = sqliteTable(
  'scartati',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** L'`id` della riga nel ponte: la stessa riga non diventa mai due Scartati. */
    rigaId: text('riga_id').notNull(),
    /** La riga del ponte per intero. */
    riga: text('riga', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    quando: text('quando').notNull(),
    motivo: text('motivo').notNull(),
  },
  (t) => [uniqueIndex('scartati_riga_id').on(t.rigaId)],
);

export type StatoPrenotazione = 'confermata' | 'spostata' | 'annullata';

export const prenotazioni = sqliteTable(
  'prenotazioni',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contattoId: delContatto(),
    /** L'Invio del punto di ingresso prenotazione call da cui nasce. */
    invioId: integer('invio_id')
      .notNull()
      .references(() => invii.id, { onDelete: 'cascade' }),
    /** Giorno e ora della call, oggi. */
    inizio: text('inizio').notNull(),
    /** Giorno e ora scelti al momento della prenotazione, prima di ogni spostamento. */
    inizioIniziale: text('inizio_iniziale').notNull(),
    prenotataIl: text('prenotata_il').notNull(),
    stato: text('stato').$type<StatoPrenotazione>().notNull().default('confermata'),
    motivoAnnullamento: text('motivo_annullamento'),
    /** L'identificativo che Cal.com dà oggi alla prenotazione: cambia a ogni spostamento. */
    uidCorrente: text('uid_corrente').notNull(),
  },
  (t) => [index('prenotazioni_contatto').on(t.contattoId)],
);

/** Tutti gli identificativi che Cal.com ha dato nel tempo a una Prenotazione: riletti, non creano doppioni. */
export const uidDiPrenotazione = sqliteTable('uid_di_prenotazione', {
  uid: text('uid').primaryKey(),
  prenotazioneId: integer('prenotazione_id')
    .notNull()
    .references(() => prenotazioni.id, { onDelete: 'cascade' }),
});

/** Gli spostamenti e l'annullamento di una Prenotazione, per lo Storico. */
export const cambiDiPrenotazione = sqliteTable(
  'cambi_di_prenotazione',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contattoId: delContatto(),
    prenotazioneId: integer('prenotazione_id')
      .notNull()
      .references(() => prenotazioni.id, { onDelete: 'cascade' }),
    tipo: text('tipo').$type<'spostamento' | 'annullamento'>().notNull(),
    quando: text('quando').notNull(),
    /** Per uno spostamento: giorno e ora prima e dopo. */
    da: text('da'),
    a: text('a'),
    /** Per un annullamento: il motivo, se presente. */
    motivo: text('motivo'),
  },
  (t) => [index('cambi_di_prenotazione_contatto').on(t.contattoId)],
);
