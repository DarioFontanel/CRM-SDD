import { expect, test } from 'vitest';
import { creaCrmDiProva, rigaContatto, rigaLeadMagnet, type CrmDiProva } from './aiuti.ts';

async function unicoScartato(crm: CrmDiProva) {
  const { json } = await crm.get('/api/scartati');
  expect(json.scartati).toHaveLength(1);
  return json.scartati[0] as { id: number; email: string | null; motivo: string; quando: string };
}

test('una riga con la trappola compilata diventa uno Scartato con riga intera, data e motivo, e sparisce dal ponte', async () => {
  const crm = creaCrmDiProva();
  const riga = crm.ponte.aggiungi(
    rigaContatto({ email: 'promo@seo-best.example', messaggio: 'Aumenta le visite del 300%...', trappola: 'http://spam.example' }),
    '2026-10-04T01:14:00Z',
  );

  await crm.scarica();

  expect(crm.ponte.righe).toEqual([]);
  expect((await crm.get('/api/contatti')).json.contatti).toEqual([]);
  expect((await crm.get('/api/cartelle')).json.scartati).toBe(1);
  const scartato = await unicoScartato(crm);
  expect(scartato).toEqual({
    id: expect.any(Number),
    email: 'promo@seo-best.example',
    motivo: 'Campo trappola compilato',
    quando: '2026-10-04T01:14:00.000Z',
  });
  expect((await crm.get(`/api/scartati/${scartato.id}`)).json).toEqual({
    ...scartato,
    tipo: 'contatto',
    contenuto: 'Aumenta le visite del 300%...',
    riga,
  });
});

test.each([
  ['Campo trappola compilato', rigaContatto({ trappola: 'x' })],
  ['Email non valida', rigaContatto({ email: 'franca.moretti@' })],
  ['Tipo sconosciuto', rigaContatto({ tipo: 'newsletter' })],
  ['Versione del contratto sconosciuta', rigaContatto({ versione: 2 })],
  ['Informativa sulla privacy non accettata', rigaContatto({ privacy_accettata: false })],
  ['Manca il messaggio', rigaContatto({ messaggio: '  ' })],
  ['Manca la risorsa richiesta', rigaLeadMagnet({ risorsa: null })],
])('il motivo dice quale regola è fallita: %s', async (motivo, riga) => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(riga);

  await crm.scarica();

  expect((await unicoScartato(crm)).motivo).toBe(motivo);
  expect((await crm.get('/api/contatti')).json.contatti).toEqual([]);
});

test('la stessa riga non produce due Scartati, nemmeno se il CRM viene interrotto a metà scarico', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto({ trappola: 'x' }));
  crm.ponte.interrompiAllaProssimaCancellazione = true;
  await crm.scarica();
  expect(crm.ponte.righe).toHaveLength(1);

  await crm.scarica();

  expect(crm.ponte.righe).toEqual([]);
  await unicoScartato(crm);
});

test('"Recupera come contatto" trasforma lo Scartato in un Invio di un Contatto nuovo e lo toglie dagli Scartati', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(
    rigaLeadMagnet({ email: 'anna.greco@grecolab.example', nome: 'Anna Greco', privacy_accettata: false }),
    '2026-10-03T19:50:00Z',
  );
  await crm.scarica();
  const scartato = await unicoScartato(crm);

  const recupero = await crm.post(`/api/scartati/${scartato.id}/recupera`);

  expect(recupero.status).toBe(200);
  expect((await crm.get('/api/scartati')).json.scartati).toEqual([]);
  expect((await crm.get('/api/cartelle')).json.scartati).toBe(0);
  const scheda = await crm.schedaDi('anna.greco@grecolab.example');
  expect(recupero.json.contattoId).toBe(scheda.id);
  expect(scheda).toMatchObject({ nome: 'Anna Greco', stato: 'Nuovo', arrivatoDa: 'lead_magnet' });
  expect(scheda.storico).toEqual([
    expect.objectContaining({
      tipo: 'invio',
      quando: '2026-10-03T19:50:00.000Z',
      puntoDiIngresso: 'lead_magnet',
      risorsa: 'guida-automazione-studio',
    }),
  ]);
});

test('il recupero su un Contatto esistente aggiunge un Invio senza sovrascrivere i campi già presenti', async () => {
  const crm = creaCrmDiProva();
  await crm.post('/api/contatti', { email: 'mario@studiorossi.example', nome: 'Mario Rossi' });
  crm.ponte.aggiungi(rigaContatto({ email: 'MARIO@studiorossi.example', nome: 'Mario R.', azienda: 'Studio Rossi', tipo: 'newsletter' }));
  await crm.scarica();
  const scartato = await unicoScartato(crm);

  await crm.post(`/api/scartati/${scartato.id}/recupera`);

  expect((await crm.get('/api/contatti')).json.contatti).toHaveLength(1);
  const scheda = await crm.schedaDi('mario@studiorossi.example');
  expect(scheda).toMatchObject({ nome: 'Mario Rossi', azienda: 'Studio Rossi' });
  expect(scheda.storico).toHaveLength(1);
});

test("se l'email dello Scartato non è valida, il recupero chiede di correggerla prima di procedere", async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaLeadMagnet({ email: 'franca.moretti@', nome: 'Franca Moretti' }));
  await crm.scarica();
  const scartato = await unicoScartato(crm);

  const senzaCorrezione = await crm.post(`/api/scartati/${scartato.id}/recupera`);

  expect(senzaCorrezione.status).toBe(400);
  expect(senzaCorrezione.json.codice).toBe('email_non_valida');
  await unicoScartato(crm);
  expect((await crm.get('/api/contatti')).json.contatti).toEqual([]);

  const conCorrezione = await crm.post(`/api/scartati/${scartato.id}/recupera`, { email: 'franca.moretti@posta.example' });

  expect(conCorrezione.status).toBe(200);
  expect((await crm.get('/api/scartati')).json.scartati).toEqual([]);
  const scheda = await crm.schedaDi('franca.moretti@posta.example');
  expect(scheda.nome).toBe('Franca Moretti');
  expect(scheda.storico[0].email).toBe('franca.moretti@');
});

test('"Elimina" cancella lo Scartato', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto({ trappola: 'x' }));
  await crm.scarica();
  const scartato = await unicoScartato(crm);

  const risposta = await crm.delete(`/api/scartati/${scartato.id}`);

  expect(risposta.status).toBe(200);
  expect((await crm.get('/api/scartati')).json.scartati).toEqual([]);
  expect((await crm.get('/api/cartelle')).json.scartati).toBe(0);
});
