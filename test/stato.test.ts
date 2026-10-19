import { expect, test } from 'vitest';
import { creaCrmDiProva, type CrmDiProva } from './aiuti.ts';

async function nuovoContatto(crm: CrmDiProva, email = 'giulia@bianchidesign.example') {
  return (await crm.post('/api/contatti', { email, nome: 'Giulia Bianchi' })).json.contatto.id as number;
}

test('cambiare Stato sposta il Contatto nella cartella del nuovo Stato', async () => {
  const crm = creaCrmDiProva();
  const id = await nuovoContatto(crm);

  const risposta = await crm.put(`/api/contatti/${id}/stato`, { stato: 'In trattativa' });

  expect(risposta.status).toBe(200);
  expect((await crm.get(`/api/contatti/${id}`)).json.stato).toBe('In trattativa');
  expect((await crm.get('/api/cartelle')).json.stati).toEqual({
    Nuovo: 0,
    Contattato: 0,
    'In trattativa': 1,
    Cliente: 0,
    Perso: 0,
  });
  const cartella = await crm.get(`/api/contatti?stato=${encodeURIComponent('In trattativa')}`);
  expect(cartella.json.contatti.map((c: { id: number }) => c.id)).toEqual([id]);
  expect((await crm.get('/api/contatti?stato=Nuovo')).json.contatti).toEqual([]);
});

test('ogni passaggio lascia nello Storico un Cambio di Stato, dal più recente', async () => {
  const crm = creaCrmDiProva({ adesso: '2026-09-29T08:15:00Z' });
  const id = await nuovoContatto(crm);

  await crm.put(`/api/contatti/${id}/stato`, { stato: 'Contattato' });
  crm.orologio.adesso = new Date('2026-10-01T14:30:00Z');
  await crm.put(`/api/contatti/${id}/stato`, { stato: 'Nuovo' });

  expect((await crm.get(`/api/contatti/${id}`)).json.storico).toEqual([
    { tipo: 'stato', quando: '2026-10-01T14:30:00.000Z', da: 'Contattato', a: 'Nuovo' },
    { tipo: 'stato', quando: '2026-09-29T08:15:00.000Z', da: 'Nuovo', a: 'Contattato' },
  ]);
});

test('scegliere lo Stato che il Contatto ha già non registra nessun passaggio', async () => {
  const crm = creaCrmDiProva();
  const id = await nuovoContatto(crm);

  await crm.put(`/api/contatti/${id}/stato`, { stato: 'Nuovo' });

  expect((await crm.get(`/api/contatti/${id}`)).json.storico).toEqual([]);
});

test('uno Stato fuori dai cinque fissi viene rifiutato', async () => {
  const crm = creaCrmDiProva();
  const id = await nuovoContatto(crm);

  const risposta = await crm.put(`/api/contatti/${id}/stato`, { stato: 'In attesa' });

  expect(risposta.status).toBe(400);
  expect((await crm.get(`/api/contatti/${id}`)).json.stato).toBe('Nuovo');
});

test("le righe degli elenchi mostrano l'ultima attività e sono ordinate dalla più recente", async () => {
  const crm = creaCrmDiProva({ adesso: '2026-09-20T09:00:00Z' });
  const giulia = await nuovoContatto(crm, 'giulia@bianchidesign.example');
  crm.orologio.adesso = new Date('2026-09-21T09:00:00Z');
  const luca = await nuovoContatto(crm, 'luca.verdi@verdisrl.example');

  crm.orologio.adesso = new Date('2026-09-24T11:12:00Z');
  await crm.put(`/api/contatti/${giulia}/stato`, { stato: 'Cliente' });

  const righe = (await crm.get('/api/contatti')).json.contatti;
  expect(righe.map((r: { id: number; ultimaAttivita: string }) => [r.id, r.ultimaAttivita])).toEqual([
    [giulia, '2026-09-24T11:12:00.000Z'],
    [luca, '2026-09-21T09:00:00.000Z'],
  ]);
});
