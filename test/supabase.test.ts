import { expect, test } from 'vitest';
import type { Ponte } from '../src/server/ponte.ts';
import { ErroreCanale } from '../src/server/scarico.ts';
import { ponteDaAmbiente } from '../src/server/supabase.ts';
import { creaCrmDiProva } from './aiuti.ts';

const AMBIENTE = { SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_SECRET_KEY: 'chiave-segreta' };

/** Un Supabase finto: registra le richieste e risponde come deciso dal test. */
function supabaseFinto(rispondi: (richiesta: Request) => Response | Promise<Response>) {
  const richieste: Request[] = [];
  const fetchFinto: typeof fetch = async (input, init) => {
    const richiesta = new Request(input, init);
    richieste.push(richiesta);
    return rispondi(richiesta);
  };
  return { richieste, ponte: ponteDaAmbiente(AMBIENTE, fetchFinto) as Ponte };
}

test('il CRM legge le righe del ponte con la chiave segreta, dalla più vecchia', async () => {
  const righe = [{ id: 'a1', created_at: '2026-10-04T09:41:00+00:00', email: 'mario@studiorossi.example' }];
  const { ponte, richieste } = supabaseFinto(() => Response.json(righe));

  expect(await ponte.leggi()).toEqual(righe);

  const url = new URL(richieste[0]!.url);
  expect(richieste[0]!.method).toBe('GET');
  expect(url.origin + url.pathname).toBe('https://abc.supabase.co/rest/v1/ponte');
  expect(url.searchParams.get('order')).toBe('created_at.asc');
  expect(richieste[0]!.headers.get('apikey')).toBe('chiave-segreta');
});

test('il CRM cancella dal ponte solo la riga indicata', async () => {
  const { ponte, richieste } = supabaseFinto(() => new Response(null, { status: 204 }));

  await ponte.cancella('3f2c9a1e-0000-4000-8000-000000000001');

  const url = new URL(richieste[0]!.url);
  expect(richieste[0]!.method).toBe('DELETE');
  expect(url.pathname).toBe('/rest/v1/ponte');
  expect(url.searchParams.get('id')).toBe('eq.3f2c9a1e-0000-4000-8000-000000000001');
});

test('una chiave sbagliata produce un avviso che dice quale chiave controllare', async () => {
  const { ponte } = supabaseFinto(() => Response.json({ message: 'Invalid API key' }, { status: 401 }));
  const crm = creaCrmDiProva({ ponte });

  const scarico = await crm.scarica();

  expect(scarico.json.ponte).toMatchObject({
    stato: 'errore',
    messaggio: expect.stringContaining('SUPABASE_SECRET_KEY'),
  });
});

test('un ponte irraggiungibile produce un avviso che dice che si riprova', async () => {
  const { ponte } = supabaseFinto(() => {
    throw new TypeError('fetch failed');
  });

  await expect(ponte.leggi()).rejects.toThrow(ErroreCanale);
  await expect(ponte.leggi()).rejects.toThrow(/non è raggiungibile/);
});
