// La forma delle risposte dell'API, condivisa tra server e interfaccia.
import type { PuntoDiIngresso, Stato } from './dominio.ts';

export interface Cartelle {
  oggi: number;
  tutti: number;
  stati: Record<Stato, number>;
  scartati: number;
}

/** Una riga degli elenchi di Tutti i contatti e delle cartelle di Stato. */
export interface RigaContatto {
  id: number;
  nome: string | null;
  email: string;
  azienda: string | null;
  stato: Stato;
  ultimaAttivita: string;
  /** Vero se il Contatto ha un Invio non visto: negli elenchi è il pallino. */
  nonVisto: boolean;
}

export interface Scheda {
  id: number;
  email: string;
  nome: string | null;
  telefono: string | null;
  azienda: string | null;
  stato: Stato;
  creatoIl: string;
  /** Il punto di ingresso del primo Invio, oppure "a_mano" se non ha Invii. */
  arrivatoDa: PuntoDiIngresso | 'a_mano';
  /** La prima risposta a "Come mi hai conosciuto?" tra gli Invii. */
  comeMiHaConosciuto: string | null;
  /** I Promemoria aperti, dal giorno più vicino. */
  promemoria: PromemoriaAperto[];
  storico: VoceStorico[];
}

export interface PromemoriaAperto {
  id: number;
  testo: string;
  giorno: string;
}

/** Una voce dello Storico: ciò che è successo al Contatto, con data e ora. */
export type VoceStorico =
  | { tipo: 'stato'; quando: string; da: Stato; a: Stato }
  | VoceInvio
  /** Una call prenotata: `inizio` è il giorno e ora scelti al momento della prenotazione. */
  | { tipo: 'prenotazione'; quando: string; inizio: string }
  | { tipo: 'spostamento'; quando: string; da: string; a: string }
  | { tipo: 'annullamento'; quando: string; motivo: string | null }
  | { tipo: 'nota'; quando: string; id: number; testo: string }
  /** Un Promemoria fatto: `quando` è la data di completamento. */
  | { tipo: 'promemoria'; quando: string; testo: string; giorno: string };

/** Un Invio così com'è arrivato: `quando` è la data e ora di ricezione. */
export interface VoceInvio {
  tipo: 'invio';
  quando: string;
  puntoDiIngresso: PuntoDiIngresso;
  email: string;
  nome: string | null;
  telefono: string | null;
  azienda: string | null;
  messaggio: string | null;
  risorsa: string | null;
  comeMiHaiConosciuto: string | null;
  pagina: string | null;
  privacyVersione: string | null;
}

export interface RigaPromemoriaOggi extends PromemoriaAperto {
  contattoId: number;
  /** Il nome del Contatto, o la sua email se il nome manca. */
  contatto: string;
}

/** Da fare oggi: le sezioni nell'ordine in cui vanno mostrate; quelle vuote non ci sono. */
export type SezioneOggi =
  | { chiave: 'promemoria_scaduti' | 'promemoria_di_oggi'; righe: RigaPromemoriaOggi[] }
  | { chiave: 'call_di_oggi'; righe: RigaCallDiOggi[] }
  | { chiave: 'nuovi_arrivi'; righe: RigaNuovoArrivo[] };

/** Una Prenotazione di oggi non annullata. */
export interface RigaCallDiOggi {
  contattoId: number;
  contatto: string;
  inizio: string;
  stato: 'confermata' | 'spostata';
}

/** Un Contatto con un Invio non visto, con il più recente dei suoi Invii non visti. */
export interface RigaNuovoArrivo {
  contattoId: number;
  contatto: string;
  puntoDiIngresso: PuntoDiIngresso;
  quando: string;
  /** Il messaggio o la risorsa richiesta. */
  anteprima: string | null;
}

export interface Oggi {
  sezioni: SezioneOggi[];
}

/** Lo stato di un canale di ingresso, mostrato nella barra in alto. */
export interface StatoCanale {
  stato: 'in_attesa' | 'ok' | 'errore' | 'non_configurato';
  /** L'avviso da mostrare all'utente quando lo stato è `errore` o `non_configurato`. */
  messaggio: string | null;
  ultimoRiuscito: string | null;
}

export interface StatoCanali {
  inCorso: boolean;
  /** Il momento fino al quale tutti i canali che hanno già scaricato sono aggiornati. */
  ultimoScarico: string | null;
  ponte: StatoCanale;
  calcom: StatoCanale;
}

/** Una riga dell'elenco Scartati. */
export interface RigaScartato {
  id: number;
  email: string | null;
  motivo: string;
  quando: string;
}

export interface DettaglioScartato extends RigaScartato {
  tipo: string | null;
  /** Il messaggio o la risorsa richiesta. */
  contenuto: string | null;
  /** La riga del ponte per intero. */
  riga: Record<string, unknown>;
}
