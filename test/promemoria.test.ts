import { expect, test } from 'vitest';
import { creaCrmDiProva, type CrmDiProva } from './aiuti.ts';

// Il fuso dei test è Europe/Rome: le 10:10 UTC del 4 ottobre 2026 sono le 12:10 locali.

async function nuovoContatto(crm: CrmDiProva, email = 'davide@ferrimeccanica.example', nome = 'Davide Ferri') {
  return (await crm.post('/api/contatti', { email, nome })).json.contatto.id as number;
}

async function nuovoPromemoria(crm: CrmDiProva, contattoId: number, testo: string, giorno: string) {
  const risposta = await crm.post(`/api/contatti/${contattoId}/promemoria`, { testo, giorno });
  expect(risposta.status).toBe(201);
  return risposta.json.id as number;
}

async function sezioniDiOggi(crm: CrmDiProva) {
  const { json } = await crm.get('/api/oggi');
  return json.sezioni.map((s: { chiave: string; righe: { testo: string }[] }) => [s.chiave, s.righe.map((r) => r.testo)]);
}

test('un Promemoria creato dalla scheda compare tra quelli aperti del Contatto', async () => {
  const crm = creaCrmDiProva();
  const id = await nuovoContatto(crm);

  const promemoriaId = await nuovoPromemoria(crm, id, 'Richiamare dopo le ferie', '2026-10-06');

  expect((await crm.get(`/api/contatti/${id}`)).json.promemoria).toEqual([
    { id: promemoriaId, testo: 'Richiamare dopo le ferie', giorno: '2026-10-06' },
  ]);
});

test('un Promemoria senza testo o con un giorno che non esiste viene rifiutato', async () => {
  const crm = creaCrmDiProva();
  const id = await nuovoContatto(crm);

  const senzaTesto = await crm.post(`/api/contatti/${id}/promemoria`, { testo: '', giorno: '2026-10-06' });
  const giornoSbagliato = await crm.post(`/api/contatti/${id}/promemoria`, { testo: 'Richiamare', giorno: '2026-02-30' });

  expect(senzaTesto.status).toBe(400);
  const meseSbagliato = await crm.post(`/api/contatti/${id}/promemoria`, { testo: 'Richiamare', giorno: '2026-13-45' });
  expect(giornoSbagliato.status).toBe(400);
  expect(meseSbagliato.status).toBe(400);
  expect((await crm.get(`/api/contatti/${id}`)).json.promemoria).toEqual([]);
});

test('un Promemoria si può modificare e spostare a un altro giorno', async () => {
  const crm = creaCrmDiProva();
  const id = await nuovoContatto(crm);
  const promemoriaId = await nuovoPromemoria(crm, id, 'Richiamare', '2026-10-06');

  const risposta = await crm.patch(`/api/promemoria/${promemoriaId}`, { testo: 'Richiamare dopo le ferie', giorno: '2026-10-12' });

  expect(risposta.status).toBe(200);
  expect((await crm.get(`/api/contatti/${id}`)).json.promemoria).toEqual([
    { id: promemoriaId, testo: 'Richiamare dopo le ferie', giorno: '2026-10-12' },
  ]);
});

test('un Promemoria fatto esce da quelli aperti ed entra nello Storico con la data di completamento', async () => {
  const crm = creaCrmDiProva({ adesso: '2026-10-01T08:00:00Z' });
  const id = await nuovoContatto(crm);
  const promemoriaId = await nuovoPromemoria(crm, id, 'Mandare la proposta', '2026-10-02');
  crm.orologio.adesso = new Date('2026-10-04T10:10:00Z');

  const risposta = await crm.patch(`/api/promemoria/${promemoriaId}`, { fatto: true });

  expect(risposta.status).toBe(200);
  const scheda = (await crm.get(`/api/contatti/${id}`)).json;
  expect(scheda.promemoria).toEqual([]);
  expect(scheda.storico).toEqual([
    { tipo: 'promemoria', quando: '2026-10-04T10:10:00.000Z', testo: 'Mandare la proposta', giorno: '2026-10-02' },
  ]);
});

