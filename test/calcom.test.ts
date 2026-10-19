import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { calcomDaAmbiente } from '../src/server/calcom.ts';
import { creaCrmDiProva, rigaContatto } from './aiuti.ts';

// Gli esempi di risposta di Cal.com salvati nel repo: i test girano senza rete.
const esempio = (nome: string) => readFileSync(join(import.meta.dirname, 'fixtures/calcom', `${nome}.json`), 'utf8');

/** Un Cal.com finto: a ogni giro di scarico risponde con l'esempio successivo. */
function crmConCalcom(esempi: string[], adesso = '2026-10-04T10:10:00Z') {
  const richieste: Request[] = [];
  const calcom = calcomDaAmbiente({ CALCOM_API_KEY: 'cal_prova' }, async (input, init) => {
    richieste.push(new Request(input, init));
    const nome = esempi.shift();
    if (nome === 'guasto') throw new TypeError('fetch failed');
    return new Response(nome ? esempio(nome) : JSON.stringify({ status: 'success', data: [] }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  return { crm: creaCrmDiProva({ adesso, calcom }), richieste };
}

const EMAIL = 'elena@contiarchitetti.example';

test('una prenotazione nuova diventa un Invio del punto di ingresso prenotazione call e una Prenotazione confermata', async () => {
  const { crm, richieste } = crmConCalcom(['nuova']);

  await crm.scarica();

  expect(richieste[0]!.headers.get('authorization')).toBe('Bearer cal_prova');
  expect(new URL(richieste[0]!.url).searchParams.has('afterUpdatedAt')).toBe(false);
  const scheda = await crm.schedaDi(EMAIL);
  expect(scheda).toMatchObject({
    nome: 'Elena Conti',
    azienda: 'Conti Architetti',
    telefono: '02 555 0111',
    stato: 'Nuovo',
    arrivatoDa: 'prenotazione_call',
    comeMiHaConosciuto: 'Google',
  });
  expect(scheda.storico).toEqual([
    expect.objectContaining({
      tipo: 'invio',
      puntoDiIngresso: 'prenotazione_call',
      quando: '2026-10-04T06:12:00.000Z',
      messaggio: 'Vorrei capire da dove partire.',
    }),
    { tipo: 'prenotazione', quando: '2026-10-04T06:12:00.000Z', inizio: '2026-10-07T09:30:00.000Z' },
  ]);
});

test("al secondo scarico il CRM chiede solo le prenotazioni cambiate dall'ultimo scarico riuscito, e rileggere la stessa non crea doppioni", async () => {
  const { crm, richieste } = crmConCalcom(['nuova', 'nuova'], '2026-10-04T10:04:00Z');
  await crm.scarica();

  await crm.scarica();

  expect(new URL(richieste[1]!.url).searchParams.get('afterUpdatedAt')).toBe('2026-10-04T10:04:00.000Z');
  expect((await crm.get('/api/contatti')).json.contatti).toHaveLength(1);
  expect((await crm.schedaDi(EMAIL)).storico).toHaveLength(2);
});

test('uno spostamento aggiorna la stessa Prenotazione e aggiunge una voce allo Storico, senza un nuovo Invio', async () => {
  const { crm } = crmConCalcom(['nuova', 'spostata', 'spostata']);
  await crm.scarica();
  const { id } = await crm.schedaDi(EMAIL);
  await crm.put(`/api/contatti/${id}/stato`, { stato: 'Contattato' });

  await crm.scarica();
  await crm.scarica();

  const scheda = await crm.schedaDi(EMAIL);
  expect(scheda.stato).toBe('Contattato');
  expect(scheda.storico.filter((v: { tipo: string }) => v.tipo !== 'stato')).toEqual([
    { tipo: 'spostamento', quando: '2026-10-05T08:00:00.000Z', da: '2026-10-07T09:30:00.000Z', a: '2026-10-09T13:00:00.000Z' },
    expect.objectContaining({ tipo: 'invio' }),
    { tipo: 'prenotazione', quando: '2026-10-04T06:12:00.000Z', inizio: '2026-10-07T09:30:00.000Z' },
  ]);
  const esportati = (await crm.get(`/api/contatti/${id}/esporta`)).json;
  expect(esportati.prenotazioni).toEqual([
    expect.objectContaining({ inizio: '2026-10-09T13:00:00.000Z', stato: 'spostata' }),
  ]);
});

test('un annullamento porta la Prenotazione ad annullata, con il motivo, e lo Storico lo registra una volta sola', async () => {
  const { crm } = crmConCalcom(['nuova', 'spostata', 'annullata', 'annullata']);
  for (let giro = 0; giro < 4; giro++) await crm.scarica();

  const scheda = await crm.schedaDi(EMAIL);
  expect(scheda.storico[0]).toEqual({ tipo: 'annullamento', quando: '2026-10-06T15:45:00.000Z', motivo: 'Non mi serve più' });
  expect(scheda.storico.map((v: { tipo: string }) => v.tipo)).toEqual(['annullamento', 'spostamento', 'invio', 'prenotazione']);
  const esportati = (await crm.get(`/api/contatti/${scheda.id}/esporta`)).json;
  expect(esportati.prenotazioni).toEqual([
    expect.objectContaining({ stato: 'annullata', motivoAnnullamento: 'Non mi serve più' }),
  ]);
});

test('Da fare oggi mostra le call di oggi tra i Promemoria e i nuovi arrivi, nel giorno nuovo se spostate e mai se annullate', async () => {
  const chiaviDelGiorno = async (crm: ReturnType<typeof creaCrmDiProva>, adesso: string) => {
    crm.orologio.adesso = new Date(adesso);
    return (await crm.get('/api/oggi')).json.sezioni.map((s: { chiave: string }) => s.chiave);
  };
  const { crm } = crmConCalcom(['nuova', 'spostata', 'annullata']);
  await crm.scarica();
  const { id } = await crm.schedaDi(EMAIL);
  await crm.post(`/api/contatti/${id}/promemoria`, { testo: 'Preparare la call', giorno: '2026-10-07' });

  expect(await chiaviDelGiorno(crm, '2026-10-07T06:00:00Z')).toEqual(['promemoria_di_oggi', 'call_di_oggi', 'nuovi_arrivi']);
  expect((await crm.get('/api/oggi')).json.sezioni[1].righe).toEqual([
    { contattoId: id, contatto: 'Elena Conti', inizio: '2026-10-07T09:30:00.000Z', stato: 'confermata' },
  ]);
  expect((await crm.get('/api/cartelle')).json.oggi).toBe(3);

  await crm.scarica(); // spostata al 9 ottobre
  expect(await chiaviDelGiorno(crm, '2026-10-07T06:00:00Z')).not.toContain('call_di_oggi');
  expect(await chiaviDelGiorno(crm, '2026-10-09T06:00:00Z')).toContain('call_di_oggi');

  await crm.scarica(); // annullata
  expect(await chiaviDelGiorno(crm, '2026-10-09T06:00:00Z')).not.toContain('call_di_oggi');
});

test("se Cal.com non risponde compare un avviso distinto da quello del ponte, e lo scarico dal ponte va avanti lo stesso", async () => {
  const { crm } = crmConCalcom(['guasto', 'nuova'], '2026-10-04T10:04:00Z');
  crm.ponte.aggiungi(rigaContatto());

  const scarico = await crm.scarica();

  expect(scarico.json.ponte.stato).toBe('ok');
  expect(scarico.json.calcom).toEqual({ stato: 'errore', messaggio: expect.stringMatching(/Cal\.com/), ultimoRiuscito: null });
  expect(crm.ponte.righe).toEqual([]);
  expect((await crm.get('/api/contatti')).json.contatti).toHaveLength(1);

  expect((await crm.scarica()).json.calcom.stato).toBe('ok');
  expect((await crm.get('/api/contatti')).json.contatti).toHaveLength(2);
});

test('senza chiave API nel file .env Cal.com risulta non configurato e il resto funziona', async () => {
  const crm = creaCrmDiProva({ calcom: calcomDaAmbiente({}) });

  expect((await crm.scarica()).json.calcom).toEqual({
    stato: 'non_configurato',
    messaggio: expect.stringContaining('CALCOM_API_KEY'),
    ultimoRiuscito: null,
  });
});

test('le risposte arrivano anche se Cal.com ha dato alle domande identificativi con maiuscole e trattini', async () => {
  const risposta = JSON.parse(esempio('nuova'));
  risposta.data[0].bookingFieldsResponses = {
    name: 'Elena Conti',
    email: 'elena@contiarchitetti.example',
    Azienda: 'Conti Architetti',
    Telefono: '+39 02 555 0111',
    'Come-ci-hai-conosciuto': 'Passaparola',
  };
  const crm = creaCrmDiProva({ calcom: calcomDaAmbiente({ CALCOM_API_KEY: 'x' }, async () => Response.json(risposta)) });

  await crm.scarica();

  expect(await crm.schedaDi(EMAIL)).toMatchObject({
    azienda: 'Conti Architetti',
    telefono: '+39 02 555 0111',
    comeMiHaConosciuto: 'Passaparola',
  });
});
