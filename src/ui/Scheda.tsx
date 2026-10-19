import {
  ArrowRight,
  ArrowRightLeft,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Check,
  CircleCheck,
  Download,
  Inbox,
  NotebookPen,
  Plus,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PromemoriaAperto, Scheda as DatiScheda, VoceStorico } from '../condiviso/api.ts';
import { NOME_PUNTO_DI_INGRESSO, STATI } from '../condiviso/dominio.ts';
import { ErroreApi, api, useDati } from './api.ts';
import { giorno, oggiAaaaMmGg, quando } from './formati.ts';
import { Avatar, Badge, Conferma, tono } from './pezzi.tsx';

interface Props {
  id: number;
  versione: number;
  aggiorna: () => void;
  chiudi: () => void;
}

export function Scheda({ id, versione, aggiorna, chiudi }: Props) {
  const scheda = useDati<DatiScheda>(`/api/contatti/${id}`, versione);
  const [errore, setErrore] = useState<string>();
  const [salvato, setSalvato] = useState(false);
  const spegniSalvato = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(spegniSalvato.current), []);
  if (!scheda) return null;

  /** Fa una modifica, poi rilegge tutto; un rifiuto del CRM diventa un messaggio in testa alla scheda. */
  async function fai(modifica: () => Promise<unknown>): Promise<boolean> {
    let riuscita = true;
    try {
      await modifica();
      setErrore(undefined);
    } catch (e) {
      riuscita = false;
      setErrore(e instanceof ErroreApi ? e.message : 'Non riesco a parlare con il CRM.');
    }
    aggiorna();
    return riuscita;
  }

  /** I campi si salvano da soli: un "Salvato" che compare per un attimo lo conferma. */
  async function salvaCampo(nome: string, valore: string) {
    clearTimeout(spegniSalvato.current);
    setSalvato(false);
    const riuscito = await fai(() => api.patch(`/api/contatti/${id}`, { [nome]: valore }));
    // Un rifiuto spegne "Salvato" anche se nel frattempo un altro campo è stato salvato.
    clearTimeout(spegniSalvato.current);
    setSalvato(riuscito);
    if (!riuscito) return;
    spegniSalvato.current = setTimeout(() => setSalvato(false), 1800);
  }

  async function elimina() {
    await api.delete(`/api/contatti/${id}`);
    chiudi();
    aggiorna();
  }

  const campo = (nome: 'nome' | 'email' | 'telefono' | 'azienda', etichetta: string) => (
    <>
      <label htmlFor={nome}>{etichetta}</label>
      <Campo id={nome} valore={scheda[nome] ?? ''} salva={(valore) => salvaCampo(nome, valore)} />
    </>
  );

  return (
    <>
      <div className="testa">
        <Avatar nome={scheda.nome ?? scheda.email} grande />
        <div>
          <h1>{scheda.nome ?? scheda.email}</h1>
          <div className="meta">{[scheda.azienda, scheda.nome && scheda.email].filter(Boolean).join(' · ')}</div>
        </div>
      </div>

      <div className="stati" role="radiogroup" aria-label="Stato">
        {STATI.map((stato) => (
          <button
            key={stato}
            role="radio"
            aria-checked={scheda.stato === stato}
            className={tono(stato)}
            onClick={() => scheda.stato !== stato && fai(() => api.put(`/api/contatti/${id}/stato`, { stato }))}
          >
            <span className="punto" />
            {stato}
          </button>
        ))}
      </div>

      {errore && (
        <div className="errore" role="alert">
          <TriangleAlert aria-hidden />
          {errore}
        </div>
      )}

      <div className="corpo">
        <div className="fianco">
          <section className="sezione">
            <h2>
              Dettagli
              {salvato && (
                <span className="salvato" role="status">
                  <Check aria-hidden />
                  Salvato
                </span>
              )}
            </h2>
            <div className="dati">
              {campo('nome', 'Nome')}
              {campo('email', 'Email')}
              {campo('telefono', 'Telefono')}
              {campo('azienda', 'Azienda')}
            </div>
            <div className="dati fermi">
              <span>Arrivato da</span>
              <span className="valore">
                {scheda.arrivatoDa === 'a_mano' ? 'Aggiunto a mano' : NOME_PUNTO_DI_INGRESSO[scheda.arrivatoDa]}
              </span>
              {scheda.comeMiHaConosciuto && (
                <>
                  <span>Come mi ha conosciuto</span>
                  <span className="valore">{scheda.comeMiHaConosciuto}</span>
                </>
              )}
              <span>Nel CRM dal</span>
              <span className="valore">{quando(scheda.creatoIl)}</span>
            </div>
          </section>
        </div>

        <div className="principale">
          <section className="sezione">
            <h2>Promemoria</h2>
            {scheda.promemoria.map((p) => (
              <RigaPromemoria key={p.id} promemoria={p} fai={fai} />
            ))}
            <Modulo className="pro nuovo" invia={(dati) => fai(() => api.post(`/api/contatti/${id}/promemoria`, dati))}>
              <Plus aria-hidden />
              <input
                type="text"
                className="quieto"
                name="testo"
                placeholder="Aggiungi un promemoria"
                aria-label="Cosa devi fare?"
                autoComplete="off"
                required
              />
              <input type="date" name="giorno" aria-label="Giorno" defaultValue={oggiAaaaMmGg()} required />
              <button className="btn">Aggiungi</button>
            </Modulo>
          </section>

          <section className="sezione">
            <h2>Nuova nota</h2>
            <Modulo className="componi" invia={(dati) => fai(() => api.post(`/api/contatti/${id}/note`, dati))}>
              <textarea
                name="testo"
                placeholder="Scrivi una nota…"
                aria-label="Nuova nota"
                required
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && e.currentTarget.form?.requestSubmit()}
              />
              <div className="barra">
                <span aria-hidden>⌘ Invio</span>
                <button className="btn pri">Salva nota</button>
              </div>
            </Modulo>
          </section>

          <section className="sezione">
            <h2>Storico</h2>
            {scheda.storico.map((voce, i) => (
              <Voce key={`${voce.tipo}-${voce.quando}-${i}`} voce={voce} fai={fai} />
            ))}
            {scheda.storico.length === 0 && <div className="q">Ancora niente: note, cambi di Stato e arrivi compaiono qui.</div>}
          </section>
        </div>

        <div className="piede">
          <a className="btn quieto" href={`/api/contatti/${id}/esporta`} download>
            <Download aria-hidden />
            Esporta dati
          </a>
          <Conferma
            domanda="Eliminare il contatto e tutto ciò che gli è legato (Invii, Prenotazioni, Note, Promemoria, Storico)? Ricorda di cancellare la persona anche da Cal.com, a mano."
            si="Sì, elimina"
            esegui={elimina}
          >
            {(apri) => (
              <button className="btn quieto pericolo" onClick={apri}>
                <Trash2 aria-hidden />
                Elimina contatto
              </button>
            )}
          </Conferma>
        </div>
      </div>
    </>
  );
}

