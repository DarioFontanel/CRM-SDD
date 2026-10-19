import { CalendarClock, Check, CircleCheck, Download, Search, ShieldAlert, TriangleAlert, Users } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { Oggi, RigaContatto, RigaPromemoriaOggi, RigaScartato, SezioneOggi } from '../condiviso/api.ts';
import { NOME_PUNTO_DI_INGRESSO, PUNTI_DI_INGRESSO, type Stato } from '../condiviso/dominio.ts';
import type { Cartella, Selezione } from './App.tsx';
import { ErroreApi, api, useDati } from './api.ts';
import { breve, giorno, ora } from './formati.ts';
import { Avatar, Badge, Vuoto } from './pezzi.tsx';

interface Props {
  cartella: Cartella;
  titolo: string;
  conteggio: number | undefined;
  versione: number;
  selezione: Selezione;
  aggiorna: () => void;
  apriContatto: (id: number) => void;
  apriScartato: (id: number) => void;
}

export function Elenco(props: Props) {
  if (props.cartella === 'oggi') return <DaFareOggi {...props} />;
  if (props.cartella === 'scartati') return <Scartati {...props} />;
  return <Contatti {...props} stato={props.cartella === 'tutti' ? undefined : props.cartella} />;
}

function Testa({ titolo, conteggio, children }: { titolo: string; conteggio: number | undefined; children?: ReactNode }) {
  return (
    <div className="elenco-titolo">
      <h1>{titolo}</h1>
      {conteggio !== undefined && conteggio > 0 && <span className="conta">{conteggio}</span>}
      {children}
    </div>
  );
}

const Scheletri = () => (
  <div className="scheletri" aria-hidden>
    <div className="scheletro" />
    <div className="scheletro" />
    <div className="scheletro" />
  </div>
);

/** Una riga dell'elenco: a sinistra un segno, poi due righe di testo. */
function Voce({
  on,
  nuova,
  apri,
  prima,
  segno,
  nome,
  ora,
  oraForte,
  children,
}: {
  on: boolean;
  nuova?: boolean;
  apri: () => void;
  /** Un controllo a sé, fuori dal pulsante che apre la scheda (la spunta di un Promemoria). */
  prima?: ReactNode;
  segno?: ReactNode;
  nome: ReactNode;
  ora?: string;
  oraForte?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`voce ${on ? 'on' : ''} ${nuova ? 'nuova' : ''}`}>
      {prima}
      <button className="voce-apri" onClick={apri} aria-current={on ? 'true' : undefined}>
        {segno}
        <span className="scritto">
          <span className="r1">
            {nuova && (
              <span className="non-visto" title="Invio non visto">
                <span className="solo-lettori">Non visto</span>
              </span>
            )}
            <span className="nome">{nome}</span>
            {ora && <span className={`ora ${oraForte ? 'forte' : ''}`}>{ora}</span>}
          </span>
          <span className="r2">{children}</span>
        </span>
      </button>
    </div>
  );
}

const TITOLI: Record<SezioneOggi['chiave'], string> = {
  promemoria_scaduti: 'Promemoria scaduti',
  promemoria_di_oggi: 'Promemoria di oggi',
  call_di_oggi: 'Call di oggi',
  nuovi_arrivi: 'Nuovi arrivi',
};

