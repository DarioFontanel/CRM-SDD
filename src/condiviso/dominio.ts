/** Gli Stati della pipeline: cinque, fissi, non modificabili dall'app. */
export const STATI = ['Nuovo', 'Contattato', 'In trattativa', 'Cliente', 'Perso'] as const;
export type Stato = (typeof STATI)[number];

export function isStato(valore: unknown): valore is Stato {
  return STATI.includes(valore as Stato);
}

/** I modi in cui arriva un Invio. */
export const PUNTI_DI_INGRESSO = ['contatto', 'lead_magnet', 'prenotazione_call'] as const;
export type PuntoDiIngresso = (typeof PUNTI_DI_INGRESSO)[number];

export const NOME_PUNTO_DI_INGRESSO: Record<PuntoDiIngresso, string> = {
  contatto: 'Form di contatto',
  lead_magnet: 'Lead magnet',
  prenotazione_call: 'Prenotazione call',
};

export function isPuntoDiIngresso(valore: unknown): valore is PuntoDiIngresso {
  return PUNTI_DI_INGRESSO.includes(valore as PuntoDiIngresso);
}
