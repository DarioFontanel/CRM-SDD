import { eq } from 'drizzle-orm';
import { invioConChiave, registraArrivo, type Arrivo } from './arrivi.ts';
import { emailValida } from './contatti.ts';
import type { Db } from './db/apri.ts';
import { scartati } from './db/schema.ts';

/** Una riga del ponte: `id` e `created_at` li mette Supabase, il resto lo scrive il sito. */
export interface RigaPonte {
  id: string;
  created_at: string;
  [campo: string]: unknown;
}

/** Il deposito online in cui il sito lascia gli Invii e da cui il CRM li ritira. */
export interface Ponte {
  leggi(): Promise<RigaPonte[]>;
  cancella(id: string): Promise<void>;
}

const VERSIONE_DEL_CONTRATTO = 1;
const CAMPO_DEL_TIPO = { contatto: 'messaggio', lead_magnet: 'risorsa' } as const;
type Tipo = keyof typeof CAMPO_DEL_TIPO;

const vuoto = (valore: unknown) => valore === null || valore === undefined || String(valore).trim() === '';
const isTipo = (valore: unknown): valore is Tipo => typeof valore === 'string' && Object.hasOwn(CAMPO_DEL_TIPO, valore);

/** I dati così come digitati: il testo com'è, oppure niente. */
function comeDigitato(valore: unknown): string | null {
  return typeof valore === 'string' && valore !== '' ? valore : null;
}

export const chiaveDellaRiga = (riga: RigaPonte) => `ponte:${riga.id}`;

/** Perché una riga non può diventare un Invio; `null` se è valida secondo il contratto di ingresso. */
export function motivoDiScarto(riga: RigaPonte): string | null {
  if (!vuoto(riga.trappola)) return 'Campo trappola compilato';
  if (Number(riga.versione) !== VERSIONE_DEL_CONTRATTO) return 'Versione del contratto sconosciuta';
  if (!isTipo(riga.tipo)) return 'Tipo sconosciuto';
  if (!emailValida(riga.email)) return 'Email non valida';
  if (riga.privacy_accettata !== true) return 'Informativa sulla privacy non accettata';
  if (vuoto(riga[CAMPO_DEL_TIPO[riga.tipo]])) {
    return riga.tipo === 'contatto' ? 'Manca il messaggio' : 'Manca la risorsa richiesta';
  }
  return null;
}

/** L'arrivo che una riga del ponte porta con sé, con i dati così come digitati. */
export function arrivoDaRiga(riga: RigaPonte): Arrivo {
  return {
    chiave: chiaveDellaRiga(riga),
    puntoDiIngresso: riga.tipo === 'lead_magnet' ? 'lead_magnet' : 'contatto',
    ricevutoIl: new Date(riga.created_at).toISOString(),
    email: comeDigitato(riga.email) ?? '',
    nome: comeDigitato(riga.nome),
    telefono: comeDigitato(riga.telefono),
    azienda: comeDigitato(riga.azienda),
    messaggio: comeDigitato(riga.messaggio),
    risorsa: comeDigitato(riga.risorsa),
    comeMiHaiConosciuto: comeDigitato(riga.come_mi_hai_conosciuto),
    pagina: comeDigitato(riga.pagina),
    privacyVersione: comeDigitato(riga.privacy_versione),
  };
}

function giaSalvata(db: Db, riga: RigaPonte): boolean {
  return (
    invioConChiave(db, chiaveDellaRiga(riga)) !== undefined ||
    db.select({ id: scartati.id }).from(scartati).where(eq(scartati.rigaId, riga.id)).get() !== undefined
  );
}

/**
 * Un giro di scarico dal ponte: ogni riga diventa un Invio, oppure uno Scartato con il motivo.
 * La riga viene cancellata dal ponte solo dopo il salvataggio locale: se il CRM si interrompe a metà,
 * al giro dopo la ritrova, vede che l'ha già salvata e la cancella soltanto.
 */
export async function scaricaDalPonte(db: Db, ponte: Ponte, adesso: () => Date): Promise<void> {
  const righe = await ponte.leggi();
  righe.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const riga of righe) {
    if (!giaSalvata(db, riga)) {
      const motivo = motivoDiScarto(riga);
      if (motivo === null) {
        registraArrivo(db, arrivoDaRiga(riga), adesso());
      } else {
        db.insert(scartati)
          .values({ rigaId: riga.id, riga, quando: new Date(riga.created_at).toISOString(), motivo })
          .run();
      }
    }
    await ponte.cancella(riga.id);
  }
}
