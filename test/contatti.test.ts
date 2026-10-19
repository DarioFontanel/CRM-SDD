import { expect, test } from 'vitest';
import { creaCrmDiProva } from './aiuti.ts';

test('un Contatto aggiunto a mano nasce in Stato Nuovo e compare in Tutti i contatti', async () => {
  const crm = creaCrmDiProva();

  const creato = await crm.post('/api/contatti', {
    email: 'marco@rivaconsulting.example',
    nome: 'Marco Riva',
    telefono: '335 555 0190',
    azienda: 'Riva Consulting',
  });

  expect(creato.status).toBe(201);
  expect(creato.json.esistente).toBe(false);
  const elenco = await crm.get('/api/contatti');
  expect(elenco.json.contatti).toEqual([
    expect.objectContaining({
      id: creato.json.contatto.id,
      nome: 'Marco Riva',
      email: 'marco@rivaconsulting.example',
      azienda: 'Riva Consulting',
      stato: 'Nuovo',
    }),
  ]);
  expect((await crm.get('/api/cartelle')).json.tutti).toBe(1);
});

test("un'email malformata viene rifiutata con un messaggio", async () => {
  const crm = creaCrmDiProva();

  const risposta = await crm.post('/api/contatti', { email: 'franca.moretti@' });

  expect(risposta.status).toBe(400);
  expect(risposta.json.errore).toMatch(/email/i);
  expect((await crm.get('/api/contatti')).json.contatti).toEqual([]);
});

test("se l'email esiste già, anche con maiuscole e spazi diversi, si riapre la scheda esistente", async () => {
  const crm = creaCrmDiProva();
  const primo = await crm.post('/api/contatti', { email: 'mario@studiorossi.example', nome: 'Mario Rossi' });

  const secondo = await crm.post('/api/contatti', { email: '  Mario@StudioRossi.Example ', nome: 'Un altro' });

  expect(secondo.status).toBe(200);
  expect(secondo.json.esistente).toBe(true);
  expect(secondo.json.contatto.id).toBe(primo.json.contatto.id);
  const elenco = await crm.get('/api/contatti');
  expect(elenco.json.contatti).toHaveLength(1);
  expect(elenco.json.contatti[0].nome).toBe('Mario Rossi');
});

test('la ricerca filtra per nome, email o azienda', async () => {
  const crm = creaCrmDiProva();
  await crm.post('/api/contatti', { email: 'mario@studiorossi.example', nome: 'Mario Rossi', azienda: 'Studio Rossi' });
  await crm.post('/api/contatti', { email: 'giulia@bianchidesign.example', nome: 'Giulia Bianchi', azienda: 'Bianchi Design' });
  await crm.post('/api/contatti', { email: 'luca.verdi@verdisrl.example', nome: 'Luca Verdi' });

  const nomi = async (q: string) =>
    (await crm.get(`/api/contatti?q=${encodeURIComponent(q)}`)).json.contatti.map((c: { nome: string }) => c.nome);

  expect(await nomi('giul')).toEqual(['Giulia Bianchi']);
  expect(await nomi('VERDISRL')).toEqual(['Luca Verdi']);
  expect(await nomi('studio')).toEqual(['Mario Rossi']);
  expect(await nomi('nessuno')).toEqual([]);
});

test('la scheda di un Contatto aggiunto a mano mostra i suoi dati e "Aggiunto a mano"', async () => {
  const crm = creaCrmDiProva({ adesso: '2026-10-02T17:00:00Z' });
  const { json } = await crm.post('/api/contatti', { email: 'marco@rivaconsulting.example', nome: 'Marco Riva' });

  const scheda = await crm.get(`/api/contatti/${json.contatto.id}`);

  expect(scheda.status).toBe(200);
  expect(scheda.json).toMatchObject({
    nome: 'Marco Riva',
    email: 'marco@rivaconsulting.example',
    telefono: null,
    azienda: null,
    stato: 'Nuovo',
    creatoIl: '2026-10-02T17:00:00.000Z',
    arrivatoDa: 'a_mano',
  });
});

test('i dati della scheda si possono correggere', async () => {
  const crm = creaCrmDiProva();
  const { json } = await crm.post('/api/contatti', { email: 'marco@rivaconsulting.example' });
  const percorso = `/api/contatti/${json.contatto.id}`;

  const risposta = await crm.patch(percorso, {
    nome: 'Marco Riva',
    email: 'marco.riva@rivaconsulting.example',
    telefono: '335 555 0190',
    azienda: 'Riva Consulting',
  });

  expect(risposta.status).toBe(200);
  expect((await crm.get(percorso)).json).toMatchObject({
    nome: 'Marco Riva',
    email: 'marco.riva@rivaconsulting.example',
    telefono: '335 555 0190',
    azienda: 'Riva Consulting',
  });
});

test("cambiare l'email in una già usata da un altro Contatto viene rifiutato", async () => {
  const crm = creaCrmDiProva();
  await crm.post('/api/contatti', { email: 'mario@studiorossi.example' });
  const { json } = await crm.post('/api/contatti', { email: 'giulia@bianchidesign.example' });
  const percorso = `/api/contatti/${json.contatto.id}`;

  const risposta = await crm.patch(percorso, { email: 'MARIO@studiorossi.example' });

  expect(risposta.status).toBe(409);
  expect(risposta.json.errore).toMatch(/già/);
  expect((await crm.get(percorso)).json.email).toBe('giulia@bianchidesign.example');
});
