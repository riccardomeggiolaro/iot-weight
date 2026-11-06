// Impostazioni: una scheda per area (#/impostazioni/<scheda>).
// Le opzioni si salvano subito sul server; le modifiche alla configurazione dell'impianto
// sono riservate al super amministratore, gli altri utenti le vedono in sola lettura.

import { api, getMe } from '../api.js';
import { plant } from '../plant.js';
import { esc, toast } from '../ui.js';
import { renderUtenti } from './impostazioni-utenti.js';
import { renderStampe, renderManutenzione } from './impostazioni-sistema.js';
import { renderIntegrazioni } from './impostazioni-integrazioni.js';
import { renderPese } from './impostazioni-pese.js';

export const SUPER_ADMIN = 4;
export const ADMIN = 3;

const TABS = {
  generali:      { label: 'Generali',          render: renderGenerali },
  campi:         { label: 'Campi dei dati',    render: renderCampi },
  pese:          { label: 'Pese e dispositivi', render: renderPese },
  stampe:        { label: 'Stampe ed export',  render: renderStampe },
  totem:         { label: 'Totem',             render: renderTotem },
  utenti:        { label: 'Utenti',            render: renderUtenti },
  integrazioni:  { label: 'Integrazioni',      render: renderIntegrazioni },
  manutenzione:  { label: 'Manutenzione',      render: renderManutenzione },
};
const TAB_KEYS = Object.keys(TABS);

