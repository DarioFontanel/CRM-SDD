import { creaApp } from '../src/server/app.ts';
import { apriDatabase } from '../src/server/db/apri.ts';
import type { Calcom } from '../src/server/calcom.ts';
import type { Ponte, RigaPonte } from '../src/server/ponte.ts';
import { creaScarico, type Canale } from '../src/server/scarico.ts';

/** Il ponte finto: una tabella in memoria che si comporta come quella di Supabase. */
export class PonteFinto implements Ponte {
  righe: RigaPonte[] = [];
  /** Se impostato, il ponte "non risponde": ogni richiesta fallisce con questo errore. */
  guasto: Error | null = null;
  /** Se vero, la prossima cancellazione fallisce: simula il CRM interrotto a metà scarico. */
  interrompiAllaProssimaCancellazione = false;
  #prossimoId = 1;

  /** Aggiunge una riga come farebbe il sito: `id` e `created_at` li mette il ponte. */
  aggiungi(campi: Record<string, unknown>, creataIl = '2026-10-04T09:41:00Z'): RigaPonte {
    const riga = { id: `riga-${this.#prossimoId++}`, created_at: creataIl, ...campi };
    this.righe.push(riga);
    return riga;
  }

  async leggi(): Promise<RigaPonte[]> {
    if (this.guasto) throw this.guasto;
    return structuredClone(this.righe);
  }

  async cancella(id: string): Promise<void> {
    if (this.guasto) throw this.guasto;
    if (this.interrompiAllaProssimaCancellazione) {
      this.interrompiAllaProssimaCancellazione = false;
      throw new Error('CRM interrotto a metà scarico');
    }
    this.righe = this.righe.filter((riga) => riga.id !== id);
  }
}

/** Una riga valida del form di contatto, secondo il contratto di ingresso versione 1. */
export function rigaContatto(campi: Record<string, unknown> = {}) {
  return {
    versione: 1,
    tipo: 'contatto',
    email: 'mario@studiorossi.example',
    nome: 'Mario Rossi',
    telefono: null,
    azienda: 'Studio Rossi',
    messaggio: 'Vorrei un preventivo per automatizzare le fatture.',
    risorsa: null,
    come_mi_hai_conosciuto: 'LinkedIn',
    pagina: 'https://sito.example/contatti',
    privacy_accettata: true,
    privacy_versione: '2026-09-01',
    trappola: null,
    ...campi,
  };
}

/** Una riga valida del lead magnet. */
export function rigaLeadMagnet(campi: Record<string, unknown> = {}) {
  return rigaContatto({
    tipo: 'lead_magnet',
    messaggio: null,
    risorsa: 'guida-automazione-studio',
    pagina: 'https://sito.example/guida',
    ...campi,
  });
}

/** Un CRM intero in memoria: le API vere sopra un database vuoto, con orologio e ponte in mano al test. */
export function creaCrmDiProva(opzioni: { adesso?: string; ponte?: Canale<Ponte>; calcom?: Canale<Calcom> } = {}) {
  const db = apriDatabase(':memory:');
  const orologio = { adesso: new Date(opzioni.adesso ?? '2026-10-04T10:10:00Z') };
  const adesso = () => orologio.adesso;
  const ponte = new PonteFinto();

  /** Accende il CRM sul database: chiamarla di nuovo equivale a spegnerlo e riaccenderlo. */
  function accendi() {
    // Se il test non parla di Cal.com, Cal.com risponde sempre "niente di nuovo".
    const calcom = opzioni.calcom ?? { cambiateDa: async () => [] };
    const scarico = creaScarico({ db, adesso, ponte: opzioni.ponte ?? ponte, calcom });
    const app = creaApp({ db, adesso, scarico });

    async function chiama(metodo: string, percorso: string, corpo?: unknown) {
      const risposta = await app.request(percorso, {
        method: metodo,
        headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const testo = await risposta.text();
      const tipo = risposta.headers.get('content-type') ?? '';
      return {
        status: risposta.status,
        headers: risposta.headers,
        testo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        json: (tipo.includes('application/json') ? JSON.parse(testo) : undefined) as any,
      };
    }

    return {
      db,
      orologio,
      ponte,
      get: (percorso: string) => chiama('GET', percorso),
      post: (percorso: string, corpo?: unknown) => chiama('POST', percorso, corpo ?? {}),
      patch: (percorso: string, corpo: unknown) => chiama('PATCH', percorso, corpo),
      put: (percorso: string, corpo: unknown) => chiama('PUT', percorso, corpo),
      delete: (percorso: string) => chiama('DELETE', percorso),
      /** Un giro di scarico, come "Scarica ora". */
      scarica: () => chiama('POST', '/api/scarico', {}),
      /** L'unico Contatto con questa email, così come lo mostra la sua scheda. */
      async schedaDi(email: string) {
        const elenco = await chiama('GET', `/api/contatti?q=${encodeURIComponent(email)}`);
        if (elenco.json.contatti.length !== 1) {
          throw new Error(`Mi aspettavo un Contatto con email ${email}, ne ho trovati ${elenco.json.contatti.length}`);
        }
        return (await chiama('GET', `/api/contatti/${elenco.json.contatti[0].id}`)).json;
      },
    };
  }

  return { ...accendi(), riavvia: accendi };
}

export type CrmDiProva = ReturnType<typeof creaCrmDiProva>;
