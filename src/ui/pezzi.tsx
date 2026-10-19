import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { STATI, type Stato } from '../condiviso/dominio.ts';

export const tono = (stato: Stato) => `tono-${STATI.indexOf(stato)}`;

export const Badge = ({ stato }: { stato: Stato }) => (
  <span className={`stato ${tono(stato)}`}>
    <span className="punto" />
    {stato}
  </span>
);

const TINTE = [160, 95, 45, 250, 310, 205];

/** Le iniziali della persona, dal nome o dall'email. */
export function Avatar({ nome, grande }: { nome: string; grande?: boolean }) {
  const parole = nome.split('@')[0]!.split(/[\s._-]+/).filter(Boolean);
  const iniziali = `${parole[0]?.[0] ?? '?'}${parole[1]?.[0] ?? ''}`.toUpperCase();
  const tinta = TINTE[[...nome].reduce((somma, lettera) => somma + lettera.charCodeAt(0), 0) % TINTE.length];
  return (
    <span className={`avatar ${grande ? 'grande' : ''}`} style={{ '--h': tinta } as CSSProperties} aria-hidden>
      {iniziali}
    </span>
  );
}

export function Vuoto({ icona, titolo, children }: { icona: ReactNode; titolo: string; children?: ReactNode }) {
  return (
    <div className="vuoto">
      <span className="tondo">{icona}</span>
      <b>{titolo}</b>
      {children && <p>{children}</p>}
    </div>
  );
}

/** Un'azione che non si può annullare: il primo clic chiede conferma sul posto, il secondo la esegue. */
export function Conferma({
  domanda,
  si,
  esegui,
  piccola,
  children,
}: {
  domanda: ReactNode;
  si: string;
  esegui: () => void;
  piccola?: boolean;
  children: (apri: () => void) => ReactNode;
}) {
  const [aperta, setAperta] = useState(false);
  const ancora = useRef<HTMLSpanElement>(null);
  const eraAperta = useRef(false);
  // Quando la conferma si chiude il focus torna sul comando da cui si era partiti, se c'è ancora.
  useEffect(() => {
    if (!aperta && eraAperta.current) ancora.current?.querySelector('button')?.focus();
    eraAperta.current = aperta;
  }, [aperta]);
  if (!aperta) {
    return (
      <span ref={ancora} className="ancora">
        {children(() => setAperta(true))}
      </span>
    );
  }
  const bottoni = (
    <>
      <button
        className={piccola ? 'testo-link' : 'btn pericolo pieno'}
        autoFocus
        onClick={() => {
          setAperta(false);
          esegui();
        }}
      >
        {si}
      </button>
      <button className={piccola ? 'testo-link' : 'btn'} onClick={() => setAperta(false)}>
        Annulla
      </button>
    </>
  );
  return (
    <div className={`conferma ${piccola ? 'piccola' : ''}`} role="group">
      <span>{domanda}</span>
      {piccola ? bottoni : <div className="azioni">{bottoni}</div>}
    </div>
  );
}
