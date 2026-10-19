import type { StatoCanale, StatoCanali } from '../condiviso/api.ts';
import { registraPrenotazioni, type Calcom } from './calcom.ts';
import type { Db } from './db/apri.ts';
import { scarichi } from './db/schema.ts';
import { scaricaDalPonte, type Ponte } from './ponte.ts';

/** Un canale che non risponde, con l'avviso da mostrare all'utente. */
export class ErroreCanale extends Error {}

/** Un canale pronto, oppure il motivo per cui non lo è (chiave mancante nel file `.env`). */
export type Canale<T> = T | { nonConfigurato: string };

const nonConfigurato = (canale: Canale<unknown>): canale is { nonConfigurato: string } =>
  typeof canale === 'object' && canale !== null && 'nonConfigurato' in canale;

export interface Scarico {
  /** Un giro di scarico da tutti i canali. Non fallisce mai: un canale che non risponde riprova al giro dopo. */
  esegui(): Promise<StatoCanali>;
  stato(): StatoCanali;
}

type Chiave = 'ponte' | 'calcom';

export function creaScarico(dip: { db: Db; adesso: () => Date; ponte: Canale<Ponte>; calcom: Canale<Calcom> }): Scarico {
  const { db, adesso } = dip;

  const canali: Record<Chiave, { scarica: Canale<(ultimoRiuscito: string | null) => Promise<void>>; avvisoGenerico: string }> = {
    ponte: {
      scarica: nonConfigurato(dip.ponte) ? dip.ponte : () => scaricaDalPonte(db, dip.ponte as Ponte, adesso),
      avvisoGenerico: 'Il ponte non risponde. Riprovo al prossimo giro.',
    },
    calcom: {
      // Solo le prenotazioni cambiate dall'ultimo scarico riuscito; al primo scarico, tutte.
      scarica: nonConfigurato(dip.calcom)
        ? dip.calcom
        : async (ultimoRiuscito) => registraPrenotazioni(db, await (dip.calcom as Calcom).cambiateDa(ultimoRiuscito), adesso()),
      avvisoGenerico: 'Cal.com non risponde. Riprovo al prossimo giro.',
    },
  };

  const salvati = new Map(db.select().from(scarichi).all().map((riga) => [riga.canale, riga.ultimoRiuscito]));
  const stati = {} as Record<Chiave, StatoCanale>;
  for (const chiave of Object.keys(canali) as Chiave[]) {
    const { scarica } = canali[chiave];
    stati[chiave] = {
      stato: nonConfigurato(scarica) ? 'non_configurato' : 'in_attesa',
      messaggio: nonConfigurato(scarica) ? scarica.nonConfigurato : null,
      ultimoRiuscito: salvati.get(chiave) ?? null,
    };
  }

  let inCorso: Promise<StatoCanali> | null = null;

  function stato(): StatoCanali {
    const riusciti = Object.values(stati).flatMap((canale) => canale.ultimoRiuscito ?? []);
    return {
      inCorso: inCorso !== null,
      ultimoScarico: riusciti.length > 0 ? riusciti.reduce((a, b) => (a < b ? a : b)) : null,
      ponte: { ...stati.ponte },
      calcom: { ...stati.calcom },
    };
  }

  async function scaricaCanale(chiave: Chiave): Promise<void> {
    const { scarica, avvisoGenerico } = canali[chiave];
    if (nonConfigurato(scarica)) return;
    const inizio = adesso().toISOString();
    try {
      await scarica(stati[chiave].ultimoRiuscito);
      db.insert(scarichi)
        .values({ canale: chiave, ultimoRiuscito: inizio })
        .onConflictDoUpdate({ target: scarichi.canale, set: { ultimoRiuscito: inizio } })
        .run();
      stati[chiave] = { stato: 'ok', messaggio: null, ultimoRiuscito: inizio };
    } catch (errore) {
      if (!(errore instanceof ErroreCanale)) console.error(`Scarico dal canale "${chiave}" fallito:`, errore);
      stati[chiave] = {
        ...stati[chiave],
        stato: 'errore',
        messaggio: errore instanceof ErroreCanale ? errore.message : avvisoGenerico,
      };
    }
  }

  return {
    stato,
    esegui() {
      // Un solo giro alla volta: chi chiede mentre uno è in corso aspetta quello.
      inCorso ??= (async () => {
        try {
          // Un canale che non risponde non ferma lo scarico dell'altro.
          await Promise.all((Object.keys(canali) as Chiave[]).map(scaricaCanale));
        } finally {
          inCorso = null;
        }
        return stato();
      })();
      return inCorso;
    },
  };
}