test('un Promemoria cancellato sparisce e non entra nello Storico', async () => {
  const crm = creaCrmDiProva();
  const id = await nuovoContatto(crm);
  const promemoriaId = await nuovoPromemoria(crm, id, 'Da buttare', '2026-10-04');

  const risposta = await crm.delete(`/api/promemoria/${promemoriaId}`);

  expect(risposta.status).toBe(200);
  const scheda = (await crm.get(`/api/contatti/${id}`)).json;
  expect(scheda.promemoria).toEqual([]);
  expect(scheda.storico).toEqual([]);
  expect(await sezioniDiOggi(crm)).toEqual([]);
});

test('Da fare oggi mostra prima i Promemoria scaduti, poi quelli di oggi, e non quelli futuri', async () => {
  const crm = creaCrmDiProva({ adesso: '2026-10-04T10:10:00Z' });
  const davide = await nuovoContatto(crm);
  const luca = await nuovoContatto(crm, 'luca.verdi@verdisrl.example', 'Luca Verdi');
  await nuovoPromemoria(crm, davide, 'Richiamare dopo le ferie', '2026-10-04');
  await nuovoPromemoria(crm, luca, 'Mandare la proposta', '2026-10-02');
  await nuovoPromemoria(crm, luca, 'Preparare la demo', '2026-10-05');

  const { json } = await crm.get('/api/oggi');

  expect(json.sezioni).toEqual([
    {
      chiave: 'promemoria_scaduti',
      righe: [{ id: expect.any(Number), testo: 'Mandare la proposta', giorno: '2026-10-02', contattoId: luca, contatto: 'Luca Verdi' }],
    },
    {
      chiave: 'promemoria_di_oggi',
      righe: [{ id: expect.any(Number), testo: 'Richiamare dopo le ferie', giorno: '2026-10-04', contattoId: davide, contatto: 'Davide Ferri' }],
    },
  ]);
  expect((await crm.get('/api/cartelle')).json.oggi).toBe(2);
});

test('in Da fare oggi le sezioni vuote non compaiono', async () => {
  const crm = creaCrmDiProva({ adesso: '2026-10-04T10:10:00Z' });
  const id = await nuovoContatto(crm);
  await nuovoPromemoria(crm, id, 'Richiamare dopo le ferie', '2026-10-04');

  expect(await sezioniDiOggi(crm)).toEqual([['promemoria_di_oggi', ['Richiamare dopo le ferie']]]);
});

test('un Promemoria scaduto resta in Da fare oggi finché non viene fatto, spostato o cancellato', async () => {
  const crm = creaCrmDiProva({ adesso: '2026-10-04T10:10:00Z' });
  const id = await nuovoContatto(crm);
  const fatto = await nuovoPromemoria(crm, id, 'Primo', '2026-09-01');
  const spostato = await nuovoPromemoria(crm, id, 'Secondo', '2026-09-02');
  const cancellato = await nuovoPromemoria(crm, id, 'Terzo', '2026-09-03');
  await nuovoPromemoria(crm, id, 'Quarto', '2026-09-04');
  expect(await sezioniDiOggi(crm)).toEqual([['promemoria_scaduti', ['Primo', 'Secondo', 'Terzo', 'Quarto']]]);

  await crm.patch(`/api/promemoria/${fatto}`, { fatto: true });
  await crm.patch(`/api/promemoria/${spostato}`, { giorno: '2026-10-20' });
  await crm.delete(`/api/promemoria/${cancellato}`);

  expect(await sezioniDiOggi(crm)).toEqual([['promemoria_scaduti', ['Quarto']]]);
  expect((await crm.get('/api/cartelle')).json.oggi).toBe(1);
});

test('"oggi" è il giorno locale del Mac, non quello UTC', async () => {
  // Le 22:30 UTC del 4 ottobre sono le 00:30 del 5 ottobre a Roma.
  const crm = creaCrmDiProva({ adesso: '2026-10-04T22:30:00Z' });
  const id = await nuovoContatto(crm);
  await nuovoPromemoria(crm, id, 'Del 4', '2026-10-04');
  await nuovoPromemoria(crm, id, 'Del 5', '2026-10-05');

  expect(await sezioniDiOggi(crm)).toEqual([
    ['promemoria_scaduti', ['Del 4']],
    ['promemoria_di_oggi', ['Del 5']],
  ]);
});
