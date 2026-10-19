import { expect, test } from 'vitest';
import { creaCrmDiProva, rigaContatto, rigaLeadMagnet, type CrmDiProva } from './aiuti.ts';

async function righe(crm: CrmDiProva, parametri = '') {
  return (await crm.get(`/api/contatti${parametri}`)).json.contatti as { id: number; nome: string; nonVisto: boolean }[];
}

async function nuoviArrivi(crm: CrmDiProva) {
  const { json } = await crm.get('/api/oggi');
  return json.sezioni.find((s: { chiave: string }) => s.chiave === 'nuovi_arrivi')?.righe ?? [];
}

test('un Invio nasce non visto: il Contatto ha il pallino negli elenchi e sta tra i nuovi arrivi di Da fare oggi', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto(), '2026-10-04T07:41:00Z');

  await crm.scarica();

  const [riga] = await righe(crm);
  expect(riga!.nonVisto).toBe(true);
  expect(await nuoviArrivi(crm)).toEqual([
    {
      contattoId: riga!.id,
      contatto: 'Mario Rossi',
      puntoDiIngresso: 'contatto',
      quando: '2026-10-04T07:41:00.000Z',
      anteprima: 'Vorrei un preventivo per automatizzare le fatture.',
    },
  ]);
  expect((await crm.get('/api/cartelle')).json.oggi).toBe(1);
});

test('un Contatto aggiunto a mano non è un nuovo arrivo', async () => {
  const crm = creaCrmDiProva();
  await crm.post('/api/contatti', { email: 'marco@rivaconsulting.example' });

  expect((await righe(crm))[0]!.nonVisto).toBe(false);
  expect((await crm.get('/api/oggi')).json.sezioni).toEqual([]);
});

test('aprire la scheda segna come visti gli Invii: il pallino sparisce e il Contatto esce dai nuovi arrivi', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto());
  await crm.scarica();
  const [riga] = await righe(crm);

  const apertura = await crm.post(`/api/contatti/${riga!.id}/visto`);

  expect(apertura.status).toBe(200);
  expect((await righe(crm))[0]!.nonVisto).toBe(false);
  expect(await nuoviArrivi(crm)).toEqual([]);
  expect((await crm.get('/api/cartelle')).json.oggi).toBe(0);
});

test('un nuovo Invio su un Contatto già visto lo riporta tra i nuovi arrivi, senza cambiarne lo Stato', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaLeadMagnet(), '2026-10-03T16:20:00Z');
  await crm.scarica();
  const [riga] = await righe(crm);
  await crm.post(`/api/contatti/${riga!.id}/visto`);
  await crm.put(`/api/contatti/${riga!.id}/stato`, { stato: 'Contattato' });

  crm.ponte.aggiungi(rigaContatto(), '2026-10-04T07:41:00Z');
  await crm.scarica();

  expect(await nuoviArrivi(crm)).toEqual([
    expect.objectContaining({ contattoId: riga!.id, puntoDiIngresso: 'contatto', quando: '2026-10-04T07:41:00.000Z' }),
  ]);
  expect((await righe(crm))[0]!.nonVisto).toBe(true);
  expect((await crm.get(`/api/contatti/${riga!.id}`)).json.stato).toBe('Contattato');
});

test('in Da fare oggi i nuovi arrivi vengono dopo le sezioni dei Promemoria, e il conteggio li comprende', async () => {
  const crm = creaCrmDiProva({ adesso: '2026-10-04T10:10:00Z' });
  crm.ponte.aggiungi(rigaContatto());
  await crm.scarica();
  const [riga] = await righe(crm);
  await crm.post(`/api/contatti/${riga!.id}/promemoria`, { testo: 'Scaduto', giorno: '2026-10-01' });
  await crm.post(`/api/contatti/${riga!.id}/promemoria`, { testo: 'Di oggi', giorno: '2026-10-04' });

  const { json } = await crm.get('/api/oggi');

  expect(json.sezioni.map((s: { chiave: string }) => s.chiave)).toEqual(['promemoria_scaduti', 'promemoria_di_oggi', 'nuovi_arrivi']);
  expect((await crm.get('/api/cartelle')).json.oggi).toBe(3);
});

test('il filtro per punto di ingresso restringe ai Contatti con un Invio da lì, e si combina con ricerca e Stato', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto({ email: 'mario@studiorossi.example', nome: 'Mario Rossi' }));
  crm.ponte.aggiungi(rigaLeadMagnet({ email: 'mario@studiorossi.example' }));
  crm.ponte.aggiungi(rigaLeadMagnet({ email: 'sara@nerifoto.example', nome: 'Sara Neri', azienda: 'Neri Fotografia' }));
  crm.ponte.aggiungi(rigaLeadMagnet({ email: 'maria@contiarchitetti.example', nome: 'Maria Conti', azienda: 'Conti Architetti' }));
  await crm.scarica();
  await crm.post('/api/contatti', { email: 'marco@rivaconsulting.example', nome: 'Marco Riva' });
  const sara = (await righe(crm, '?q=sara'))[0]!;
  await crm.put(`/api/contatti/${sara.id}/stato`, { stato: 'Cliente' });

  const nomi = async (parametri: string) => (await righe(crm, parametri)).map((r) => r.nome).sort();

  expect(await nomi('?ingresso=contatto')).toEqual(['Mario Rossi']);
  expect(await nomi('?ingresso=lead_magnet')).toEqual(['Maria Conti', 'Mario Rossi', 'Sara Neri']);
  expect(await nomi('?ingresso=prenotazione_call')).toEqual([]);
  expect(await nomi('?ingresso=lead_magnet&q=mar')).toEqual(['Maria Conti', 'Mario Rossi']);
  expect(await nomi('?ingresso=lead_magnet&stato=Cliente')).toEqual(['Sara Neri']);
});
