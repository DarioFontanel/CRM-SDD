import { ShieldAlert, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { DettaglioScartato } from '../condiviso/api.ts';
import { NOME_PUNTO_DI_INGRESSO, isPuntoDiIngresso } from '../condiviso/dominio.ts';
import { ErroreApi, api, useDati } from './api.ts';
import { quando } from './formati.ts';

interface Props {
  id: number;
  versione: number;
  aggiorna: () => void;
  chiudi: () => void;
  apriContatto: (id: number) => void;
}

export function Scartato({ id, versione, aggiorna, chiudi, apriContatto }: Props) {
  const s = useDati<DettaglioScartato>(`/api/scartati/${id}`, versione);
  const [correzione, setCorrezione] = useState<string>();
  const [errore, setErrore] = useState<string>();
  if (!s) return null;

  async function recupera() {
    try {
      const esito = await api.post<{ contattoId: number }>(`/api/scartati/${id}/recupera`, { email: correzione });
      aggiorna();
      apriContatto(esito.contattoId);
    } catch (e) {
      if (e instanceof ErroreApi && e.corpo.codice === 'email_non_valida') setCorrezione((c) => c ?? s?.email ?? '');
      setErrore(e instanceof ErroreApi ? e.message : 'Non riesco a parlare con il CRM.');
    }
  }

  async function elimina() {
    await api.delete(`/api/scartati/${id}`);
    chiudi();
    aggiorna();
  }

  return (
    <>
      <div className="testa">
        <span className="tessera ambra grande">
          <ShieldAlert aria-hidden />
        </span>
        <div>
          <h1>{s.email ?? 'Senza email'}</h1>
          <div className="meta">Scartato · {quando(s.quando)}</div>
        </div>
      </div>

      <section className="sezione scartato">
        <div className="dati fermi">
          <span>Motivo</span>
          <b className="valore">{s.motivo}</b>
          <span>Tipo</span>
          <span className="valore">{isPuntoDiIngresso(s.tipo) ? NOME_PUNTO_DI_INGRESSO[s.tipo] : (s.tipo ?? '—')}</span>
          <span>Email</span>
          <span className="valore">{s.email ?? '—'}</span>
          <span>Contenuto</span>
          <span className="valore lungo">{s.contenuto ?? '—'}</span>
        </div>
        {correzione !== undefined && (
          <div className="dati">
            <label htmlFor="correzione">Email corretta</label>
            <input id="correzione" value={correzione} onChange={(e) => setCorrezione(e.target.value)} autoFocus />
          </div>
        )}
        {errore && (
          <div className="errore" role="alert">
            <TriangleAlert aria-hidden />
            {errore}
          </div>
        )}
        <div className="azioni">
          <button className="btn pri" onClick={recupera}>
            Recupera come contatto
          </button>
          <button className="btn" onClick={elimina}>
            Elimina
          </button>
        </div>
      </section>
    </>
  );
}
