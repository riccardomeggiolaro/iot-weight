// Impostazioni › Stampe ed export e › Manutenzione.

import { api, getToken, uploadFile, downloadProtectedFile } from '../api.js';
import { esc, toast, openDialog, confirmDialog } from '../ui.js';
import { SUPER_ADMIN, section, readonlyNotice, toggleRow, updatePlantConfig } from './impostazioni.js';

const REPORTS = [
  { key: 'report_in', label: 'Entrata', help: 'Documento della prima pesata.', designer: 'entrata' },
  { key: 'report_out', label: 'Uscita', help: 'Documento a pesata completata.', designer: 'uscita' },
  { key: 'report_tare', label: 'Uscita con tara', help: 'Pesata singola con tara preimpostata.', designer: 'tara' },
  { key: 'report_generic', label: 'Generica / test', help: 'Pesate di prova e pesate senza prenotazione.', designer: 'generica' },
];

const FOLDERS = [
  { key: 'path_pdf', api: 'path-pdf', label: 'Documenti PDF', help: 'Dove salvare il PDF di ogni pesata. Vuoto: non salvare.' },
  { key: 'path_csv', api: 'path-csv', label: 'File CSV', help: 'Dove scrivere il CSV di ogni pesata (letto da gestionali e integrazioni). Vuoto: non scrivere.' },
  { key: 'path_img', api: 'path-img', label: 'Foto delle pesate', help: 'Dove salvare le foto scattate dalle fotocamere.' },
];

function apiError(err) {
  if (/not a valid directory|not accessible|not readable|not writable/i.test(err.message)) {
    return 'La cartella non esiste sul server o non è accessibile';
  }
  return err.message;
}

// ── Stampe ed export ─────────────────────────────────────────────────────────
export function renderStampe(el, { config, level }) {
  const ro = level < SUPER_ADMIN;
  if (ro) readonlyNotice(el);

  let rows = section(el, 'Modelli di stampa', 'Il documento stampato e salvato in PDF per ogni tipo di pesata. Si modificano con il report designer, dentro l\'app.');
  for (const r of REPORTS) {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.innerHTML = `
      <span class="settings-text"><span class="settings-label">${esc(r.label)}</span>
        <span class="settings-help">${esc(r.help)} File: <code>${esc(config[r.key] || '—')}</code></span></span>
      ${ro ? '' : `<a class="btn" href="#/designer/${r.designer}">Modifica</a>`}`;
    rows.appendChild(row);
  }

  rows = section(el, 'Cartelle', 'Percorsi sul computer dove gira il programma.');
  for (const f of FOLDERS) {
    const row = document.createElement('form');
    row.className = 'settings-row';
    row.innerHTML = `
      <span class="settings-text"><span class="settings-label">${esc(f.label)}</span><span class="settings-help">${esc(f.help)}</span></span>
      <span class="inline-form"><input class="input" name="path" value="${esc(config[f.key] || '')}" placeholder="es. /var/opt/in-out/pdf" ${ro ? 'disabled' : ''} aria-label="${esc(f.label)}">
      ${ro ? '' : '<button type="submit" class="btn">Salva</button>'}</span>`;
    row.addEventListener('submit', async e => {
      e.preventDefault();
      const value = row.elements.path.value.trim();
      const btn = row.querySelector('button');
      btn.disabled = true;
      try {
        await api(`/api/config-weigher/configuration/${f.api}`, { method: 'PATCH', body: { path: value || null } });
        config[f.key] = value || null;
        updatePlantConfig(c => { c[f.key] = value || null; });
        toast(`${f.label}: ${value ? 'cartella salvata' : 'salvataggio disattivato'}`, 'ok');
      } catch (err) {
        toast(apiError(err), 'err');
      } finally {
        btn.disabled = false;
      }
    });
    rows.appendChild(row);
  }

  rows = section(el, 'Export');
  toggleRow(rows, {
    label: 'Totali negli export', disabled: ro, value: config.show_export_totals !== false,
    help: 'Aggiunge a Excel e PDF i totali per materiale, cliente, fornitore e targa.',
    save: v => api(`/api/config-weigher/configuration/show-export-totals/${v}`, { method: 'PATCH' }),
    onSaved: v => updatePlantConfig(c => { c.show_export_totals = v; }),
  });
}