type Fai = (modifica: () => Promise<unknown>) => Promise<boolean>;

/** Un campo che si salva da solo quando lo si lascia, se è cambiato. */
function Campo({
  id,
  valore,
  salva,
  etichetta,
}: {
  id: string;
  valore: string;
  salva: (valore: string) => void;
  etichetta?: string;
}) {
  const [testo, setTesto] = useState(valore);
  useEffect(() => setTesto(valore), [valore]);
  return (
    <input
      id={id}
      className="quieto"
      value={testo}
      placeholder="Aggiungi"
      aria-label={etichetta}
      autoComplete="off"
      onChange={(e) => setTesto(e.target.value)}
      onBlur={() => testo !== valore && salva(testo)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

/** Un modulo che si svuota dopo l'invio, se è andato a buon fine. */
function Modulo({
  invia,
  className,
  children,
}: {
  invia: (dati: Record<string, FormDataEntryValue>) => Promise<boolean>;
  className?: string;
  children: React.ReactNode;
}) {
  async function quandoInviato(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const modulo = evento.currentTarget;
    if (await invia(Object.fromEntries(new FormData(modulo)))) modulo.reset();
  }
  return (
    <form className={className} onSubmit={quandoInviato}>
      {children}
    </form>
  );
}

function RigaPromemoria({ promemoria: p, fai }: { promemoria: PromemoriaAperto; fai: Fai }) {
  const percorso = `/api/promemoria/${p.id}`;
  const scaduto = p.giorno < oggiAaaaMmGg();
  return (
    <div className="pro">
      <button
        className="spunta"
        title="Segna come fatto"
        aria-label={`Segna come fatto: ${p.testo}`}
        onClick={() => fai(() => api.patch(percorso, { fatto: true }))}
      >
        <Check aria-hidden />
      </button>
      <Campo
        id={`promemoria-${p.id}`}
        etichetta="Promemoria"
        valore={p.testo}
        salva={(testo) => fai(() => api.patch(percorso, { testo }))}
      />
      <input
        type="date"
        className={`quieto ${scaduto ? 'tardi' : ''}`}
        value={p.giorno}
        aria-label="Giorno"
        title={scaduto ? `Scaduto il ${giorno(p.giorno)}` : 'Sposta a un altro giorno'}
        onChange={(e) => e.target.value && fai(() => api.patch(percorso, { giorno: e.target.value }))}
      />
      <button
        className="btn quieto icona"
        title="Cancella il promemoria"
        aria-label={`Cancella il promemoria: ${p.testo}`}
        onClick={() => fai(() => api.delete(percorso))}
      >
        <X aria-hidden />
      </button>
    </div>
  );
}

const ICONE: Record<VoceStorico['tipo'], [icona: LucideIcon, classe: string]> = {
  invio: [Inbox, 'arrivo'],
  stato: [ArrowRightLeft, ''],
  nota: [NotebookPen, ''],
  promemoria: [CircleCheck, ''],
  prenotazione: [CalendarCheck, 'arrivo'],
  spostamento: [CalendarClock, ''],
  annullamento: [CalendarX, 'annullo'],
};

function Voce({ voce, fai }: { voce: VoceStorico; fai: Fai }) {
  const [modifica, setModifica] = useState(false);
  const [Icona, classe] = ICONE[voce.tipo];

  let cosa: React.ReactNode;
  let sotto: React.ReactNode = null;
  switch (voce.tipo) {
    case 'stato':
      cosa = (
        <span className="cambio">
          <Badge stato={voce.da} />
          <ArrowRight aria-label="diventa" />
          <Badge stato={voce.a} />
        </span>
      );
      break;
    case 'promemoria':
      cosa = (
        <>
          <b>Promemoria fatto</b>: {voce.testo}
        </>
      );
      break;
    case 'prenotazione':
      cosa = (
        <>
          <b>Call prenotata</b> per {quando(voce.inizio)}
        </>
      );
      break;
    case 'spostamento':
      cosa = (
        <>
          <b>Call spostata</b> da {quando(voce.da)} a {quando(voce.a)}
        </>
      );
      break;
    case 'annullamento':
      cosa = <b>Call annullata</b>;
      sotto = voce.motivo && <div className="citazione">{voce.motivo}</div>;
      break;
    case 'invio': {
      const contenuto = voce.messaggio ?? voce.risorsa;
      const dettagli = [
        voce.comeMiHaiConosciuto && `Come mi hai conosciuto: ${voce.comeMiHaiConosciuto}`,
        [voce.nome, voce.email, voce.telefono, voce.azienda].filter(Boolean).join(' · '),
        voce.pagina && `Pagina: ${voce.pagina}`,
        voce.privacyVersione && `Informativa accettata: ${voce.privacyVersione}`,
      ].filter(Boolean);
      cosa = <b>{NOME_PUNTO_DI_INGRESSO[voce.puntoDiIngresso]}</b>;
      sotto = (
        <>
          {contenuto && <div className="citazione">{contenuto}</div>}
          <div className="dettagli">
            {dettagli.map((riga) => (
              <div key={String(riga)} className="q">
                {riga}
              </div>
            ))}
          </div>
        </>
      );
      break;
    }
    case 'nota':
      cosa = <b>Nota</b>;
      sotto = modifica ? (
        <Modulo
          invia={async (dati) => {
            const riuscita = await fai(() => api.patch(`/api/note/${voce.id}`, dati));
            if (riuscita) setModifica(false);
            return riuscita;
          }}
        >
          <textarea name="testo" defaultValue={voce.testo} aria-label="Testo della nota" required autoFocus />
          <div className="azioni">
            <button className="btn pri">Salva</button>
            <button type="button" className="btn" onClick={() => setModifica(false)}>
              Annulla
            </button>
          </div>
        </Modulo>
      ) : (
        <>
          <div className="foglio">{voce.testo}</div>
          <div className="azioni-nota">
            <button className="testo-link" onClick={() => setModifica(true)}>
              Modifica
            </button>
            <Conferma
              piccola
              domanda="Cancellare questa nota?"
              si="Sì, cancella"
              esegui={() => fai(() => api.delete(`/api/note/${voce.id}`))}
            >
              {(apri) => (
                <button className="testo-link" onClick={apri}>
                  Cancella
                </button>
              )}
            </Conferma>
          </div>
        </>
      );
      break;
  }

  return (
    <div className="ev">
      <span className={`ico ${classe}`}>
        <Icona aria-hidden />
      </span>
      <div>
        <div className="riga-1">
          <span className="cosa">{cosa}</span>
          <time dateTime={voce.quando}>{quando(voce.quando)}</time>
        </div>
        {sotto}
      </div>
    </div>
  );
}
