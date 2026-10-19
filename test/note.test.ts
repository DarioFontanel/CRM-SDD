import { expect, test } from 'vitest';
import { creaCrmDiProva, type CrmDiProva } from './aiuti.ts';

async function nuovoContatto(crm: CrmDiProva) {
  return (await crm.post('/api/contatti', { email: 'luca.verdi@verdisrl.example' })).json.contatto.id as number;
}

test('una Nota compare nello Storico al suo posto nel tempo, con data e ora messe dal CRM', async () => {
  const crm = creaCrmDiProva({ adesso: '2026-09-24T09:10:00Z' });
  const id = await nuovoContatto(crm);
  await crm.put(`/api/contatti/${id}/stato`, { stato: 'Contattato' });
  crm.orologio.adesso = new Date('2026-09-24T09:12:00Z');

  const creata = await crm.post(`/api/contatti/${id}/note`, { testo: 'Call fatta. Vuole una proposta.' });
  crm.orologio.adesso = new Date('2026-09-24T09:15:00Z');
  await crm.put(`/api/contatti/${id}/stato`, { stato: 'In trattativa' });

  expect(creata.status).toBe(201);
  expect((await crm.get(`/api/contatti/${id}`)).json.storico).toEqual([
    { tipo: 'stato', quando: '2026-09-24T09:15:00.000Z', da: 'Contattato', a: 'In trattativa' },
    { tipo: 'nota', id: creata.json.id, quando: '2026-09-24T09:12:00.000Z', testo: 'Call fatta. Vuole una proposta.' },
    { tipo: 'stato', quando: '2026-09-24T09:10:00.000Z', da: 'Nuovo', a: 'Contattato' },
  ]);
});

test('una Nota vuota viene rifiutata', async () => {
  const crm = creaCrmDiProva();
  const id = await nuovoContatto(crm);

  const risposta = await crm.post(`/api/contatti/${id}/note`, { testo: '   ' });

  expect(risposta.status).toBe(400);
  expect((await crm.get(`/api/contatti/${id}`)).json.storico).toEqual([]);
});

test('una Nota si può correggere: il testo cambia, data e ora restano', async () => {
  const crm = creaCrmDiProva({ adesso: '2026-09-24T09:12:00Z' });
  const id = await nuovoContatto(crm);
  const nota = (await crm.post(`/api/contatti/${id}/note`, { testo: 'Budget 2.000 €' })).json;
  crm.orologio.adesso = new Date('2026-09-25T08:00:00Z');

  const risposta = await crm.patch(`/api/note/${nota.id}`, { testo: 'Budget 3.000 €' });

  expect(risposta.status).toBe(200);
  expect((await crm.get(`/api/contatti/${id}`)).json.storico).toEqual([
    { tipo: 'nota', id: nota.id, quando: '2026-09-24T09:12:00.000Z', testo: 'Budget 3.000 €' },
  ]);
});

test('una Nota cancellata sparisce dallo Storico', async () => {
  const crm = creaCrmDiProva();
  const id = await nuovoContatto(crm);
  const nota = (await crm.post(`/api/contatti/${id}/note`, { testo: 'Da buttare' })).json;

  const risposta = await crm.delete(`/api/note/${nota.id}`);

  expect(risposta.status).toBe(200);
  expect((await crm.get(`/api/contatti/${id}`)).json.storico).toEqual([]);
});

test("aggiungere una Nota aggiorna l'ultima attività del Contatto negli elenchi", async () => {
  const crm = creaCrmDiProva({ adesso: '2026-09-20T09:00:00Z' });
  const id = await nuovoContatto(crm);
  crm.orologio.adesso = new Date('2026-10-02T17:00:00Z');

  await crm.post(`/api/contatti/${id}/note`, { testo: "Conosciuto all'evento di giovedì." });

  expect((await crm.get('/api/contatti')).json.contatti[0].ultimaAttivita).toBe('2026-10-02T17:00:00.000Z');
});
