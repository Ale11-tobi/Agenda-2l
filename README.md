# Agenda 2L

Sito della classe per verifiche e interrogazioni. Si usa da PC e da telefono. Si entra con nome e codice classe, c'è un portale admin per gestire gli accessi.

## Come metterlo online su Vercel

1. Carica questa cartella su un repository GitHub (o usa il comando `vercel` dalla cartella).
2. Su vercel.com premi **Add New > Project**, scegli il repository e premi **Deploy**. Non serve cambiare impostazioni.
3. Collega il database:
   - Nel progetto vai su **Storage**, scegli **Upstash Redis** (Marketplace), crea il database gratuito e premi **Connect Project**.
   - Vercel aggiunge da solo le variabili del database.
4. Aggiungi i due codici in **Settings > Environment Variables**:
   - `CLASS_CODE`: il codice che dai ai compagni (es. `2L-fisica-2026`).
   - `ADMIN_CODE`: il codice solo tuo per il portale admin. Deve essere diverso e difficile da indovinare.
5. Vai su **Deployments**, apri il menu dell'ultimo deploy e premi **Redeploy**.

## Come si usa

- **Compagni**: aprono il link, scrivono nome e codice classe e entrano. Il telefono si ricorda l'accesso. Al primo accesso parte il tutorial.
- **Admin**: apri `tuo-sito.vercel.app/admin` e inserisci `ADMIN_CODE`. Non c'è nessun link all'admin nel sito.

## Portale admin

- **Riepilogo**: numero di account, quanti sono online ora, espulsi, impegni, modifiche nelle ultime 24 ore.
- **Account**: nome, data di creazione, ultimo accesso, numero di accessi e di modifiche. Pulsanti:
  - **Disconnetti**: il compagno deve rifare il login.
  - **Espelli / Riammetti**: blocca o sblocca l'account (con quel nome non si può più entrare).
  - **Elimina**: cancella l'account.
- **Attività**: registro di accessi, nuovi account, impegni aggiunti, modificati ed eliminati, con nome e orario.
- **Impegni**: tutti gli impegni, puoi eliminarli.

## Da foto (solo admin, gratis)

Nel portale admin, scheda **Da foto**: scatti la foto di un foglio con nomi e giorni degli interrogati, l'app legge il foglio, ti mostra un'anteprima modificabile e solo dopo il tuo "Inserisci" salva gli impegni. Le righe incerte sono segnate "Da controllare" e partono deselezionate.

Serve una chiave gratuita di Google (Gemini), senza carta di credito:

1. Vai su https://aistudio.google.com/apikey e accedi con un account Google.
2. Premi **Create API key** e copia la chiave.
3. Su Vercel, **Settings > Environment Variables**, aggiungi `GEMINI_API_KEY` con quella chiave e fai **Redeploy**.

Note: il piano gratuito ha un limite di richieste al minuto e al giorno (bastano per questo uso). Google può usare i contenuti inviati col piano gratuito per migliorare i suoi prodotti: nella foto ci sono nomi di compagni, quindi usala solo se vi sta bene. Se un giorno il modello cambia nome, imposta la variabile `GEMINI_MODEL` (oggi: `gemini-3.6-flash`).

## Cose da sapere

- L'identità è il nome: chi sa il codice classe può scrivere il nome di un altro compagno. Per una classe va bene. Se qualcuno disturba, espellilo e cambia `CLASS_CODE` (poi Redeploy): chi ha già fatto accesso resta dentro finché non lo disconnetti, quindi dopo il cambio usa **Disconnetti** sugli account.
- Dopo 10 codici sbagliati da uno stesso indirizzo il login si blocca per 10 minuti.
- Il codice admin e il codice classe stanno solo su Vercel, mai nel sito.

## File

- `index.html`: l'agenda. `admin.html`: il portale admin.
- `api/login.js`, `api/events.js`, `api/admin.js`: il server. `lib/shared.js`: funzioni comuni.
- Nessuna libreria da installare.
