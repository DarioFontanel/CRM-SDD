import { expect, test } from 'vitest';
import { ponteDaAmbiente } from '../src/server/supabase.ts';
import { creaCrmDiProva, rigaContatto } from './aiuti.ts';

test('prima del primo scarico la barra non ha ancora un orario e il ponte è in attesa', async () => {
  const crm = creaCrmDiProva();

  expect((await crm.get('/api/canali')).json).toEqual({
    inCorso: false,
    ultimoScarico: null,
    ponte: { stato: 'in_attesa', messaggio: null, ultimoRiuscito: null },
    calcom: { stato: 'in_attesa', messaggio: null, ultimoRiuscito: null },
  });
});

test("uno scarico riuscito aggiorna l'ora dell'ultimo scarico e lo stato del ponte", async () => {
  const crm = creaCrmDiProva({ adesso: '2026-10-04T10:04:00Z' });

  const scarico = await crm.scarica();

  const atteso = {
    inCorso: false,
    ultimoScarico: '2026-10-04T10:04:00.000Z',
    ponte: { stato: 'ok', messaggio: null, ultimoRiuscito: '2026-10-04T10:04:00.000Z' },
    calcom: { stato: 'ok', messaggio: null, ultimoRiuscito: '2026-10-04T10:04:00.000Z' },
  };
  expect(scarico.json).toEqual(atteso);
  expect((await crm.get('/api/canali')).json).toEqual(atteso);
});

test("se il ponte non risponde compare un avviso riferito al ponte e l'ora resta quella dell'ultimo scarico riuscito", async () => {
  const crm = creaCrmDiProva({ adesso: '2026-10-04T10:04:00Z' });
  await crm.scarica();
  crm.orologio.adesso = new Date('2026-10-04T10:09:00Z');
  crm.ponte.guasto = new Error('fetch failed');

  const scarico = await crm.scarica();

  expect(scarico.json).toEqual({
    inCorso: false,
    ultimoScarico: '2026-10-04T10:04:00.000Z',
    ponte: {
      stato: 'errore',
      messaggio: expect.stringMatching(/ponte/i),
      ultimoRiuscito: '2026-10-04T10:04:00.000Z',
    },
    calcom: { stato: 'ok', messaggio: null, ultimoRiuscito: '2026-10-04T10:09:00.000Z' },
  });
});

test("l'avviso sparisce al primo scarico riuscito", async () => {
  const crm = creaCrmDiProva({ adesso: '2026-10-04T10:04:00Z' });
  crm.ponte.guasto = new Error('fetch failed');
  await crm.scarica();
  crm.orologio.adesso = new Date('2026-10-04T10:09:00Z');
  crm.ponte.guasto = null;

  await crm.scarica();

  expect((await crm.get('/api/canali')).json.ponte).toEqual({
    stato: 'ok',
    messaggio: null,
    ultimoRiuscito: '2026-10-04T10:09:00.000Z',
  });
});

test('con il ponte irraggiungibile si possono ancora aprire schede, cambiare Stato, scrivere Note e Promemoria', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto());
  await crm.scarica();
  crm.ponte.guasto = new Error('fetch failed');
  await crm.scarica();
  const { id } = await crm.schedaDi('mario@studiorossi.example');

  const stato = await crm.put(`/api/contatti/${id}/stato`, { stato: 'Contattato' });
  crm.orologio.adesso = new Date('2026-10-04T10:20:00Z');
  const nota = await crm.post(`/api/contatti/${id}/note`, { testo: 'Sentito al telefono.' });
  const promemoria = await crm.post(`/api/contatti/${id}/promemoria`, { testo: 'Mandare il preventivo', giorno: '2026-10-06' });

  expect([stato.status, nota.status, promemoria.status]).toEqual([200, 201, 201]);
  const scheda = (await crm.get(`/api/contatti/${id}`)).json;
  expect(scheda.stato).toBe('Contattato');
  expect(scheda.storico.map((v: { tipo: string }) => v.tipo)).toEqual(['nota', 'stato', 'invio']);
  expect(scheda.promemoria).toHaveLength(1);
});

test("l'ora dell'ultimo scarico riuscito sopravvive al riavvio del CRM", async () => {
  const crm = creaCrmDiProva({ adesso: '2026-10-04T10:04:00Z' });
  await crm.scarica();

  const riavviato = crm.riavvia();

  expect((await riavviato.get('/api/canali')).json).toEqual({
    inCorso: false,
    ultimoScarico: '2026-10-04T10:04:00.000Z',
    ponte: { stato: 'in_attesa', messaggio: null, ultimoRiuscito: '2026-10-04T10:04:00.000Z' },
    calcom: { stato: 'in_attesa', messaggio: null, ultimoRiuscito: '2026-10-04T10:04:00.000Z' },
  });
});

test('una chiave mancante nel file .env produce un avviso comprensibile, non un CRM che non parte', async () => {
  const crm = creaCrmDiProva({ ponte: ponteDaAmbiente({ SUPABASE_URL: 'https://abc.supabase.co' }) });

  const scarico = await crm.scarica();

  expect(scarico.status).toBe(200);
  expect(scarico.json.ponte).toEqual({
    stato: 'non_configurato',
    messaggio: expect.stringContaining('SUPABASE_SECRET_KEY'),
    ultimoRiuscito: null,
  });
  expect((await crm.post('/api/contatti', { email: 'marco@rivaconsulting.example' })).status).toBe(201);
});
