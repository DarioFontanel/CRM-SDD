# CRM-SDD

![Licenza](https://img.shields.io/badge/licenza-MIT-green?style=flat) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) ![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)

**CRM-SDD** è un CRM personale per un solo utente che ti permette di raccogliere in automatico chi compila un form del tuo sito o prenota una call, e di seguirne il rapporto nel tempo. Gira interamente sul tuo Mac: i dati stanno in un file SQLite dentro la cartella del progetto.

---

## Funzionalità

- **Ingresso automatico** — gli invii del form di contatto e del lead magnet arrivano da una tabella Supabase (il *ponte*); le prenotazioni call arrivano da Cal.com. Il CRM scarica all'avvio, ogni 5 minuti e con "Scarica ora".
- **Contatti** — elenco con ricerca per nome, email o azienda, filtro per punto di ingresso, scheda modificabile. L'email identifica il Contatto, senza distinguere maiuscole e spazi.
- **Pipeline** — cinque Stati fissi (Nuovo, Contattato, In trattativa, Cliente, Perso), ognuno con la sua cartella.
- **Note, Promemoria e Storico** — ogni Invio, Prenotazione, cambio di Stato, Nota e Promemoria completato compare nello Storico del Contatto.
- **Da fare oggi** — Promemoria scaduti, Promemoria di oggi, call di oggi e nuovi arrivi.
- **Scartati** — le righe sospette o malformate vengono conservate con il motivo e si possono recuperare o eliminare.
- **Backup ed export** — copia del database a ogni avvio, export CSV di tutti i Contatti, export dei dati di una singola persona.

---

## Prerequisiti

- **Node 24 LTS** — la versione indicata in `.node-version`. Con una versione precedente `pnpm start` si ferma e lo segnala.
- **pnpm 10** — la versione esatta è fissata in `package.json`; con `corepack enable` Node usa quella.
- **Un progetto Supabase** dedicato, piano gratuito, regione UE — ospita il ponte.
- **Un account Cal.com** con una chiave API — fornisce le prenotazioni.

Senza Supabase o Cal.com il CRM si avvia comunque: il pannello di sinistra, in fondo, indica quale canale non è configurato e il resto dell'applicazione funziona.

---

## Installazione

1. Clona la repo ed entra nella cartella.

   ```bash
   git clone https://github.com/DarioFontanel/CRM-SDD.git && cd CRM-SDD
   ```

2. Installa le dipendenze.

   ```bash
   pnpm install
   ```

3. Crea il file dei segreti a partire dall'esempio. Il file `.env` è escluso da git.

   ```bash
   cp .env.example .env
   ```

4. Crea la tabella del ponte: nella dashboard di Supabase apri **SQL Editor**, incolla il contenuto di `supabase/ponte.sql` ed eseguilo. Lo script crea la tabella e la regola che consente al sito il solo inserimento.

5. Compila `.env` con l'indirizzo del progetto Supabase, la chiave segreta, la chiave pubblicabile e la chiave API di Cal.com. Se lasci vuoti i valori di un canale, il CRM parte senza quel canale.

6. Avvia il CRM. Il comando costruisce l'interfaccia e accende il server; Ctrl+C lo spegne. Al primo avvio crea `data/crm.sqlite`.

   ```bash
   pnpm start
   ```

Verifica: apri <http://127.0.0.1:4310>. In fondo al pannello di sinistra "Ponte" e "Cal.com" hanno il pallino verde dopo il primo scarico.

Il server ascolta solo su `127.0.0.1`: non ha login e non è raggiungibile da altri dispositivi della rete. Il CRM scarica e avvisa solo mentre è acceso.

---

## Comandi disponibili

- **`pnpm start`** — avvia il CRM su <http://127.0.0.1:4310>.
- **`pnpm test`** — esegue i test automatici, senza rete: usano un ponte e un Cal.com simulati.
- **`pnpm typecheck`** — controlla i tipi TypeScript.
- **`pnpm invii-di-prova`** — scrive nel ponte alcuni invii di prova con la chiave pubblicabile, come farà il sito: tre validi e cinque volutamente non validi.
- **`pnpm db:genera`** — genera una migrazione dopo una modifica a `src/server/db/schema.ts`.

---

## Backup e ripristino

A ogni avvio il CRM copia il database in `data/backups/`, con data e ora nel nome del file, e conserva le ultime 10 copie.

**Ripristino** — a CRM fermo:

1. Scegli in `data/backups/` la copia a cui tornare, per esempio `crm-2026-10-04_12-10-05.sqlite`.
2. Sostituisci `data/crm.sqlite` con quella copia.

   ```bash
   cp data/backups/crm-2026-10-04_12-10-05.sqlite data/crm.sqlite
   ```

3. Riavvia con `pnpm start`.

**Limite** — non esiste alcuna copia fuori dal Mac. I backup stanno nella stessa cartella del database: se la cartella del progetto viene cancellata o il Mac viene perso, si perdono anche i backup. L'unica protezione è Time Machine, se attivo.

---

## Passaggio a un Mac nuovo

Copia l'intera cartella del progetto, comprese `data/` e `.env`, che git non contiene. Sul Mac nuovo installa Node 24 e pnpm, poi esegui `pnpm install` e `pnpm start`.

---

## Dati personali

- **Elimina contatto** cancella dal database il Contatto e tutto ciò che gli è legato: Invii, Prenotazioni, Note, Promemoria e cambi di Stato. La persona va cancellata a mano anche da Cal.com.
- **Nei backup** il Contatto eliminato resta finché le copie ruotano: scompare entro 10 avvii del CRM.
- **Esporta dati** scarica un file con scheda, Invii, Prenotazioni, Note e Storico della persona.
- **Nessuna scadenza automatica** — i Contatti restano finché non vengono eliminati.

Per rimuovere completamente il CRM: cancella la cartella del progetto, il progetto Supabase del ponte e la chiave API di Cal.com.

---

## Struttura del progetto

- **`src/server/`** — server Hono: API, regole dei Contatti, scarico dal ponte e da Cal.com, backup.
- **`src/server/db/`** — schema Drizzle e apertura del database SQLite.
- **`src/ui/`** — interfaccia React a tre pannelli.
- **`src/condiviso/`** — vocabolario del dominio e forma delle risposte dell'API.
- **`drizzle/`** — migrazioni del database.
- **`supabase/ponte.sql`** — script che crea il ponte e definisce i campi che il sito deve inviare; il CRM li valida in `src/server/ponte.ts`.
- **`test/`** — test automatici ed esempi di risposta di Cal.com.
- **`docs/flussi-di-lavoro.html`** — schema visivo dei flussi di lavoro del CRM.
- **`data/`** — database e backup, esclusi da git.

---

Designed by **[Dario Fontanel, PhD](https://dariofontanel.com/)**

*Aiuto PMI italiane ad integrare l'intelligenza artificiale per automatizzare i lavori ripetitivi, abbattere i costi e guadagnare tempo per crescere.*

[![Sito](https://img.shields.io/badge/Sito-dariofontanel.com-4285F4?style=flat&logo=googlechrome&logoColor=white)](https://dariofontanel.com/)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=flat&logo=youtube&logoColor=white)](https://www.youtube.com/@dariofontanel)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=flat&logo=instagram&logoColor=white)](https://www.instagram.com/dariofontanel.ai/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0yMC40NDcgMjAuNDUyaC0zLjU1NHYtNS41NjljMC0xLjMyOC0uMDI3LTMuMDM3LTEuODUyLTMuMDM3LTEuODUzIDAtMi4xMzYgMS40NDUtMi4xMzYgMi45Mzl2NS42NjdIOS4zNTFWOWgzLjQxNHYxLjU2MWguMDQ2Yy40NzctLjkgMS42MzctMS44NSAzLjM3LTEuODUgMy42MDEgMCA0LjI2NyAyLjM3IDQuMjY3IDUuNDU1djYuMjg2ek01LjMzNyA3LjQzM2MtMS4xNDQgMC0yLjA2My0uOTI2LTIuMDYzLTIuMDY1IDAtMS4xMzguOTItMi4wNjMgMi4wNjMtMi4wNjMgMS4xNCAwIDIuMDY0LjkyNSAyLjA2NCAyLjA2MyAwIDEuMTM5LS45MjUgMi4wNjUtMi4wNjQgMi4wNjV6bTEuNzgyIDEzLjAxOUgzLjU1NVY5aDMuNTY0djExLjQ1MnpNMjIuMjI1IDBIMS43NzFDLjc5MiAwIDAgLjc3NCAwIDEuNzI5djIwLjU0MkMwIDIzLjIyNy43OTIgMjQgMS43NzEgMjRoMjAuNDUxQzIzLjIgMjQgMjQgMjMuMjI3IDI0IDIyLjI3MVYxLjcyOUMyNCAuNzc0IDIzLjIgMCAyMi4yMjUgMHoiLz48L3N2Zz4%3D)](https://www.linkedin.com/in/dario-fontanel/)
[![TikTok](https://img.shields.io/badge/TikTok-000000?style=flat&logo=tiktok&logoColor=white)](https://www.tiktok.com/@dario.fontanel)
[![AI Academy](https://img.shields.io/badge/AI_Academy-E7514F?style=flat&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAzIDEgOWwxMSA2IDktNC45MVYxN2gyVjlMMTIgM3pNNSAxMy4xOFYxN2MwIDEuNjYgMy4xMyAzIDcgM3M3LTEuMzQgNy0zdi0zLjgybC03IDMuODItNy0zLjgyeiIvPjwvc3ZnPg%3D%3D)](https://www.skool.com/ai-academy-2306)

Licenza: [MIT](LICENSE)
