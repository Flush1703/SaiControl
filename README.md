# SaiControl

Gestionale per i progetti SAI, con piano finanziario per progetto e gestione delle ricevute pocket money.

## Stack

- API: Java 21, Spring Boot, Maven, PostgreSQL, Flyway, OpenAPI.
- Client: React, TypeScript, Vite.
- Deploy: Render con Docker per l’API e Static Site per il client, Supabase per PostgreSQL.

## Avvio locale

Richiede Java 21+, Maven e Node.js 22+ con Corepack/pnpm.

```bash
docker compose up -d database
export SERVER_PORT=8081
export APP_LOGIN_USERNAME=operatore
read -rs 'APP_LOGIN_PASSWORD?Password del gestionale: '
export APP_LOGIN_PASSWORD
./mvnw -f api/pom.xml spring-boot:run
```

In un secondo terminale:

```bash
cd client
corepack pnpm install
corepack pnpm dev
```

Client: `http://localhost:5173`  
API/OpenAPI: `http://localhost:8081/swagger-ui/index.html`

## Funzioni disponibili

- Accesso con un account operatore configurato nell’API tramite `APP_LOGIN_USERNAME` e `APP_LOGIN_PASSWORD`.
- Creazione di progetti SAI senza limite applicativo e inserimento manuale dei conti di ciascun piano.
- Pocket money per progetto. Il calcolo moltiplica la tariffa giornaliera per i giorni di calendario, includendo entrambe le date. La ricevuta si stampa dal browser con spazi per la firma e il timbro. Gli allegati vengono conservati nel database e scaricati dalla ricevuta.

Importazioni, deduplicazione, quote, pagamenti, riconciliazione, rimodulazioni e report sono descritti nel flusso di rendicontazione.

## Deploy di test su Render con Supabase

Il Blueprint `render.yaml` definisce l’API Docker e il sito statico React.
Nel progetto Supabase `asmumzntspfkfupgncgu`, apri **Connect → Session pooler** e copia l’host riportato nella stringa di connessione. Imposta queste variabili sul servizio API di Render.

| Variabile | Valore |
| --- | --- |
| `JDBC_DATABASE_URL` | `jdbc:postgresql://aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require` |
| `JDBC_DATABASE_USERNAME` | `postgres.asmumzntspfkfupgncgu` |
| `JDBC_DATABASE_PASSWORD` | Password PostgreSQL del progetto Supabase |
| `APP_LOGIN_USERNAME` | Nome utente dell’operatore |
| `APP_LOGIN_PASSWORD` | Password dell’operatore |
| `APP_CORS_ALLOWED_ORIGINS` | URL HTTPS del sito statico, senza slash finale |

Configura `VITE_API_URL` sul sito statico con l’URL HTTPS dell’API e ricostruisci il client dopo ogni modifica a questa variabile.

Flyway applica le migrazioni all’avvio dell’API. La chiave pubblicabile Supabase serve alle Data API. L’applicazione usa JDBC e richiede le credenziali PostgreSQL. Mantieni la password del database e quella dell’operatore nelle variabili segrete del servizio API.

Se il progetto Supabase è dedicato a questo gestionale, disattiva la Data API dalle impostazioni del progetto. Il browser accede ai dati tramite l’API Spring Boot.

## Flusso di rendicontazione

1. Crea il progetto e importa il piano dal primo foglio XLSX/XLSM o da un CSV UTF-8. Usa le intestazioni `codice di conto;descrizione;budget`.
2. In **Documenti e rendicontazione** importa i file originali o le righe con intestazioni `fornitore;numero;data;importo`. Le fatture elettroniche XML ordinarie e semplificate vengono lette direttamente, anche se contengono più fatture. Il totale viene estratto quando dichiarato in euro. I dati mancanti o il totale in valuta estera richiedono verifica manuale. Per i PDF e gli altri allegati inserisci i dati nel dettaglio. Controlla i documenti nella coda di verifica duplicati.
3. Imposta le regole dei fornitori ricorrenti, poi conferma progetto, conto e percentuale per ciascuna quota. Una fattura può avere quote su più progetti.
4. Importa le uscite bancarie con intestazioni `riferimento;data;descrizione;importo`. Usa un riferimento univoco per ciascuna operazione, anche quando importi più conti. Controlla i suggerimenti per saldo e conferma l’abbinamento.
5. Consulta il residuo per conto, esporta quote e pagamenti e simula le rimodulazioni. Applica una rimodulazione solo dopo aver attestato l’approvazione e inserito il riferimento all’atto. Le stime mensili del personale si registrano per ore e costo orario.

Per le date testuali usa AAAA-MM-GG. Le date native di Excel sono supportate. Conserva i codici conto con zeri iniziali usando il formato testo o il formato numerico appropriato nel foglio.

## Google Drive per progetto

In Google Cloud abilita **Google Drive API**, configura il consenso OAuth e crea un client OAuth di tipo **Applicazione web**. Aggiungi tra le origini JavaScript autorizzate `http://localhost:5173` per lo sviluppo e l’origine HTTPS del frontend per il deploy. Se il consenso è in modalità Testing, aggiungi gli account Google dei progetti come utenti di test.

In locale imposta `VITE_GOOGLE_CLIENT_ID` nel file `.env.local` alla radice del progetto e riavvia Vite. Su Render impostalo sul servizio frontend e ricostruisci il sito. È sufficiente il Client ID pubblico.

In SaiControl apri **Google Drive**, scegli il progetto e accedi con l’indirizzo Google del progetto. Al primo accesso SaiControl crea una cartella dedicata. Puoi caricare più file direttamente su Drive, fino a 5 MB per file. SaiControl usa il permesso `drive.file` e mostra i file a cui Google concede accesso per questa app. Il token rimane in memoria e resta associato al progetto mentre navighi in SaiControl. Il collegamento termina alla scadenza del token, quando lo scolleghi, quando esci da SaiControl o quando ricarichi la pagina.
