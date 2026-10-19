// Date e ore sono mostrate nell'ora locale del Mac.
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const due = (n: number) => String(n).padStart(2, '0');

function giornoDi(data: Date): string {
  const oggi = new Date();
  if (data.toDateString() === oggi.toDateString()) return 'oggi';
  const anno = data.getFullYear() === oggi.getFullYear() ? '' : ` ${data.getFullYear()}`;
  return `${data.getDate()} ${MESI[data.getMonth()]}${anno}`;
}

/** Un giorno senza ora (`AAAA-MM-GG`): "oggi" oppure "4 ott". */
export function giorno(aaaaMmGg: string): string {
  const [anno, mese, giornoDelMese] = aaaaMmGg.split('-').map(Number);
  return giornoDi(new Date(anno!, mese! - 1, giornoDelMese));
}

export function ora(iso: string): string {
  const data = new Date(iso);
  return `${due(data.getHours())}:${due(data.getMinutes())}`;
}

/** Data e ora: "oggi, 12:10" oppure "4 ott, 12:10". */
export function quando(iso: string): string {
  return `${giornoDi(new Date(iso))}, ${ora(iso)}`;
}

/** Per gli elenchi: solo l'ora se è oggi ("12:10"), altrimenti solo il giorno ("4 ott"). */
export function breve(iso: string): string {
  const giornoScritto = giornoDi(new Date(iso));
  return giornoScritto === 'oggi' ? ora(iso) : giornoScritto;
}

export function oggiAaaaMmGg(): string {
  const d = new Date();
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}
