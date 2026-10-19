import { and, eq } from 'drizzle-orm';
import { registraArrivo } from './arrivi.ts';
import { emailValida } from './contatti.ts';
import type { Db } from './db/apri.ts';
import { cambiDiPrenotazione, prenotazioni, uidDiPrenotazione } from './db/schema.ts';
import { ErroreCanale, type Canale } from './scarico.ts';

/** Una prenotazione così come la restituisce `GET /v2/bookings` di Cal.com (solo i campi che servono). */
export interface PrenotazioneCalcom {
  uid: string;
  status: string;
  start: string;
  createdAt: string;
  updatedAt?: string | null;
  cancellationReason?: string | null;
  /** Uno spostamento crea una prenotazione nuova che rimanda alla precedente. */
  rescheduledFromUid?: string | null;
  rescheduledToUid?: string | null;
  attendees?: { name?: string; email?: string; phoneNumber?: string }[];
  bookingFieldsResponses?: Record<string, unknown>;
}

export interface Calcom {
  /** Le prenotazioni cambiate da quel momento in poi; tutte se `da` è `null`. */
  cambiateDa(da: string | null): Promise<PrenotazioneCalcom[]>;
}

const INDIRIZZO = 'https://api.cal.com/v2/bookings';
const PER_PAGINA = 100;

/** Cal.com vero, letto con la chiave API. Il CRM non scrive e non cancella nulla su Cal.com. */
export function calcomDaAmbiente(ambiente: Record<string, string | undefined>, fetchUsato: typeof fetch = fetch): Canale<Calcom> {
  const chiave = ambiente.CALCOM_API_KEY?.trim();
  if (!chiave) return { nonConfigurato: 'Cal.com non configurato: nel file .env manca CALCOM_API_KEY.' };

  return {
    async cambiateDa(da) {
      const tutte: PrenotazioneCalcom[] = [];
      for (let salta = 0; ; salta += PER_PAGINA) {
        const indirizzo = new URL(INDIRIZZO);
        indirizzo.searchParams.set('take', String(PER_PAGINA));
        indirizzo.searchParams.set('skip', String(salta));
        if (da !== null) indirizzo.searchParams.set('afterUpdatedAt', da);

        let risposta: Response;
        try {
          risposta = await fetchUsato(indirizzo, {
            headers: { authorization: `Bearer ${chiave}`, 'cal-api-version': '2024-08-13' },
            signal: AbortSignal.timeout(20_000),
          });
        } catch {
          throw new ErroreCanale('Cal.com non è raggiungibile. Riprovo al prossimo giro.');
        }
        if (risposta.status === 401 || risposta.status === 403) {
          throw new ErroreCanale('Cal.com rifiuta la chiave: controlla CALCOM_API_KEY nel file .env.');
        }
        if (!risposta.ok) {
          throw new ErroreCanale(`Cal.com ha risposto con un errore (${risposta.status}). Riprovo al prossimo giro.`);
        }
        const corpo = (await risposta.json()) as { data?: PrenotazioneCalcom[]; pagination?: { hasNextPage?: boolean } };
        tutte.push(...(corpo.data ?? []));
        if (!corpo.pagination?.hasNextPage) return tutte;
      }
    },
  };
}

const iso = (momento: string) => new Date(momento).toISOString();
const testo = (valore: unknown) => (typeof valore === 'string' && valore.trim() !== '' ? valore : null);

/**
 * Cal.com ricava l'identificativo di una domanda dalla sua etichetta ("Come-ci-hai-conosciuto"):
 * qui diventano tutti minuscoli con i trattini bassi, così "Azienda" e "azienda" sono la stessa domanda.
 */
function conIdentificativiUniformi(risposte: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(risposte).map(([identificativo, valore]) => [
      identificativo.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      valore,
    ]),
  );
}

function prenotazioneConUid(db: Db, uid: string | null | undefined) {
  if (!uid) return undefined;
  return db
    .select({ prenotazione: prenotazioni })
    .from(uidDiPrenotazione)
    .innerJoin(prenotazioni, eq(prenotazioni.id, uidDiPrenotazione.prenotazioneId))
    .where(eq(uidDiPrenotazione.uid, uid))
    .get()?.prenotazione;
}

