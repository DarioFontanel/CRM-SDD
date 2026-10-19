import { expect, test } from 'vitest';
import { creaCrmDiProva, rigaContatto, rigaLeadMagnet } from './aiuti.ts';

test('un invio del form di contatto diventa un Contatto in Stato Nuovo con il suo Invio, e la riga sparisce dal ponte', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto({ telefono: '333 555 0102' }), '2026-10-04T09:41:00.123456+00:00');

  const scarico = await crm.scarica();

  expect(scarico.status).toBe(200);
  expect(crm.ponte.righe).toEqual([]);
  const scheda = await crm.schedaDi('mario@studiorossi.example');
  expect(scheda).toMatchObject({
    nome: 'Mario Rossi',
    email: 'mario@studiorossi.example',
    telefono: '333 555 0102',
    azienda: 'Studio Rossi',
    stato: 'Nuovo',
  });
  expect(scheda.storico).toEqual([
    {
      tipo: 'invio',
      quando: '2026-10-04T09:41:00.123Z',
      puntoDiIngresso: 'contatto',
      email: 'mario@studiorossi.example',
      nome: 'Mario Rossi',
      telefono: '333 555 0102',
      azienda: 'Studio Rossi',
      messaggio: 'Vorrei un preventivo per automatizzare le fatture.',
      risorsa: null,
      comeMiHaiConosciuto: 'LinkedIn',
      pagina: 'https://sito.example/contatti',
      privacyVersione: '2026-09-01',
    },
  ]);
});

test('una richiesta di lead magnet diventa un Invio con la risorsa richiesta', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaLeadMagnet({ email: 'sara@nerifoto.example', nome: 'Sara Neri' }));

  await crm.scarica();

  const scheda = await crm.schedaDi('sara@nerifoto.example');
  expect(scheda.storico).toEqual([
    expect.objectContaining({
      tipo: 'invio',
      puntoDiIngresso: 'lead_magnet',
      risorsa: 'guida-automazione-studio',
      messaggio: null,
      pagina: 'https://sito.example/guida',
    }),
  ]);
  expect(crm.ponte.righe).toEqual([]);
});

test("un invio con un'email già nota, scritta con maiuscole diverse, si aggiunge allo stesso Contatto: riempie i campi vuoti e non sovrascrive quelli presenti", async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaLeadMagnet({ nome: 'Mario Rossi', azienda: null, telefono: null }), '2026-10-03T16:20:00Z');
  await crm.scarica();

  crm.ponte.aggiungi(
    rigaContatto({ email: ' MARIO@StudioRossi.example', nome: 'M. Rossi', azienda: 'Studio Rossi', telefono: '02 555 0140' }),
    '2026-10-04T07:41:00Z',
  );
  await crm.scarica();

  expect((await crm.get('/api/contatti')).json.contatti).toHaveLength(1);
  const scheda = await crm.schedaDi('mario@studiorossi.example');
  expect(scheda).toMatchObject({
    nome: 'Mario Rossi',
    email: 'mario@studiorossi.example',
    azienda: 'Studio Rossi',
    telefono: '02 555 0140',
  });
  expect(scheda.storico.map((v: { puntoDiIngresso: string; email: string; nome: string }) => [v.puntoDiIngresso, v.email, v.nome])).toEqual([
    ['contatto', ' MARIO@StudioRossi.example', 'M. Rossi'],
    ['lead_magnet', 'mario@studiorossi.example', 'Mario Rossi'],
  ]);
});

test('un nuovo Invio non cambia lo Stato del Contatto', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaLeadMagnet());
  await crm.scarica();
  const { id } = await crm.schedaDi('mario@studiorossi.example');
  await crm.put(`/api/contatti/${id}/stato`, { stato: 'Cliente' });

  crm.ponte.aggiungi(rigaContatto());
  await crm.scarica();

  expect((await crm.schedaDi('mario@studiorossi.example')).stato).toBe('Cliente');
});

test('le righe sono lavorate dalla più vecchia, in qualunque ordine le restituisca il ponte', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto({ nome: 'Nome del secondo invio' }), '2026-10-04T09:00:00Z');
  crm.ponte.aggiungi(rigaContatto({ nome: 'Nome del primo invio' }), '2026-10-03T09:00:00Z');

  await crm.scarica();

  expect((await crm.schedaDi('mario@studiorossi.example')).nome).toBe('Nome del primo invio');
});

test('interrompere il CRM a metà scarico e riavviarlo non crea doppioni', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto());
  crm.ponte.interrompiAllaProssimaCancellazione = true;
  await crm.scarica();
  expect(crm.ponte.righe).toHaveLength(1);

  await crm.scarica();

  expect(crm.ponte.righe).toEqual([]);
  expect((await crm.schedaDi('mario@studiorossi.example')).storico).toHaveLength(1);
});

test('la scheda mostra "Arrivato da" (il punto di ingresso del primo Invio) e "Come mi ha conosciuto"', async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaLeadMagnet({ come_mi_hai_conosciuto: null }), '2026-10-03T16:20:00Z');
  crm.ponte.aggiungi(rigaContatto({ come_mi_hai_conosciuto: 'Passaparola' }), '2026-10-04T07:41:00Z');

  await crm.scarica();

  expect(await crm.schedaDi('mario@studiorossi.example')).toMatchObject({
    arrivatoDa: 'lead_magnet',
    comeMiHaConosciuto: 'Passaparola',
  });
});

test("se il ponte non risponde l'app continua a funzionare e lo scarico riprova al giro successivo", async () => {
  const crm = creaCrmDiProva();
  crm.ponte.aggiungi(rigaContatto());
  crm.ponte.guasto = new Error('fetch failed');

  const scarico = await crm.scarica();

  expect(scarico.status).toBe(200);
  const aMano = await crm.post('/api/contatti', { email: 'marco@rivaconsulting.example' });
  expect(aMano.status).toBe(201);
  expect((await crm.get('/api/contatti')).json.contatti).toHaveLength(1);

  crm.ponte.guasto = null;
  await crm.scarica();

  expect((await crm.get('/api/contatti')).json.contatti).toHaveLength(2);
  expect(crm.ponte.righe).toEqual([]);
});
