/** Un rifiuto che l'interfaccia mostra all'utente così com'è. */
export class Rifiuto extends Error {
  readonly status: 400 | 404 | 409;
  readonly codice: string | undefined;

  constructor(status: 400 | 404 | 409, messaggio: string, codice?: string) {
    super(messaggio);
    this.status = status;
    this.codice = codice;
  }
}

export const nonTrovato = (cosa: string) => new Rifiuto(404, `${cosa} non trovato.`);
