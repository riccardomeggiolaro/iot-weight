# CSV Watcher → Oracle (`csv_watcher.py`)

Monitora la cartella dei CSV di pesatura e carica i dati nella tabella
`PESA_BA.ARCHIVIO` del database Oracle del cliente.

Il formato del CSV è descritto in `documentations/documentations_csv.pdf`
(sorgente: `documentations/documentations_csv.html`).

## Configurazione (variabili d'ambiente)

| Variabile    | Default                   | Descrizione                                   |
|--------------|---------------------------|-----------------------------------------------|
| `WATCH_DIR`  | `/var/opt/in-out/csv`     | Cartella monitorata                           |
| `ERROR_DIR`  | `<WATCH_DIR>/errori`      | Dove finiscono i file con righe in errore     |
| `ORA_USER`   | `PESA_BA`                 | Utente Oracle                                 |
| `ORA_PASS`   | `318101`                  | Password Oracle                               |
| `ORA_DSN`    | `localhost:1521/XEPDB1`   | `host:porta/service_name`                     |
| `ORA_SCHEMA` | `PESA_BA`                 | Schema che contiene `ARCHIVIO`                |
| `LOG_LEVEL`  | `INFO`                    | Livello di log                                |

```bash
ORA_DSN=192.168.1.10:1521/XEPDB1 WATCH_DIR=/var/opt/in-out/csv python3 utilities/csv_watcher.py
```

## Dati caricati

Vengono scritti **solo** i dati di pesatura e la tessera. Le altre colonne
di `ARCHIVIO` non vengono mai toccate (né in inserimento né in aggiornamento).

| Colonna ARCHIVIO     | Origine                                  | Note                                   |
|----------------------|------------------------------------------|----------------------------------------|
| `ID`                 | `MAX(ID) + 1`                            | ritenta in caso di chiave duplicata    |
| `TIPO`               | `'P'` entrata / entrata+uscita, `'M'` solo uscita con tara | vedi sotto           |
| `CLIENTE1`           | campo 18 – `numero_tessera`              |                                        |
| `DESCR`              | campo 19 – `codice_tessera`              |                                        |
| `DATA1` / `ORA1`     | campo 28 – `data1`                       | ora nel formato `HH.MM` (es. `11.58`)  |
| `CK1`                | `<pesa>-` + campo 29 – `pid1`            | es. `P1-00000-00001`                   |
| `PESO1`              | campo 30 – `peso1`                       |                                        |
| `DATA2` / `ORA2`     | campo 31 – `data2`                       |                                        |
| `CK2`                | `<pesa>-` + campo 32 – `pid2`            |                                        |
| `PESO2`              | campo 33 – `peso2`                       |                                        |
| `NETTO`              | campo 34 – `netto` (o `\|PESO1-PESO2\|`) | solo in uscita                         |
| `STATO_IMPORTAZIONE` | sempre `1`                               |                                        |

(I numeri di campo sono 1-based, come nella documentazione del CSV.)

Il watcher riconosce anche il **formato precedente** del CSV (29 colonne, soggetto unico):
in quel caso legge tessera, date, PID e pesi dalle posizioni vecchie (campi 14-15 e 23-29).
Il formato attuale (34 colonne) ha cliente, fornitore, vettore e autista separati, ognuno con
id, ragione sociale, codice e descrizione, e il codice del materiale.

`DATA*` e `ORA*` vengono adattate al tipo della colonna letto da
`ALL_TAB_COLUMNS` all'avvio (`DATE`/`TIMESTAMP`, `NUMBER` o `VARCHAR2`).

### Nome pesa

`<pesa>` è il prefisso del nome file fino al primo `_`:

| File                              | Pesa | CK scritto              |
|-----------------------------------|------|-------------------------|
| `P1_00000-00001.csv` (entrata)    | `P1` | `CK1 = P1-00000-00001`  |
| `P2_00000-00001_00000-00007.csv`  | `P2` | `CK2 = P2-00000-00007`  |

## Entrata e uscita

- **TIPO**: `'P'` se la pesata ha la prima pesata (entrata, oppure entrata
  e uscita); `'M'` se è solo un'uscita con tara, riconosciuta da `data1` e
  `pid1` vuoti (in quel caso `peso1` contiene la tara). Il TIPO viene
  scritto all'inserimento e non viene modificato dall'aggiornamento di uscita.

- **Entrata** (solo prima pesata): `INSERT` di un nuovo record con
  `STATO_IMPORTAZIONE = 1`.
- **Uscita** (presente la seconda pesata): il file di uscita contiene solo
  la pesa della seconda pesata, quindi il record di entrata si cerca con:
  - `CK1` che termina con `-<pid1>` (qualsiasi pesa)
  - `CK2` vuoto (entrata ancora aperta)
  - `CLIENTE1` = numero tessera (se presente nel CSV)
  - il più recente (`ID` maggiore)

  Il record trovato viene aggiornato (`DATA2`, `ORA2`, `CK2`, `PESO2`, `NETTO`,
  `STATO_IMPORTAZIONE = 1` e la tessera se presente). Se non viene trovato si
  inserisce un record completo, con `CK1` costruito usando la pesa del file.

> Limite noto: se due pese hanno un'entrata aperta con lo stesso pid e la
> stessa tessera, viene aggiornata la più recente.

## Gestione file

- All'avvio vengono elaborati i CSV già presenti (in ordine di data di
  modifica), poi la cartella viene monitorata.
- File elaborato senza errori → eliminato.
- Almeno una riga in errore → file spostato in `ERROR_DIR` per non perdere dati.

## Test in locale

```bash
docker start oracle-xe
ORA_DSN=localhost:1521/XEPDB1 WATCH_DIR=/tmp/csv-test python3 utilities/csv_watcher.py
# in un altro terminale
python3 utilities/generate_csv_example.py --righe 1 --out /tmp/csv-test --pesa P1
```
