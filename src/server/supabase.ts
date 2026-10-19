import type { Ponte, RigaPonte } from './ponte.ts';
import { ErroreCanale, type Canale } from './scarico.ts';

const TABELLA = 'ponte';

/**
 * Il ponte vero: la tabella `ponte` del progetto Supabase dedicato, letta e svuotata con la chiave segreta.
 * Se nel file `.env` manca qualcosa restituisce il motivo, così il CRM parte lo stesso e lo mostra.
 */
export function ponteDaAmbiente(ambiente: Record<string, string | undefined>, fetchUsato: typeof fetch = fetch): Canale<Ponte> {
  const url = ambiente.SUPABASE_URL?.trim();
  const chiave = ambiente.SUPABASE_SECRET_KEY?.trim();
  const mancanti = [!url && 'SUPABASE_URL', !chiave && 'SUPABASE_SECRET_KEY'].filter(Boolean);
  if (!url || !chiave) return { nonConfigurato: `Ponte non configurato: nel file .env ${mancanti.length > 1 ? 'mancano' : 'manca'} ${mancanti.join(' e ')}.` };
  if (!URL.canParse(url)) return { nonConfigurato: 'Ponte non configurato: SUPABASE_URL nel file .env non è un indirizzo valido.' };

  async function richiesta(metodo: string, parametri: Record<string, string>): Promise<Response> {
    const indirizzo = new URL(`/rest/v1/${TABELLA}`, url);
    for (const [nome, valore] of Object.entries(parametri)) indirizzo.searchParams.set(nome, valore);

    let risposta: Response;
    try {
      risposta = await fetchUsato(indirizzo, {
        method: metodo,
        headers: { apikey: chiave!, authorization: `Bearer ${chiave}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ErroreCanale('Il ponte non è raggiungibile. Riprovo al prossimo giro.');
    }
    if (risposta.status === 401 || risposta.status === 403) {
      throw new ErroreCanale('Il ponte rifiuta la chiave: controlla SUPABASE_SECRET_KEY nel file .env.');
    }
    if (!risposta.ok) {
      throw new ErroreCanale(`Il ponte ha risposto con un errore (${risposta.status}). Riprovo al prossimo giro.`);
    }
    return risposta;
  }

  return {
    async leggi() {
      const risposta = await richiesta('GET', { select: '*', order: 'created_at.asc' });
      return (await risposta.json()) as RigaPonte[];
    },
    async cancella(id) {
      await richiesta('DELETE', { id: `eq.${id}` });
    },
  };
}
