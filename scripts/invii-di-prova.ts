// Scrive nel ponte alcuni invii di prova con la chiave pubblicabile, come farà il sito.
// Uso: pnpm invii-di-prova
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const radice = join(import.meta.dirname, '..');
if (existsSync(join(radice, '.env'))) process.loadEnvFile(join(radice, '.env'));

const url = process.env.SUPABASE_URL?.trim();
const chiave = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
if (!url || !chiave) {
  console.error('Nel file .env servono SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}

const base = {
  versione: 1,
  privacy_accettata: true,
  privacy_versione: '2026-09-01',
};
const contatto = {
  ...base,
  tipo: 'contatto',
  pagina: 'https://sito.example/contatti',
};
const leadMagnet = {
  ...base,
  tipo: 'lead_magnet',
  pagina: 'https://sito.example/guida',
  risorsa: 'guida-automazione-studio',
};

const invii: [descrizione: string, riga: Record<string, unknown>][] = [
  [
    'form di contatto, valido',
    {
      ...contatto,
      email: 'mario@studiorossi.example',
      nome: 'Mario Rossi',
      azienda: 'Studio Rossi',
      messaggio: 'Vorrei un preventivo per automatizzare le fatture.',
      come_mi_hai_conosciuto: 'LinkedIn',
    },
  ],
  ['lead magnet, valido', { ...leadMagnet, email: 'sara@nerifoto.example', nome: 'Sara Neri', come_mi_hai_conosciuto: 'Instagram' }],
  [
    'stessa email del primo con maiuscole diverse, valido',
    { ...leadMagnet, email: 'MARIO@StudioRossi.example', nome: 'M. Rossi', telefono: '02 555 0140' },
  ],
  [
    'NON valido: campo trappola compilato',
    { ...contatto, email: 'promo@seo-best.example', messaggio: 'Aumenta le visite del tuo sito del 300%...', trappola: 'http://spam.example' },
  ],
  ['NON valido: email malformata', { ...leadMagnet, email: 'franca.moretti@', nome: 'Franca Moretti' }],
  ['NON valido: tipo sconosciuto', { ...contatto, tipo: 'newsletter', email: 'paolo.gallo@posta.example', messaggio: 'Iscrivimi.' }],
  ['NON valido: privacy non accettata', { ...contatto, email: 'anna.greco@grecolab.example', messaggio: 'Ciao!', privacy_accettata: false }],
  ['NON valido: form di contatto senza messaggio', { ...contatto, email: 'elena@contiarchitetti.example', nome: 'Elena Conti' }],
];

let falliti = 0;
for (const [descrizione, riga] of invii) {
  const risposta = await fetch(new URL('/rest/v1/ponte', url), {
    method: 'POST',
    headers: {
      apikey: chiave,
      authorization: `Bearer ${chiave}`,
      'content-type': 'application/json',
      // Con la chiave pubblicabile si può solo inserire: non si chiede indietro la riga.
      prefer: 'return=minimal',
    },
    body: JSON.stringify(riga),
  });
  if (risposta.ok) {
    console.log(`✓ ${descrizione}`);
  } else {
    falliti++;
    console.error(`✗ ${descrizione}: ${risposta.status} ${await risposta.text()}`);
  }
}

console.log(
  falliti === 0
    ? '\nFatto. Premi "Scarica ora" nel CRM: tre Invii su due Contatti, cinque Scartati.'
    : `\n${falliti} invii non sono stati accettati dal ponte.`,
);
process.exit(falliti === 0 ? 0 : 1);