function currentTab() {
  const sub = location.hash.replace(/^#\/?/, '').split('/')[1];
  return TAB_KEYS.includes(sub) ? sub : TAB_KEYS[0];
}

export function renderImpostazioni(el) {
  const tab = currentTab();
  let destroyed = false;
  let cleanup = null;
  el.innerHTML = `
    <div class="page">
      <nav class="tabs" aria-label="Impostazioni">
        ${TAB_KEYS.map(t => `<a class="tab" href="#/impostazioni/${t}" ${t === tab ? 'aria-current="page"' : ''}>${esc(TABS[t].label)}</a>`).join('')}
      </nav>
      <div class="settings-body"><p class="muted">Caricamento…</p></div>
    </div>`;
  const body = el.querySelector('.settings-body');

  Promise.all([getMe().catch(() => ({ level: 0 })), api('/api/config-weigher/configuration')])
    .then(([me, config]) => {
      if (destroyed) return;
      body.innerHTML = '';
      cleanup = TABS[tab].render(body, { me, config, level: me?.level ?? 0 });
    })
    .catch(err => { if (!destroyed) body.innerHTML = `<p class="dt-empty err">Impossibile caricare le impostazioni: ${esc(err.message)}</p>`; });

  return () => { destroyed = true; if (typeof cleanup === 'function') cleanup(); };
}

// ── Componenti comuni ────────────────────────────────────────────────────────

/** Sezione con titolo e descrizione. Restituisce il contenitore delle righe. */
export function section(parent, title, description = '') {
  const s = document.createElement('section');
  s.className = 'card settings-section';
  s.innerHTML = `<header><h3>${esc(title)}</h3>${description ? `<p class="muted">${description}</p>` : ''}</header><div class="settings-rows"></div>`;
  parent.appendChild(s);
  return s.querySelector('.settings-rows');
}

export function readonlyNotice(parent, text = 'Solo il super amministratore può modificare queste impostazioni.') {
  const p = document.createElement('p');
  p.className = 'settings-notice';
  p.textContent = text;
  parent.appendChild(p);
}

/**
 * Riga con interruttore: si salva subito con save(valore); se il server rifiuta torna com'era.
 * onSaved(valore) aggiorna lo stato locale (es. plant.config).
 */
export function toggleRow(parent, { label, help = '', value, save, onSaved, disabled = false }) {
  const row = document.createElement('label');
  row.className = 'settings-row';
  row.innerHTML = `
    <span class="settings-text"><span class="settings-label">${esc(label)}</span>${help ? `<span class="settings-help">${help}</span>` : ''}</span>
    <span class="switch"><input type="checkbox" role="switch" ${value ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="switch-ui" aria-hidden="true"></span></span>`;
  const input = row.querySelector('input');
  input.addEventListener('change', async () => {
    const v = input.checked;
    input.disabled = true;
    try {
      await save(v);
      onSaved?.(v);
      toast(`${label}: ${v ? 'attivo' : 'disattivo'}`, 'ok', { timeout: 2500 });
    } catch (err) {
      input.checked = !v;
      toast(`Impossibile salvare: ${err.message}`, 'err');
    } finally {
      input.disabled = disabled;
    }
  });
  parent.appendChild(row);
  return row;
}

/** Riga con scelta tra opzioni (pulsanti segmentati). */
export function choiceRow(parent, { label, help = '', value, options, save, onSaved, disabled = false }) {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const name = `c-${Math.random().toString(36).slice(2)}`;
  row.innerHTML = `
    <span class="settings-text"><span class="settings-label">${esc(label)}</span>${help ? `<span class="settings-help">${help}</span>` : ''}</span>
    <span class="segmented" role="radiogroup" aria-label="${esc(label)}">
      ${options.map(o => `<label><input type="radio" name="${name}" value="${esc(o.value)}" ${o.value === value ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${esc(o.label)}</span></label>`).join('')}
    </span>`;
  let current = value;
  row.querySelectorAll('input').forEach(input => input.addEventListener('change', async () => {
    const v = input.value;
    row.querySelectorAll('input').forEach(i => { i.disabled = true; });
    try {
      await save(v);
      current = v;
      onSaved?.(v);
      toast(`${label}: ${options.find(o => o.value === v)?.label}`, 'ok', { timeout: 2500 });
    } catch (err) {
      row.querySelector(`input[value="${CSS.escape(current)}"]`).checked = true;
      toast(`Impossibile salvare: ${err.message}`, 'err');
    } finally {
      row.querySelectorAll('input').forEach(i => { i.disabled = disabled; });
    }
  }));
  parent.appendChild(row);
  return row;
}

/** Aggiorna la configurazione già caricata dall'app (barra di stato, colonne visibili, ...). */
export function updatePlantConfig(mutate) {
  if (!plant.config) return;
  mutate(plant.config);
  plant.emit('loaded', {});
}

const cfg = (path, method = 'PATCH') => api(`/api/config-weigher/configuration/${path}`, { method });

// ── Generali ─────────────────────────────────────────────────────────────────
function renderGenerali(el, { config, level }) {
  const ro = level < SUPER_ADMIN;
  if (ro) readonlyNotice(el);

  let rows = section(el, 'Funzionamento', 'Come vengono gestite le pesate sulle pese.');
  choiceRow(rows, {
    label: 'Modalità', disabled: ro, value: config.mode,
    help: '<b>Manuale</b>: l\'operatore seleziona il mezzo e avvia la pesata. <b>Semiautomatica</b>: il mezzo viene riconosciuto (targa o tessera) e l\'operatore conferma. <b>Automatica</b>: riconoscimento e pesata senza operatore.',
    options: [{ value: 'MANUALLY', label: 'Manuale' }, { value: 'SEMIAUTOMATIC', label: 'Semiautomatica' }, { value: 'AUTOMATIC', label: 'Automatica' }],
    save: v => cfg(`mode/${v}`),
    onSaved: v => updatePlantConfig(c => { c.mode = v; }),
  });
  toggleRow(rows, {
    label: 'Modalità test', disabled: ro, value: config.test_mode,
    help: 'Abilita le pesate di prova: dalla Dashboard si può inserire un peso a mano per provare stampe e funzionamento senza mezzi sulla pesa.',
    save: v => cfg(`test-mode/${v}`), onSaved: v => updatePlantConfig(c => { c.test_mode = v; }),
  });

  rows = section(el, 'Prenotazioni e accessi');
  const toggles = [
    ['use_reservation', 'use-reservation', 'Prenotazioni', 'Permette di creare prenotazioni (multiple e permanenti) prima dell\'arrivo dei mezzi.'],
    ['use_transit', 'use-transit', 'Transiti', 'Mezzi che entrano ed escono senza pesata.'],
    ['use_badge', 'use-badge', 'Tessere (badge)', 'Riconoscimento dei mezzi tramite tessera RFID.'],
    ['delete_pending_accesses_at_midnight', 'delete-pending-accesses-at-midnight', 'Pulizia a mezzanotte', 'A mezzanotte elimina gli accessi rimasti aperti che non erano prenotati.'],
  ];
  for (const [key, path, label, help] of toggles) {
    toggleRow(rows, { label, help, disabled: ro, value: !!config[key], save: v => cfg(`${path}/${v}`), onSaved: v => updatePlantConfig(c => { c[key] = v; }) });
  }

  rows = section(el, 'Pesata');
  toggleRow(rows, {
    label: 'Peso preimpostato', disabled: ro, value: !!config.use_preset_weight,
    help: 'Accetta le pesate con netto negativo registrandole come peso preimpostato (es. tara impostata sull\'indicatore).',
    save: v => cfg(`use-preset-weight/${v}`), onSaved: v => updatePlantConfig(c => { c.use_preset_weight = v; }),
  });
  toggleRow(rows, {
    label: 'Copia del documento a fine pesata', disabled: ro, value: !!config.return_pdf_copy_after_weighing,
    help: 'Restituisce il PDF della pesata a chi l\'ha effettuata (es. al totem o all\'operatore).',
    save: v => cfg(`return-pdf-copy-after-weighing/${v}`), onSaved: v => updatePlantConfig(c => { c.return_pdf_copy_after_weighing = v; }),
  });
  toggleRow(rows, {
    label: 'Registra le pesate degli indicatori', disabled: ro, value: !!config.use_recordings,
    help: 'Salva anche le pesate fatte direttamente sugli indicatori, fuori da questo programma.',
    save: v => cfg(`use-recordings/${v}`), onSaved: v => updatePlantConfig(c => { c.use_recordings = v; }),
  });
}

// ── Campi dei dati ───────────────────────────────────────────────────────────
const FIELDS = [
  ['vehicle', 'Veicolo (targa)'],
  ['customer', 'Cliente'],
  ['supplier', 'Fornitore'],
  ['vector', 'Vettore'],
  ['driver', 'Autista'],
  ['material', 'Materiale'],
  ['operator', 'Operatore'],
  ['document_reference', 'Riferimento documento'],
  ['note', 'Note'],
  ['weighing_pictures', 'Foto della pesata'],
];

function renderCampi(el, { config, level }) {
  const ro = level < SUPER_ADMIN;
  if (ro) readonlyNotice(el);
  const use = config.use_anagrafic || {};
  const rows = section(el, 'Dati usati nelle pesate e nelle prenotazioni',
    'I dati disattivati non compaiono nei form, nelle tabelle, nelle stampe e negli export.');
  for (const [key, label] of FIELDS) {
    toggleRow(rows, {
      label, disabled: ro, value: use[key] !== false,
      save: v => cfg(`access-anagrafic/${key}/${v}`),
      onSaved: v => updatePlantConfig(c => { c.use_anagrafic = { ...(c.use_anagrafic || {}), [key]: v }; }),
    });
  }
}

// ── Totem ────────────────────────────────────────────────────────────────────
const TOTEM_STEPS = [
  ['card', 'Tessera', 'L\'autista avvicina la tessera per farsi riconoscere.'],
  ['vehicle', 'Targa', 'L\'autista scrive o conferma la targa.'],
  ['customer', 'Cliente', ''],
  ['supplier', 'Fornitore', ''],
  ['vector', 'Vettore', ''],
  ['driver', 'Autista', ''],
  ['material', 'Materiale', ''],
];

function renderTotem(el, { config, level }) {
  const ro = level < SUPER_ADMIN;
  if (ro) readonlyNotice(el);
  let rows = section(el, 'Totem self-service', 'Postazione dove l\'autista inserisce da solo i dati della pesata (indirizzo <code>/totem</code>).');
  toggleRow(rows, {
    label: 'Totem attivo', disabled: ro, value: config.totem_enabled !== false,
    save: v => cfg(`totem-enabled/${v}`), onSaved: v => updatePlantConfig(c => { c.totem_enabled = v; }),
  });
  const steps = config.totem_anagrafiche || {};
  rows = section(el, 'Passi richiesti all\'autista', 'Le schermate che il totem mostra, nell\'ordine.');
  for (const [key, label, help] of TOTEM_STEPS) {
    toggleRow(rows, {
      label, help, disabled: ro, value: !!steps[key],
      save: v => cfg(`totem-anagrafic/${key}/${v}`),
      onSaved: v => updatePlantConfig(c => { c.totem_anagrafiche = { ...(c.totem_anagrafiche || {}), [key]: v }; }),
    });
  }
}
