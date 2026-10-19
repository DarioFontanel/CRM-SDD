import { count } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Cartelle } from '../condiviso/api.ts';
import { STATI, isPuntoDiIngresso, isStato } from '../condiviso/dominio.ts';
import * as contatti from './contatti.ts';
import type { Db } from './db/apri.ts';
import * as tabelle from './db/schema.ts';
import { Rifiuto } from './errori.ts';
import * as esporta from './esporta.ts';
import * as note from './note.ts';
import { conteggioOggi, daFareOggi } from './oggi.ts';
import * as promemoria from './promemoria.ts';
import type { Scarico } from './scarico.ts';
import * as scartati from './scartati.ts';
import { schedaDi } from './scheda.ts';

export interface Dipendenze {
  db: Db;
  adesso: () => Date;
  scarico: Scarico;
}

function idDa(testo: string): number {
  const id = Number(testo);
  if (!Number.isInteger(id)) throw new Rifiuto(404, 'Non trovato.');
  return id;
}

export function creaApp({ db, adesso, scarico }: Dipendenze) {
  const app = new Hono();

  app.onError((errore, c) => {
    if (errore instanceof Rifiuto) return c.json({ errore: errore.message, codice: errore.codice }, errore.status);
    console.error(errore);
    return c.json({ errore: 'Errore del CRM. Guarda il terminale per i dettagli.' }, 500);
  });

  app.get('/api/cartelle', (c) => {
    const perStato = db
      .select({ stato: tabelle.contatti.stato, n: count() })
      .from(tabelle.contatti)
      .groupBy(tabelle.contatti.stato)
      .all();
    const stati = Object.fromEntries(STATI.map((stato) => [stato, 0])) as Cartelle['stati'];
    for (const riga of perStato) stati[riga.stato] = riga.n;
    const cartelle: Cartelle = {
      oggi: conteggioOggi(db, adesso()),
      tutti: perStato.reduce((somma, riga) => somma + riga.n, 0),
      stati,
      scartati: db.select({ n: count() }).from(tabelle.scartati).get()!.n,
    };
    return c.json(cartelle);
  });

  app.get('/api/contatti', (c) => {
    const stato = c.req.query('stato');
    const ingresso = c.req.query('ingresso');
    return c.json({
      contatti: contatti.elenco(db, {
        stato: isStato(stato) ? stato : undefined,
        ingresso: isPuntoDiIngresso(ingresso) ? ingresso : undefined,
        q: c.req.query('q'),
      }),
    });
  });

  app.post('/api/contatti', async (c) => {
    const esito = contatti.aggiungiAMano(db, await c.req.json(), adesso());
    return c.json(esito, esito.esistente ? 200 : 201);
  });

  app.get('/api/esporta/contatti.csv', (c) =>
    c.body(esporta.csvDeiContatti(db), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="contatti.csv"',
    }),
  );

  app.get('/api/contatti/:id/esporta', (c) => {
    const dati = esporta.datiDellaPersona(db, idDa(c.req.param('id')), adesso());
    return c.json(dati, 200, { 'content-disposition': `attachment; filename="contatto-${dati.contatto.id}.json"` });
  });

  app.delete('/api/contatti/:id', (c) => {
    contatti.elimina(db, idDa(c.req.param('id')));
    return c.json({});
  });

  app.get('/api/contatti/:id', (c) => c.json(schedaDi(db, idDa(c.req.param('id')))));

  app.patch('/api/contatti/:id', async (c) => {
    contatti.correggi(db, idDa(c.req.param('id')), await c.req.json());
    return c.json(schedaDi(db, idDa(c.req.param('id'))));
  });

  // L'interfaccia la chiama quando l'utente apre la scheda.
  app.post('/api/contatti/:id/visto', (c) => {
    contatti.segnaVisto(db, idDa(c.req.param('id')));
    return c.json({});
  });

  app.put('/api/contatti/:id/stato', async (c) => {
    const id = idDa(c.req.param('id'));
    contatti.cambiaStato(db, id, (await c.req.json()).stato, adesso());
    return c.json(schedaDi(db, id));
  });

  app.post('/api/contatti/:id/note', async (c) => {
    const nota = note.aggiungi(db, idDa(c.req.param('id')), (await c.req.json()).testo, adesso());
    return c.json(nota, 201);
  });

  app.patch('/api/note/:id', async (c) =>
    c.json(note.correggi(db, idDa(c.req.param('id')), (await c.req.json()).testo)),
  );

  app.delete('/api/note/:id', (c) => {
    note.cancella(db, idDa(c.req.param('id')));
    return c.json({});
  });

  app.post('/api/contatti/:id/promemoria', async (c) =>
    c.json(promemoria.aggiungi(db, idDa(c.req.param('id')), await c.req.json()), 201),
  );

  app.patch('/api/promemoria/:id', async (c) =>
    c.json(promemoria.modifica(db, idDa(c.req.param('id')), await c.req.json(), adesso())),
  );

  app.delete('/api/promemoria/:id', (c) => {
    promemoria.cancella(db, idDa(c.req.param('id')));
    return c.json({});
  });

  app.get('/api/oggi', (c) => c.json(daFareOggi(db, adesso())));

  app.get('/api/scartati', (c) => c.json({ scartati: scartati.elenco(db) }));

  app.get('/api/scartati/:id', (c) => c.json(scartati.dettaglio(db, idDa(c.req.param('id')))));

  app.post('/api/scartati/:id/recupera', async (c) =>
    c.json(scartati.recupera(db, idDa(c.req.param('id')), (await c.req.json()).email, adesso())),
  );

  app.delete('/api/scartati/:id', (c) => {
    scartati.elimina(db, idDa(c.req.param('id')));
    return c.json({});
  });

  // "Scarica ora": un giro di scarico subito, senza aspettare il prossimo.
  app.post('/api/scarico', async (c) => c.json(await scarico.esegui()));

  app.get('/api/canali', (c) => c.json(scarico.stato()));

  return app;
}
