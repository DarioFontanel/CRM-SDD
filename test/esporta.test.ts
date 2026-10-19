import { sql } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { calcomDaAmbiente } from '../src/server/calcom.ts';
import { creaCrmDiProva, rigaContatto } from './aiuti.ts';
import esempioCalcom from './fixtures/calcom/nuova.json' with { type: 'json' };

test('Esporta CSV scarica una riga per Contatto, anche con virgole, virgolette, a capo e accenti nei campi', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto({ nome: 'Niccolò "Nico" Rossi', azienda: 'Rossi, Bianchi & C.\nStudio associato' }), '2026-10-04T07:41:00Z');
  await crm.scarica();
  await crm.post('/api/contatti', { email: 'marco@rivaconsulting.example', nome: 'Marco Riva', telefono: '+39 335 555 0190' });

  const risposta = await crm.get('/api/esporta/contatti.csv?q=nessuno&stato=Perso');

  expect(risposta.status).toBe(200);
  expect(risposta.headers.get('content-type')).toContain('text/csv');
  expect(risposta.headers.get('content-disposition')).toContain('attachment');
  expect(risposta.testo).toBe(
    'nome,email,telefono,azienda,stato,primo_invio\r\n' +
      'Marco Riva,marco@rivaconsulting.example,+39 335 555 0190,,Nuovo,\r\n' +
      '"Niccolò ""Nico"" Rossi",mario@studiorossi.example,,"Rossi, Bianchi & C.\nStudio associato",Nuovo,2026-10-04 09:41\r\n',
  );
});

test('una cella che un foglio di calcolo leggerebbe come formula viene resa innocua', async () => {
  const crm = creaCrmDiProva();
  await crm.post('/api/contatti', { email: 'x@spam.example', nome: '=HYPERLINK("http://spam.example")' });

  const { testo } = await crm.get('/api/esporta/contatti.csv');

  expect(testo).toContain(`"'=HYPERLINK(""http://spam.example"")",x@spam.example`);
});

async function crmConUnaPersona() {
  // Cal.com restituisce la prenotazione al primo scarico; poi non ha più niente di cambiato.
  let primoScarico = true;
  const crm = creaCrmDiProva({
    calcom: calcomDaAmbiente({ CALCOM_API_KEY: 'x' }, async () => {
      const risposta = Response.json(primoScarico ? esempioCalcom : { status: 'success', data: [] });
      primoScarico = false;
      return risposta;
    }),
  });
  crm.ponte.aggiungi(rigaContatto({ email: 'elena@contiarchitetti.example', nome: 'Elena Conti' }), '2026-10-03T07:41:00Z');
  await crm.scarica();
  const { id } = await crm.schedaDi('elena@contiarchitetti.example');
  await crm.put(`/api/contatti/${id}/stato`, { stato: 'Contattato' });
  await crm.post(`/api/contatti/${id}/note`, { testo: 'Sentita al telefono.' });
  await crm.post(`/api/contatti/${id}/promemoria`, { testo: 'Mandare il preventivo', giorno: '2026-10-06' });
  return { crm, id };
}

test('Esporta dati scarica un file con scheda, Invii, Prenotazioni, Note e Storico della persona', async () => {
  const { crm, id } = await crmConUnaPersona();

  const risposta = await crm.get(`/api/contatti/${id}/esporta`);

  expect(risposta.headers.get('content-disposition')).toContain('attachment');
  expect(risposta.json.contatto).toMatchObject({ email: 'elena@contiarchitetti.example', nome: 'Elena Conti', stato: 'Contattato' });
  expect(risposta.json.invii).toEqual([
    expect.objectContaining({
      puntoDiIngresso: 'contatto',
      ricevutoIl: '2026-10-03T07:41:00.000Z',
      pagina: 'https://sito.example/contatti',
      privacyVersione: '2026-09-01',
    }),
    expect.objectContaining({ puntoDiIngresso: 'prenotazione_call' }),
  ]);
  expect(risposta.json.prenotazioni).toEqual([expect.objectContaining({ inizio: '2026-10-07T09:30:00.000Z', stato: 'confermata' })]);
  expect(risposta.json.note).toEqual([expect.objectContaining({ testo: 'Sentita al telefono.' })]);
  expect(risposta.json.promemoria).toEqual([expect.objectContaining({ testo: 'Mandare il preventivo' })]);
  expect(risposta.json.storico.length).toBeGreaterThanOrEqual(4);
});

test('Elimina contatto non lascia nel database nessuna riga riferita a quella persona', async () => {
  const { crm, id } = await crmConUnaPersona();
  crm.ponte.aggiungi(rigaContatto({ email: 'ELENA@contiarchitetti.example', privacy_accettata: false }));
  crm.ponte.aggiungi(rigaContatto({ email: 'altra.persona@posta.example', privacy_accettata: false }));
  await crm.scarica();

  const risposta = await crm.delete(`/api/contatti/${id}`);

  expect(risposta.status).toBe(200);
  expect((await crm.get('/api/scartati')).json.scartati.map((s: { email: string }) => s.email)).toEqual(['altra.persona@posta.example']);
  expect((await crm.get('/api/contatti')).json.contatti).toEqual([]);
  expect((await crm.get('/api/cartelle')).json).toMatchObject({ oggi: 0, tutti: 0 });
  expect((await crm.get(`/api/contatti/${id}`)).status).toBe(404);
  // Il criterio di accettazione chiede di guardare proprio nel database: ogni tabella legata a un Contatto è vuota.
  const tabelle = crm.db
    .all<{ name: string }>(sql`select name from sqlite_master where type = 'table'`)
    .filter(({ name }) => !['scarichi', 'scartati'].includes(name) && !name.startsWith('__') && !name.startsWith('sqlite_'));
  expect(tabelle.map((t) => t.name).sort()).toEqual(
    ['cambi_di_stato', 'cambi_di_prenotazione', 'contatti', 'invii', 'note', 'prenotazioni', 'promemoria', 'uid_di_prenotazione'].sort(),
  );
  for (const { name } of tabelle) {
    expect([name, crm.db.get<{ n: number }>(sql.raw(`select count(*) as n from ${name}`))!.n]).toEqual([name, 0]);
  }
});

test('se la stessa email arriva di nuovo dopo l\'eliminazione nasce un Contatto nuovo, senza traccia del precedente', async () => {
  const { crm, id } = await crmConUnaPersona();
  await crm.delete(`/api/contatti/${id}`);

  crm.ponte.aggiungi(rigaContatto({ email: 'elena@contiarchitetti.example', nome: 'Elena C.' }), '2026-10-10T08:00:00Z');
  await crm.scarica();

  const scheda = await crm.schedaDi('elena@contiarchitetti.example');
  expect(scheda).toMatchObject({ nome: 'Elena C.', stato: 'Nuovo' });
  expect(scheda.storico).toHaveLength(1);
});
