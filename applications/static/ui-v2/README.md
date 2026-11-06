# Interfaccia (v2)

È l'unica interfaccia dell'applicazione: il server la serve sulla radice **`/`**
(`/dashboard` e `/v2/` reindirizzano qui). Il login è in `login.html` (`/login`).

Della vecchia interfaccia (`static/ui/default`, servita su `/static/`) restano solo:
totem (`/totem`, `/dashboard-totem`, `totem-*.html`), report designer
(`/report-designer/...`) e la vista 3D (`/static/config3d.html`, usata da *Impianto*).

- Nessun passaggio di compilazione e nessuna libreria esterna: HTML, CSS e
  moduli JavaScript (funziona anche senza internet presso il cliente).
- Navigazione con hash (`#/pesa`, `#/prenotazioni`, …): una sola pagina.
- Tema chiaro di default, scuro automatico o dal pulsante in alto.

## Struttura

```
index.html            guscio: menu laterale, barra di stato, area contenuti
login.html            accesso (salva il token usato da tutte le pagine)
404.html              pagina non trovata
css/login.css         pagine di accesso e 404
js/login.js           accesso: chiamata a /api/auth/login, ritorno a ?next=
css/app.css           token dei colori, layout, componenti comuni
css/pesa.css          schermata Pesa
js/app.js             avvio, navigazione, barra di stato, tema
js/api.js             chiamate alle API con il token, apertura PDF protetti
js/plant.js           stato dell'impianto: configurazione + websocket per pesa,
                      eventi (realtime, data, weighing, report, picture, flash,
                      relays, message, access)
js/ui.js              escape HTML, avvisi, formattazione
js/views/pesa.js      schermata Pesa
js/views/anagrafiche.js  schermata Anagrafiche (#/anagrafiche/<scheda>)
js/views/prenotazioni.js schermate Prenotazioni (#/prenotazioni/<scheda>) e Pesate (#/pesate)
js/anagrafic-input.js campo con suggerimenti per scegliere/creare un record di un'anagrafica
js/data-table.js      tabella con filtri, ordinamento e paginazione lato server
js/anagrafic-socket.js   websocket di un'anagrafica: eventi in tempo reale e blocco dei record
css/data.css          schede, tabelle, finestre di dialogo e form
js/views/impianto.js  vista 3D (per ora riusa /static/config3d.html)
js/views/placeholder.js  sezioni non ancora pronte
```

## Stato

| Sezione       | Stato |
|---------------|-------|
| Pesa          | pronta: peso, mezzo, entrata/uscita, tara, zero, ristampa, foto, sbarre, attività |
| Impianto      | vista 3D esistente |
| Prenotazioni  | pronta: schede Multiple, Permanenti, Transiti (filtro Attive / Concluse / Tutte, stato Attiva / Conclusa; crea, modifica, concludi, elimina, dettaglio pesate con PDF, foto ed eliminazione dell'ultima pesata); aggiornamento in tempo reale |
| Pesate        | pronta (voce di menu a sé): una riga per pesata, filtri, dettaglio con foto, PDF, modifica dati, eliminazione dell'ultima pesata, export Excel/PDF |
| Anagrafiche   | pronta: veicoli, clienti, fornitori, vettori, materiali, autisti, tessere — ricerca, ordinamento, inserimento/modifica/eliminazione con blocco del record, import CSV/Excel, aggiornamento in tempo reale |
| Report        | da fare |
| Impostazioni  | da fare (configurazione guidata) |

## Scorciatoie (schermata Pesa)

F1 pesata entrata · F2 pesata uscita · F3 tara · F4 zero
