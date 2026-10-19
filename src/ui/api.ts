import { useEffect, useState } from 'react';

export class ErroreApi extends Error {
  readonly status: number;
  readonly corpo: Record<string, unknown>;

  constructor(messaggio: string, status: number, corpo: Record<string, unknown>) {
    super(messaggio);
    this.status = status;
    this.corpo = corpo;
  }
}

async function chiama<T>(metodo: string, percorso: string, corpo?: unknown): Promise<T> {
  const risposta = await fetch(percorso, {
    method: metodo,
    headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dati = risposta.status === 204 ? {} : await risposta.json().catch(() => ({}));
  if (!risposta.ok) {
    throw new ErroreApi(dati.errore ?? 'Qualcosa è andato storto. Riprova.', risposta.status, dati);
  }
  return dati as T;
}

export const api = {
  get: <T>(percorso: string) => chiama<T>('GET', percorso),
  post: <T>(percorso: string, corpo: unknown = {}) => chiama<T>('POST', percorso, corpo),
  patch: <T>(percorso: string, corpo: unknown) => chiama<T>('PATCH', percorso, corpo),
  put: <T>(percorso: string, corpo: unknown) => chiama<T>('PUT', percorso, corpo),
  delete: <T>(percorso: string) => chiama<T>('DELETE', percorso),
};

/** Legge un percorso dell'API e lo rilegge ogni volta che cambia `versione`. */
export function useDati<T>(percorso: string | null, versione: number): T | undefined {
  const [dati, setDati] = useState<{ percorso: string; valore: T }>();
  useEffect(() => {
    if (percorso === null) return;
    let annullato = false;
    api
      .get<T>(percorso)
      .then((valore) => {
        if (!annullato) setDati({ percorso, valore });
      })
      .catch(() => {
        // Il server è spento o la riga non esiste più: resta ciò che c'era.
      });
    return () => {
      annullato = true;
    };
  }, [percorso, versione]);
  return dati?.percorso === percorso ? dati.valore : undefined;
}
