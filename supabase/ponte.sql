-- Il ponte: la tabella in cui il sito lascia gli invii dei form e da cui il CRM li ritira.
-- Contratto di ingresso versione 1: il CRM lo valida in src/server/ponte.ts.
--
-- Come si usa: dashboard di Supabase → SQL Editor → incolla tutto → Run.
-- Si può rilanciare su un progetto nuovo per ricreare il ponte da zero.

create table public.ponte (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  versione                integer not null,
  tipo                    text not null check (char_length(tipo) <= 40),
  email                   text not null check (char_length(email) <= 320),
  nome                    text check (char_length(nome) <= 200),
  telefono                text check (char_length(telefono) <= 50),
  azienda                 text check (char_length(azienda) <= 200),
  messaggio               text check (char_length(messaggio) <= 5000),
  risorsa                 text check (char_length(risorsa) <= 200),
  come_mi_hai_conosciuto  text check (char_length(come_mi_hai_conosciuto) <= 500),
  pagina                  text not null check (char_length(pagina) <= 2000),
  privacy_accettata       boolean not null,
  privacy_versione        text not null check (char_length(privacy_versione) <= 100),
  trappola                text check (char_length(trappola) <= 500)
);

comment on table public.ponte is
  'Invii dei form del sito in attesa di essere scaricati dal CRM. Il CRM cancella ogni riga dopo averla salvata.';

-- I valori (tipo, versione, trappola, privacy) non sono vincolati qui di proposito:
-- una riga sospetta o malformata deve arrivare al CRM, che la mette tra gli Scartati.

-- Con la chiave pubblicabile (ruolo "anon") si può solo inserire: niente lettura, modifica o cancellazione.
alter table public.ponte enable row level security;

revoke all on public.ponte from anon, authenticated;

-- `id` e `created_at` non sono tra le colonne concesse: li mette sempre Supabase.
grant insert (
  versione, tipo, email, nome, telefono, azienda, messaggio, risorsa,
  come_mi_hai_conosciuto, pagina, privacy_accettata, privacy_versione, trappola
) on public.ponte to anon;

create policy "Il sito può solo aggiungere righe"
  on public.ponte
  for insert
  to anon
  with check (true);

-- La chiave segreta (ruolo "service_role") salta le regole: il CRM legge e cancella con quella.
