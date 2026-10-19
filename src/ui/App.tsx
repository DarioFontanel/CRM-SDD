import { ChevronLeft, ListTodo, Plus, RefreshCw, ShieldAlert, TriangleAlert, UserRound, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Cartelle, StatoCanale, StatoCanali } from '../condiviso/api.ts';
import { STATI, type Stato } from '../condiviso/dominio.ts';
import { ErroreApi, api, useDati } from './api.ts';
import { Elenco } from './Elenco.tsx';
import { quando } from './formati.ts';
import { Vuoto, tono } from './pezzi.tsx';
import { Scartato } from './Scartato.tsx';
import { Scheda } from './Scheda.tsx';

export type Cartella = 'oggi' | 'tutti' | 'scartati' | Stato;
export type Selezione = { tipo: 'contatto' | 'scartato'; id: number } | null;

const TITOLI: Record<'oggi' | 'tutti' | 'scartati', string> = {
  oggi: 'Da fare oggi',
  tutti: 'Tutti i contatti',
  scartati: 'Scartati',
};

export function App() {
  const [cartella, setCartella] = useState<Cartella>('oggi');
  const [selezione, setSelezione] = useState<Selezione>(null);
  const [versione, setVersione] = useState(0);
  const aggiorna = useCallback(() => setVersione((v) => v + 1), []);
  const cartelle = useDati<Cartelle>('/api/cartelle', versione);
  const dialogo = useRef<HTMLDialogElement>(null);
  const indietro = useRef<HTMLButtonElement>(null);
  const partenza = useRef<Element | null>(null);
  const tornaAllaRiga = useRef(false);

  // Nelle finestre strette la scheda prende il posto dell'elenco: il focus la segue, e tornando indietro ritrova la riga.
  useEffect(() => {
    if (selezione) {
      if (indietro.current?.offsetParent) indietro.current.focus();
    } else if (tornaAllaRiga.current) {
      const riga = partenza.current;
      (riga instanceof HTMLElement && riga.isConnected ? riga : document.querySelector<HTMLElement>('.cart.on'))?.focus();
    }
    tornaAllaRiga.current = false;
  }, [selezione]);

  // Ciò che arriva con gli scarichi compare da solo, senza ricaricare la pagina.
  useEffect(() => {
    const giro = setInterval(aggiorna, 30_000);
    return () => clearInterval(giro);
  }, [aggiorna]);

  /** Aprire la scheda segna come visti gli Invii del Contatto. */
  const apriContatto = useCallback(
    (id: number) => {
      partenza.current = document.activeElement;
      setSelezione({ tipo: 'contatto', id });
      api.post(`/api/contatti/${id}/visto`).then(aggiorna, () => {});
    },
    [aggiorna],
  );

  const titolo = (chiave: Cartella) => (chiave === 'oggi' || chiave === 'tutti' || chiave === 'scartati' ? TITOLI[chiave] : chiave);
  const conteggio = (chiave: Cartella) =>
    chiave === 'oggi' || chiave === 'tutti' || chiave === 'scartati' ? cartelle?.[chiave] : cartelle?.stati[chiave];

  const voce = (chiave: Cartella, icona: ReactNode) => {
    const n = conteggio(chiave) ?? 0;
    return (
      <button
        key={chiave}
        className={`cart ${cartella === chiave ? 'on' : ''}`}
        aria-current={cartella === chiave ? 'page' : undefined}
        onClick={() => {
          setCartella(chiave);
          setSelezione(null);
        }}
      >
        {icona}
        {titolo(chiave)}
        <span className={`conta ${chiave === 'oggi' && n > 0 ? 'viva' : ''}`}>{n}</span>
      </button>
    );
  };

  const chiudi = () => setSelezione(null);

  return (
    <div className={`crm ${selezione ? 'con-scheda' : ''}`}>
      <nav className="lato" aria-label="Cartelle">
        <div className="marchio">
          <svg viewBox="0 0 26 26" aria-hidden>
            <rect width="26" height="26" rx="7" fill="var(--verde)" />
            <path d="M16.9 9.4a5.3 5.3 0 1 0 0 7.2" fill="none" stroke="var(--su-verde)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          CRM
        </div>
        <button className="btn pri largo" onClick={() => dialogo.current?.showModal()}>
          <Plus aria-hidden />
          Nuovo contatto
        </button>
        <div className="cartelle">
          {voce('oggi', <ListTodo aria-hidden />)}
          {voce('tutti', <Users aria-hidden />)}
          <div className="sep">Pipeline</div>
          {STATI.map((stato) => voce(stato, <span className={`punto ${tono(stato)}`} />))}
          <div className="sep">Da controllare</div>
          {voce('scartati', <ShieldAlert aria-hidden />)}
        </div>
        <Canali versione={versione} aggiorna={aggiorna} />
      </nav>
      <section className="elenco" aria-label={titolo(cartella)}>
        <Elenco
          key={cartella}
          cartella={cartella}
          titolo={titolo(cartella)}
          conteggio={conteggio(cartella)}
          versione={versione}
          selezione={selezione}
          aggiorna={aggiorna}
          apriContatto={apriContatto}
          apriScartato={(id) => {
            partenza.current = document.activeElement;
            setSelezione({ tipo: 'scartato', id });
          }}
        />
      </section>
      <main className="det">
        {selezione === null ? (
          <Vuoto icona={<UserRound aria-hidden />} titolo="Nessuna scheda aperta">
            Scegli una riga dall'elenco per vedere la scheda.
          </Vuoto>
        ) : (
          <div className="det-dentro">
            <button
              ref={indietro}
              className="btn quieto indietro"
              onClick={() => {
                tornaAllaRiga.current = true;
                chiudi();
              }}
            >
              <ChevronLeft aria-hidden />
              {titolo(cartella)}
            </button>
            {selezione.tipo === 'contatto' && (
              <Scheda key={selezione.id} id={selezione.id} versione={versione} aggiorna={aggiorna} chiudi={chiudi} />
            )}
            {selezione.tipo === 'scartato' && (
              <Scartato
                key={selezione.id}
                id={selezione.id}
                versione={versione}
                aggiorna={aggiorna}
                chiudi={chiudi}
                apriContatto={(id) => {
                  setCartella('tutti');
                  apriContatto(id);
                }}
              />
            )}
          </div>
        )}
      </main>
      <NuovoContatto
        dialogo={dialogo}
        creato={(id) => {
          setCartella('tutti');
          apriContatto(id);
        }}
      />
    </div>
  );
}

