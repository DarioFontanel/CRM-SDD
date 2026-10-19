import { expect, test } from 'vitest';
import { creaCrmDiProva } from './aiuti.ts';

test('il CRM vuoto mostra tutte le cartelle con il conteggio a zero', async () => {
  const crm = creaCrmDiProva();

  const risposta = await crm.get('/api/cartelle');

  expect(risposta.status).toBe(200);
  expect(risposta.json).toEqual({
    oggi: 0,
    tutti: 0,
    stati: { Nuovo: 0, Contattato: 0, 'In trattativa': 0, Cliente: 0, Perso: 0 },
    scartati: 0,
  });
});