// ── Manutenzione ─────────────────────────────────────────────────────────────
export function renderManutenzione(el, { level }) {
  if (level < SUPER_ADMIN) {
    readonlyNotice(el, 'La manutenzione è riservata al super amministratore.');
    return;
  }

  let rows = section(el, 'Configurazione', 'Copia completa delle impostazioni (con i modelli di stampa), per conservarla o trasferirla su un altro impianto.');
  const actions = document.createElement('div');
  actions.className = 'settings-actions';
  actions.innerHTML = `
    <button type="button" class="btn" data-a="export">Esporta configurazione (.zip)</button>
    <label class="btn file-btn">Importa configurazione…<input type="file" accept=".zip,application/zip" hidden></label>`;
  rows.appendChild(actions);
  const exportBtn = actions.querySelector('[data-a="export"]');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    try { await downloadProtectedFile('/api/generic/export-config-doc', `configurazione_${new Date().toISOString().slice(0, 10)}.zip`); }
    catch (err) { toast(`Esportazione non riuscita: ${err.message}`, 'err'); }
    finally { exportBtn.disabled = false; }
  });
  actions.querySelector('input[type=file]').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const ok = await confirmDialog('Importa configurazione',
      `<p>Sostituire la configurazione attuale con quella di <strong>${esc(file.name)}</strong>?</p>
       <p class="muted">La configurazione attuale resta tra i backup e si può ripristinare. Per applicarla serve riavviare il programma.</p>`,
      { label: 'Importa', onConfirm: () => uploadFile('/api/generic/import-config', file) });
    if (ok) { toast('Configurazione importata: riavvia il programma per applicarla', 'ok', { timeout: 10000 }); loadBackups(); }
  });

  const backupsEl = document.createElement('div');
  backupsEl.className = 'backups';
  rows = section(el, 'Backup automatici', 'Il programma salva una copia a ogni modifica. Puoi tornare a una versione precedente.');
  rows.appendChild(backupsEl);

  async function loadBackups() {
    backupsEl.innerHTML = '<p class="muted backups-msg">Caricamento…</p>';
    try {
      const [cfg, rep] = await Promise.all([api('/api/generic/list-config-backups'), api('/api/generic/list-report-backups')]);
      const label = { report_in: 'Modello entrata', report_out: 'Modello uscita', report_tare: 'Modello tara', report_generic: 'Modello generico' };
      const items = [
        ...(cfg.backups || []).map(b => ({ ...b, kind: 'config', what: 'Configurazione' })),
        ...(rep.backups || []).map(b => ({ ...b, kind: 'report', what: label[b.report] || b.report })),
      ].sort((a, b) => b.mtime - a.mtime).slice(0, 30);
      if (!items.length) { backupsEl.innerHTML = '<p class="muted backups-msg">Nessun backup disponibile.</p>'; return; }
      backupsEl.innerHTML = `<table class="dt-table"><thead><tr class="dt-head"><th>Data</th><th>Contenuto</th><th class="dt-actions-h"><span class="sr">Azioni</span></th></tr></thead><tbody>
        ${items.map((b, i) => `<tr class="dt-row"><td class="nowrap">${esc(b.label)}</td><td>${esc(b.what)}</td>
          <td class="dt-actions"><button type="button" class="btn" data-i="${i}">Ripristina</button></td></tr>`).join('')}</tbody></table>`;
      backupsEl.querySelectorAll('[data-i]').forEach(btn => btn.addEventListener('click', () => restore(items[Number(btn.dataset.i)])));
    } catch (err) {
      backupsEl.innerHTML = `<p class="dt-empty err">Impossibile leggere i backup: ${esc(err.message)}</p>`;
    }
  }

  async function restore(b) {
    const ok = await confirmDialog(`Ripristina ${b.what.toLowerCase()}`,
      `<p>Tornare alla versione del <strong>${esc(b.label)}</strong>?</p>
       <p class="muted">${b.kind === 'config' ? 'I backup più recenti di questo verranno eliminati. Per applicare la configurazione serve riavviare il programma.' : 'Il modello di stampa attuale viene sostituito.'}</p>`,
      { label: 'Ripristina', onConfirm: () => api(`/api/generic/restore-${b.kind === 'config' ? 'config' : 'report'}-backup`, { method: 'POST', body: { filename: b.filename } }) });
    if (ok) { toast(b.kind === 'config' ? 'Configurazione ripristinata: riavvia il programma per applicarla' : 'Modello di stampa ripristinato', 'ok', { timeout: 8000 }); loadBackups(); }
  }
  loadBackups();

  rows = section(el, 'Programma');
  const prog = document.createElement('div');
  prog.className = 'settings-actions';
  prog.innerHTML = `
    <button type="button" class="btn danger" data-a="restart">Riavvia il programma</button>
    <a class="btn" href="/logs/weighing-errors" data-a="log">Registro errori di pesatura</a>`;
  rows.appendChild(prog);
  prog.querySelector('[data-a="log"]').addEventListener('click', async e => {
    e.preventDefault();
    try {
      const res = await fetch('/logs/weighing-errors', { headers: { Authorization: `Bearer ${getToken()}` } });
      const text = await res.text();
      const pre = document.createElement('pre');
      pre.className = 'log-view';
      pre.textContent = text;
      openDialog({ title: 'Registro errori di pesatura', body: pre, wide: true });
    } catch (err) { toast(err.message, 'err'); }
  });
  prog.querySelector('[data-a="restart"]').addEventListener('click', async () => {
    const ok = await confirmDialog('Riavvia il programma',
      '<p>Riavviare il programma ora?</p><p class="muted">Le pese restano scollegate per qualche secondo: meglio farlo quando non ci sono pesate in corso.</p>',
      { label: 'Riavvia', kind: 'danger', onConfirm: () => api('/api/generic/restart', { method: 'POST' }) });
    if (ok) toast('Riavvio in corso… la pagina si ricollegherà da sola', 'warn', { timeout: 10000 });
  });
}