/**
 * Porta nel CRM le prenotazioni lette da Cal.com. Rileggere le stesse non cambia nulla.
 * - nuova: un Invio del punto di ingresso prenotazione call e una Prenotazione confermata;
 * - spostamento: la stessa Prenotazione prende il nuovo giorno e ora, senza un nuovo Invio;
 * - annullamento: la Prenotazione passa ad annullata, con il motivo.
 */
export function registraPrenotazioni(db: Db, lette: PrenotazioneCalcom[], adesso: Date): void {
  const inOrdine = [...lette].sort((a, b) => iso(a.createdAt).localeCompare(iso(b.createdAt)));

  for (const letta of inOrdine) {
    db.transaction((tx) => {
      let prenotazione = prenotazioneConUid(tx, letta.uid);

      if (!prenotazione) {
        const precedente = prenotazioneConUid(tx, letta.rescheduledFromUid);
        if (precedente) {
          prenotazione = tx
            .update(prenotazioni)
            .set({ inizio: iso(letta.start), stato: 'spostata', motivoAnnullamento: null, uidCorrente: letta.uid })
            .where(eq(prenotazioni.id, precedente.id))
            .returning()
            .get();
          // Per Cal.com la prenotazione vecchia risulta "cancelled": se era stata letta come annullamento, non lo era.
          tx.delete(cambiDiPrenotazione)
            .where(and(eq(cambiDiPrenotazione.prenotazioneId, precedente.id), eq(cambiDiPrenotazione.tipo, 'annullamento')))
            .run();
          tx.insert(cambiDiPrenotazione)
            .values({
              contattoId: precedente.contattoId,
              prenotazioneId: precedente.id,
              tipo: 'spostamento',
              quando: iso(letta.createdAt),
              da: precedente.inizio,
              a: iso(letta.start),
            })
            .run();
        } else {
          const partecipante = letta.attendees?.[0];
          const risposte = conIdentificativiUniformi(letta.bookingFieldsResponses ?? {});
          const email = partecipante?.email ?? risposte.email;
          if (!emailValida(email) || !['accepted', 'cancelled'].includes(letta.status)) return;

          const { contattoId, invioId } = registraArrivo(
            tx,
            {
              chiave: `calcom:${letta.uid}`,
              puntoDiIngresso: 'prenotazione_call',
              ricevutoIl: iso(letta.createdAt),
              email,
              nome: testo(partecipante?.name) ?? testo(risposte.name),
              telefono: testo(risposte.telefono) ?? testo(partecipante?.phoneNumber),
              azienda: testo(risposte.azienda),
              // Le "note aggiuntive" che Cal.com chiede di serie a chi prenota.
              messaggio: testo(risposte.notes),
              risorsa: null,
              comeMiHaiConosciuto: testo(risposte.come_mi_hai_conosciuto) ?? testo(risposte.come_ci_hai_conosciuto),
              pagina: null,
              privacyVersione: null,
            },
            adesso,
          );
          prenotazione = tx
            .insert(prenotazioni)
            .values({
              contattoId,
              invioId,
              inizio: iso(letta.start),
              inizioIniziale: iso(letta.start),
              prenotataIl: iso(letta.createdAt),
              uidCorrente: letta.uid,
            })
            .returning()
            .get();
        }
        tx.insert(uidDiPrenotazione).values({ uid: letta.uid, prenotazioneId: prenotazione.id }).run();
      }

      // Una prenotazione "cancelled" perché spostata non è un annullamento: lo è solo se è quella in vigore.
      const annullata =
        letta.status === 'cancelled' && !letta.rescheduledToUid && prenotazione.uidCorrente === letta.uid;
      if (annullata && prenotazione.stato !== 'annullata') {
        const motivo = testo(letta.cancellationReason);
        tx.update(prenotazioni)
          .set({ stato: 'annullata', motivoAnnullamento: motivo })
          .where(eq(prenotazioni.id, prenotazione.id))
          .run();
        tx.insert(cambiDiPrenotazione)
          .values({
            contattoId: prenotazione.contattoId,
            prenotazioneId: prenotazione.id,
            tipo: 'annullamento',
            quando: iso(letta.updatedAt ?? letta.createdAt),
            motivo,
          })
          .run();
      }
    });
  }
}