function DaFareOggi({ titolo, conteggio, versione, selezione, aggiorna, apriContatto }: Props) {
  const oggi = useDati<Oggi>('/api/oggi', versione);
  const [errore, setErrore] = useState<string>();
  const aperto = (contattoId: number) => selezione?.tipo === 'contatto' && selezione.id === contattoId;

  const promemoria = (p: RigaPromemoriaOggi, scaduto: boolean) => (
    <Voce
      key={`p${p.id}`}
      on={aperto(p.contattoId)}
      apri={() => apriContatto(p.contattoId)}
      prima={
        <button
          className="spunta"
          title="Segna come fatto"
          aria-label={`Segna come fatto: ${p.testo}`}
          onClick={() =>
            api
              .patch(`/api/promemoria/${p.id}`, { fatto: true })
              .then(
                () => setErrore(undefined),
                (e) => setErrore(e instanceof ErroreApi ? e.message : 'Non riesco a parlare con il CRM.'),
              )
              .finally(aggiorna)
          }
        >
          <Check aria-hidden />
        </button>
      }
      nome={p.testo}
    >
      <span className="sotto">
        {p.contatto}
        {scaduto && <span className="tardi"> · scaduto il {giorno(p.giorno)}</span>}
      </span>
    </Voce>
  );

  return (
    <>
      <div className="elenco-testa">
        <Testa titolo={titolo} conteggio={conteggio} />
      </div>
      <div className="elenco-corpo">
        {errore && (
          <div className="errore" role="alert">
            <TriangleAlert aria-hidden />
            {errore}
          </div>
        )}
        {!oggi && <Scheletri />}
        {oggi?.sezioni.length === 0 && (
          <Vuoto icona={<CircleCheck aria-hidden />} titolo="Niente da fare oggi">
            Promemoria, call e nuovi arrivi compaiono qui.
          </Vuoto>
        )}
        {oggi?.sezioni.map((sezione) => (
          <div key={sezione.chiave}>
            <div className={`gruppo ${sezione.chiave === 'promemoria_scaduti' ? 'tardi' : ''}`}>
              {TITOLI[sezione.chiave]}
              <span className="numeri">{sezione.righe.length}</span>
            </div>
            {sezione.chiave === 'promemoria_scaduti' && sezione.righe.map((p) => promemoria(p, true))}
            {sezione.chiave === 'promemoria_di_oggi' && sezione.righe.map((p) => promemoria(p, false))}
            {sezione.chiave === 'call_di_oggi' &&
              sezione.righe.map((c) => (
                <Voce
                  key={`c${c.contattoId}${c.inizio}`}
                  on={aperto(c.contattoId)}
                  apri={() => apriContatto(c.contattoId)}
                  segno={
                    <span className="tessera">
                      <CalendarClock aria-hidden />
                    </span>
                  }
                  nome={c.contatto}
                  ora={ora(c.inizio)}
                  oraForte
                >
                  <span className="sotto">Call {c.stato}</span>
                </Voce>
              ))}
            {sezione.chiave === 'nuovi_arrivi' &&
              sezione.righe.map((n) => (
                <Voce
                  key={`n${n.contattoId}`}
                  on={aperto(n.contattoId)}
                  nuova
                  apri={() => apriContatto(n.contattoId)}
                  segno={<Avatar nome={n.contatto} />}
                  nome={n.contatto}
                  ora={breve(n.quando)}
                >
                  <span className="sotto due-righe">
                    {NOME_PUNTO_DI_INGRESSO[n.puntoDiIngresso]}
                    {n.anteprima && `: ${n.anteprima}`}
                  </span>
                </Voce>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}

function Contatti({ titolo, conteggio, stato, versione, selezione, apriContatto }: Props & { stato: Stato | undefined }) {
  const [q, setQ] = useState('');
  const [ingresso, setIngresso] = useState('');
  const parametri = new URLSearchParams();
  if (stato) parametri.set('stato', stato);
  if (q) parametri.set('q', q);
  if (ingresso) parametri.set('ingresso', ingresso);
  const letti = useDati<{ contatti: RigaContatto[] }>(`/api/contatti?${parametri}`, versione);
  // Mentre arriva la risposta a una nuova ricerca resta in vista l'elenco di prima; se tarda, una riga lo dice.
  const ultimi = useRef(letti);
  if (letti) ultimi.current = letti;
  const dati = letti ?? ultimi.current;
  const filtrato = q !== '' || ingresso !== '';

  return (
    <>
      <div className="elenco-testa">
        <Testa titolo={titolo} conteggio={conteggio}>
          {!stato && (
            <a className="btn quieto" href="/api/esporta/contatti.csv" download>
              <Download aria-hidden />
              Esporta CSV
            </a>
          )}
        </Testa>
        <div className="strumenti">
          <label className="cerca">
            <Search aria-hidden />
            <input
              type="search"
              placeholder="Cerca"
              aria-label="Cerca per nome, email o azienda"
              title="Cerca per nome, email o azienda"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <select value={ingresso} onChange={(e) => setIngresso(e.target.value)} aria-label="Punto di ingresso">
            <option value="">Tutti gli ingressi</option>
            {PUNTI_DI_INGRESSO.map((punto) => (
              <option key={punto} value={punto}>
                {NOME_PUNTO_DI_INGRESSO[punto]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="elenco-corpo" aria-busy={!letti}>
        {!letti && dati && (
          <div className="attesa" role="status">
            Aspetto la risposta del CRM: qui sotto c'è ancora l'elenco di prima.
          </div>
        )}
        {!dati && <Scheletri />}
        {dati?.contatti.map((c) => (
          <Voce
            key={c.id}
            on={selezione?.tipo === 'contatto' && selezione.id === c.id}
            nuova={c.nonVisto}
            apri={() => apriContatto(c.id)}
            segno={<Avatar nome={c.nome ?? c.email} />}
            nome={c.nome ?? c.email}
            ora={breve(c.ultimaAttivita)}
          >
            <span className="sotto">{c.azienda ?? (c.nome ? c.email : 'Senza nome')}</span>
            {!stato && <Badge stato={c.stato} />}
          </Voce>
        ))}
        {dati?.contatti.length === 0 &&
          (filtrato ? (
            <Vuoto icona={<Search aria-hidden />} titolo="Nessun contatto trovato">
              Prova con un'altra parola o togli il filtro.
            </Vuoto>
          ) : (
            <Vuoto icona={<Users aria-hidden />} titolo="Nessun contatto">
              {stato
                ? `Qui compaiono i contatti nello Stato ${stato}.`
                : 'Aggiungine uno con Nuovo contatto, oppure aspetta il primo arrivo dal sito.'}
            </Vuoto>
          ))}
      </div>
    </>
  );
}

function Scartati({ titolo, conteggio, versione, selezione, apriScartato }: Props) {
  const dati = useDati<{ scartati: RigaScartato[] }>('/api/scartati', versione);
  return (
    <>
      <div className="elenco-testa">
        <Testa titolo={titolo} conteggio={conteggio} />
      </div>
      <div className="elenco-corpo">
        {!dati && <Scheletri />}
        {dati?.scartati.length === 0 && (
          <Vuoto icona={<ShieldAlert aria-hidden />} titolo="Nessuno Scartato">
            Qui finiscono gli arrivi sospetti o malformati, da controllare.
          </Vuoto>
        )}
        {dati?.scartati.map((s) => (
          <Voce
            key={s.id}
            on={selezione?.tipo === 'scartato' && selezione.id === s.id}
            apri={() => apriScartato(s.id)}
            segno={
              <span className="tessera ambra">
                <ShieldAlert aria-hidden />
              </span>
            }
            nome={s.email ?? '(senza email)'}
            ora={breve(s.quando)}
          >
            <span className="sotto">{s.motivo}</span>
          </Voce>
        ))}
      </div>
    </>
  );
}