/** L'ora dell'ultimo scarico riuscito, lo stato dei due canali e "Scarica ora". */
function Canali({ versione, aggiorna }: { versione: number; aggiorna: () => void }) {
  const letto = useDati<StatoCanali>('/api/canali', versione);
  const [esito, setEsito] = useState<StatoCanali>();
  const [inCorso, setInCorso] = useState(false);
  const [finito, setFinito] = useState<string>();
  const canali = esito ?? letto;

  useEffect(() => setEsito(undefined), [letto]);

  async function scaricaOra() {
    setInCorso(true);
    setFinito(undefined);
    try {
      const stato = await api.post<StatoCanali>('/api/scarico');
      setEsito(stato);
      const avvisi = [stato.ponte, stato.calcom].some((c) => c.stato === 'errore' || c.stato === 'non_configurato');
      setFinito(avvisi ? 'Scarico finito con avvisi' : 'Scarico riuscito');
    } catch {
      setFinito('Scarico non riuscito');
    } finally {
      setInCorso(false);
      aggiorna();
    }
  }

  const avviso = (canale: StatoCanale | undefined) =>
    canale && (canale.stato === 'errore' || canale.stato === 'non_configurato') ? canale.messaggio : null;

  const spia = (nome: string, canale: StatoCanale | undefined) => {
    const [classe, detto] = !canale || canale.stato === 'in_attesa' ? ['spento', 'in attesa'] : canale.stato === 'ok' ? ['', 'attivo'] : ['guasto', 'con un avviso'];
    return (
      <span className={`canale ${classe}`} title={`${nome}: ${detto}`}>
        <i />
        {nome}
        <span className="solo-lettori">: {detto}</span>
      </span>
    );
  };

  return (
    <div className="canali">
      {[avviso(canali?.ponte), avviso(canali?.calcom)].map(
        (messaggio, i) =>
          messaggio && (
            <div key={i} className="avviso" role="status">
              <TriangleAlert aria-hidden />
              <span>{messaggio}</span>
            </div>
          ),
      )}
      <div className="canali-stato">
        {spia('Ponte', canali?.ponte)}
        {spia('Cal.com', canali?.calcom)}
      </div>
      <div className="canali-ora" role="status">
        {finito && !inCorso && `${finito} · `}
        Ultimo scarico: {canali?.ultimoScarico ? quando(canali.ultimoScarico) : 'mai'}
      </div>
      <button className="btn largo" onClick={scaricaOra} disabled={inCorso}>
        <RefreshCw className={inCorso ? 'gira' : ''} aria-hidden />
        {inCorso ? 'Scarico in corso…' : 'Scarica ora'}
      </button>
    </div>
  );
}

function NuovoContatto({
  dialogo,
  creato,
}: {
  dialogo: React.RefObject<HTMLDialogElement | null>;
  creato: (id: number) => void;
}) {
  const [errore, setErrore] = useState<string>();

  async function invia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const modulo = evento.currentTarget;
    try {
      const esito = await api.post<{ contatto: { id: number } }>(
        '/api/contatti',
        Object.fromEntries(new FormData(modulo)),
      );
      // Se l'email esisteva già si apre la scheda esistente.
      creato(esito.contatto.id);
      modulo.reset();
      setErrore(undefined);
      dialogo.current?.close();
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Non riesco a parlare con il CRM.');
    }
  }

  return (
    <dialog ref={dialogo} aria-labelledby="nuovo-contatto">
      <h1 id="nuovo-contatto">Nuovo contatto</h1>
      <p className="sottotitolo">Basta l'email: il resto si può aggiungere dopo.</p>
      <form onSubmit={invia}>
        <div className="modulo">
          <label>
            Email
            <input name="email" autoFocus required inputMode="email" autoComplete="off" placeholder="nome@azienda.it" />
          </label>
          <label>
            Nome
            <input name="nome" autoComplete="off" />
          </label>
          <div className="due">
            <label>
              Telefono
              <input name="telefono" inputMode="tel" autoComplete="off" />
            </label>
            <label>
              Azienda
              <input name="azienda" autoComplete="off" />
            </label>
          </div>
        </div>
        {errore && (
          <div className="errore" role="alert">
            <TriangleAlert aria-hidden />
            {errore}
          </div>
        )}
        <div className="azioni">
          <button type="button" className="btn" onClick={() => dialogo.current?.close()}>
            Annulla
          </button>
          <button className="btn pri">Aggiungi contatto</button>
        </div>
      </form>
    </dialog>
  );
}
