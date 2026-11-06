// Anagrafiche: veicoli, clienti, fornitori, vettori, materiali, autisti, tessere.
// Una scheda per anagrafica (#/anagrafiche/<scheda>), con ricerca, ordinamento,
// paginazione, inserimento, modifica ed eliminazione (con blocco del record),
// import da file CSV/Excel e aggiornamento in tempo reale.

import { api, getMe, uploadFile } from '../api.js';
import { AnagraficSocket } from '../anagrafic-socket.js';
import { createDataTable } from '../data-table.js';
import { esc, toast, openDialog, confirmDialog, formatDateTime, formatKg } from '../ui.js';

// Livelli utente (applications/utils/utils_auth.py)
const WRITABLE = 2;
const SUPER_ADMIN = 4;

const ENTITIES = {
  veicoli: {
    name: 'vehicle', label: 'Veicoli', one: 'veicolo', article: 'il', gender: 'o',
    title: r => r.plate,
    fields: [
      { key: 'plate', label: 'Targa', required: true, upper: true, filter: true },
      { key: 'description', label: 'Descrizione', filter: true },
      { key: 'tare', label: 'Tara (kg)', type: 'number', min: 1, step: 1, render: r => r.tare ? formatKg(r.tare) : null },
      { key: 'max_threshold', label: 'Soglia massima (kg)', type: 'number', min: 1, step: 1, render: r => r.max_threshold ? formatKg(r.max_threshold) : null },
    ],
    upload: true,
  },
  clienti: {
    name: 'customer', label: 'Clienti', one: 'cliente', article: 'il', gender: 'o',
    title: r => r.social_reason,
    fields: [
      { key: 'social_reason', label: 'Ragione sociale', required: true, filter: true },
      { key: 'description', label: 'Descrizione', filter: true },
      { key: 'code', label: 'Codice', filter: true, formLabel: 'Codice cliente', hint: 'del gestionale' },
    ],
    upload: true,
  },
  fornitori: {
    name: 'supplier', label: 'Fornitori', one: 'fornitore', article: 'il', gender: 'o',
    title: r => r.social_reason,
    fields: [
      { key: 'social_reason', label: 'Ragione sociale', required: true, filter: true },
      { key: 'description', label: 'Descrizione', filter: true },
      { key: 'code', label: 'Codice', filter: true, formLabel: 'Codice fornitore', hint: 'del gestionale' },
    ],
    upload: true,
  },
  vettori: {
    name: 'vector', label: 'Vettori', one: 'vettore', article: 'il', gender: 'o',
    title: r => r.social_reason,
    fields: [
      { key: 'social_reason', label: 'Ragione sociale', required: true, filter: true },
      { key: 'description', label: 'Descrizione', filter: true },
      { key: 'code', label: 'Codice', filter: true, formLabel: 'Codice vettore', hint: 'del gestionale' },
    ],
    upload: true,
  },
  materiali: {
    name: 'material', label: 'Materiali', one: 'materiale', article: 'il', gender: 'o',
    title: r => r.description,
    fields: [
      { key: 'description', label: 'Descrizione', required: true, filter: true },
      { key: 'code', label: 'Codice', filter: true, formLabel: 'Codice materiale', hint: 'del gestionale' },
    ],
    upload: true,
  },
  autisti: {
    name: 'driver', label: 'Autisti', one: 'autista', article: "l'", gender: 'o',
    title: r => r.social_reason,
    fields: [
      { key: 'social_reason', label: 'Nome e cognome', required: true, filter: true },
      { key: 'description', label: 'Descrizione', filter: true },
      { key: 'code', label: 'Codice', filter: true, formLabel: 'Codice autista', hint: 'del gestionale' },
    ],
    upload: true,
  },
  tessere: {
    name: 'card-registry', label: 'Tessere', one: 'tessera', article: 'la', gender: 'a',
    title: r => r.number,
    fields: [
      { key: 'number', label: 'Numero', required: true, filter: true },
      { key: 'code', label: 'Codice badge', required: true, filter: true },
    ],
    writeLevel: SUPER_ADMIN,
  },
};
const TABS = Object.keys(ENTITIES);

const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>';
const ICON_RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7"/><path d="M4 4v4.7h4.7"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

function currentTab() {
  const sub = location.hash.replace(/^#\/?/, '').split('/')[1];
  return TABS.includes(sub) ? sub : TABS[0];
}
// #/anagrafiche/<scheda>/archiviate mostra le anagrafiche archiviate
const showingArchived = () => location.hash.replace(/^#\/?/, '').split('/')[2] === 'archiviate';

export function renderAnagrafiche(el) {
  const tab = currentTab();
  const ent = ENTITIES[tab];
  const archived = showingArchived();
  let table = null;
  let socket = null;
  let destroyed = false;

  el.innerHTML = `
    <div class="page">
      <nav class="tabs" aria-label="Anagrafiche">
        ${TABS.map(t => `<a class="tab" href="#/anagrafiche/${t}" ${t === tab ? 'aria-current="page"' : ''}>${esc(ENTITIES[t].label)}</a>`).join('')}
      </nav>
      <div class="page-h">
        <h2>${esc(ent.label)}${archived ? ' <span class="badge">archiviati</span>' : ''}</h2>
        <div class="page-actions"></div>
      </div>
      <div class="card table-card"></div>
    </div>`;
  const actionsEl = el.querySelector('.page-actions');
  const tableEl = el.querySelector('.table-card');

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const nameOf = r => ent.title(r) || `#${r.id}`;

  getMe().catch(() => ({ level: 0 })).then(me => {
    if (destroyed) return;
    const canWrite = (me?.level ?? 0) >= (ent.writeLevel || WRITABLE);

    const archiveLink = archived
      ? `<a class="btn" href="#/anagrafiche/${tab}">‹ Torna agli attivi</a>`
      : `<a class="btn" href="#/anagrafiche/${tab}/archiviate" title="Anagrafiche già usate ed eliminate: restano per lo storico e si possono ripristinare">Archiviati</a>`;
    actionsEl.innerHTML = archiveLink;
    if (canWrite && !archived) {
      actionsEl.insertAdjacentHTML('beforeend', `
        ${ent.upload ? `<button type="button" class="btn" data-a="import">Importa da file</button>` : ''}
        <button type="button" class="btn primary" data-a="add">+ Nuov${ent.gender} ${esc(ent.one)}</button>`);
      actionsEl.querySelector('[data-a="add"]').addEventListener('click', () => openForm(null));
      actionsEl.querySelector('[data-a="import"]')?.addEventListener('click', openImport);
    }

    table = createDataTable(tableEl, {
      columns: [
        ...ent.fields.map(f => ({ key: f.key, label: f.label, filter: f.filter ? 'text' : null, upper: f.upper, render: f.render ? r => { const v = f.render(r); return v == null ? '<span class="muted">—</span>' : esc(v); } : null, className: f.type === 'number' ? 'num' : '' })),
        { key: 'date_created', label: 'Creato il', render: r => esc(formatDateTime(r.date_created)), className: 'nowrap' },
      ],
      defaultSort: null,
      empty: `Nessun${ent.gender === 'a' ? 'a' : ''} ${ent.one}${archived ? ` archiviat${ent.gender}` : ''}`,
      load: async ({ limit, offset, filters, sort }) => {
        const query = { limit, offset, archived };
        for (const [k, v] of Object.entries(filters)) query[k] = `%${v}%`;
        if (sort) { query.order_by = sort.key; query.order_direction = sort.dir; }
        const res = await api(`/api/anagrafic/${ent.name}/list`, { query });
        return { rows: res.data || [], total: res.total_rows || 0 };
      },
      actions: !canWrite ? null : archived ? () => [
        { label: 'Ripristina', icon: ICON_RESTORE, kind: 'primary', run: r => restore(r) },
      ] : () => [
        { label: 'Modifica', icon: ICON_EDIT, run: r => edit(r) },
        { label: 'Elimina', icon: ICON_DELETE, kind: 'danger', run: r => remove(r) },
      ],
    });

    socket = new AnagraficSocket(ent.name, ({ action }) => {
      if (['add', 'update', 'delete'].includes(action)) scheduleReload();
    });
  });

  let reloadTimer = null;
  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => table?.reload(), 250);
  }

  // ── Form inserimento / modifica ──────────────────────────
  function formHtml(rec) {
    return `<div class="form-grid">${ent.fields.map(f => {
      const v = rec?.[f.key];
      return `<label class="field"><span>${esc(f.formLabel || f.label)}${f.required ? '' : ` <em class="muted">(${f.hint ? esc(f.hint) + ', ' : ''}facoltativo)</em>`}</span>
        <input class="input" name="${esc(f.key)}" type="${f.type || 'text'}" value="${esc(v ?? '')}" autocomplete="off"
          ${f.required ? 'required' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.upper ? 'data-upper' : ''}></label>`;
    }).join('')}</div>`;
  }

  function readForm(form, isEdit) {
    const body = {};
    for (const f of ent.fields) {
      const raw = form.elements[f.key].value.trim();
      if (f.type === 'number') {
        if (raw === '') { if (isEdit) body[f.key] = -1; continue; } // -1 = svuota il campo
        body[f.key] = Math.round(Number(raw));
      } else {
        // in modifica la stringa vuota svuota il campo; in inserimento diventa null
        body[f.key] = f.upper ? raw.toUpperCase() : raw;
      }
    }
    return body;
  }

  function openForm(rec) {
    const isEdit = !!rec;
    const p = openDialog({
      title: isEdit ? `Modifica ${ent.one}` : `Nuov${ent.gender} ${ent.one}`,
      body: formHtml(rec),
      actions: [{ label: 'Annulla', value: null }, { label: 'Salva', kind: 'primary', submit: true }],
      onSubmit: async form => {
        const body = readForm(form, isEdit);
        if (isEdit) await api(`/api/anagrafic/${ent.name}/${rec.id}`, { method: 'PATCH', body });
        else await api(`/api/anagrafic/${ent.name}`, { method: 'POST', body });
      },
    });
    document.querySelectorAll('dialog [data-upper]').forEach(i => i.addEventListener('input', () => {
      const pos = i.selectionStart; i.value = i.value.toUpperCase(); i.setSelectionRange(pos, pos);
    }));
    return p.then(saved => {
      if (saved) {
        toast(`${cap(ent.one)} ${isEdit ? 'modificat' : 'salvat'}${ent.gender}`, 'ok');
        table?.reload();
      }
      return saved;
    });
  }

  async function edit(row) {
    let rec;
    try { rec = await socket.lock(row.id, 'UPDATE'); } catch (err) { toast(err.message, 'warn'); return; }
    try { await openForm(rec || row); } finally { socket.unlock(row.id, 'UPDATE'); }
  }

  async function remove(row) {
    let rec;
    try { rec = await socket.lock(row.id, 'DELETE'); } catch (err) { toast(err.message, 'warn'); return; }
    try {
      let result = null;
      const ok = await confirmDialog(`Elimina ${ent.one}`,
        `<p>Vuoi eliminare ${esc(ent.article)}${ent.article.endsWith("'") ? '' : ' '}${esc(ent.one)} <strong>${esc(nameOf(rec || row))}</strong>?</p>
         <p class="muted">Se è già stat${ent.gender} usat${ent.gender} in prenotazioni o pesate viene archiviat${ent.gender}: sparisce dagli elenchi
         ma resta nello storico, e si può ripristinare da “Archiviati”.</p>`,
        { label: 'Elimina', kind: 'danger', onConfirm: async () => { result = await api(`/api/anagrafic/${ent.name}/${row.id}`, { method: 'DELETE' }); } });
      if (ok) {
        toast(result?.archived ? `${cap(ent.one)} archiviat${ent.gender}: era già usat${ent.gender} nello storico` : `${cap(ent.one)} eliminat${ent.gender}`, 'ok');
        table?.reload();
      }
    } finally {
      socket.unlock(row.id, 'DELETE');
    }
  }

  async function restore(row) {
    try {
      await api(`/api/anagrafic/${ent.name}/${row.id}/restore`, { method: 'POST' });
      toast(`${cap(ent.one)} ripristinat${ent.gender}`, 'ok', { action: { label: 'Vai agli attivi', run: () => { location.hash = `#/anagrafiche/${tab}`; } } });
      table?.reload();
    } catch (err) { toast(err.message, 'err'); }
  }

  // ── Import da file ───────────────────────────────────────
  function openImport() {
    const cols = ent.fields.map(f => `<code>${esc(f.key)}</code>`).join(', ');
    openDialog({
      title: `Importa ${ent.label.toLowerCase()} da file`,
      body: `
        <p>Carica un file <strong>CSV</strong> o <strong>Excel (.xlsx)</strong>. La prima riga deve contenere i nomi delle colonne:</p>
        <p class="import-cols">${cols}</p>
        <p class="muted">Le colonne mancanti restano vuote; colonne con altri nomi non sono accettate.</p>
        <label class="field"><span>File</span><input class="input" type="file" name="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></label>`,
      actions: [{ label: 'Annulla', value: null }, { label: 'Importa', kind: 'primary', submit: true }],
      onSubmit: async form => {
        const file = form.elements.file.files[0];
        const ext = file.name.split('.').pop().toLowerCase();
        const type = ext === 'csv' ? 'text/csv' : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : null;
        if (!type) throw new Error('Formato non supportato: usa un file .csv o .xlsx');
        // il server riconosce il formato dal tipo: lo imposto in base all'estensione (Windows manda .csv come Excel)
        let res;
        try {
          res = await uploadFile(`/api/anagrafic/${ent.name}/upload-file`, new File([file], file.name, { type }));
        } catch (err) {
          const m = /^Unexpected columns found: (.*)$/.exec(err.message);
          if (m) throw new Error(`Colonne non previste nel file: ${m[1]}`);
          const t = /^Column '(.+)' must be of type/.exec(err.message);
          if (t) throw new Error(`La colonna "${t[1]}" contiene valori non validi`);
          if (err.message === 'Error reading file') throw new Error('Impossibile leggere il file: controlla che sia un CSV o un Excel valido');
          throw err;
        }
        const n = parseInt(res?.message, 10);
        return Number.isFinite(n) ? n : true;
      },
    }).then(r => {
      if (r === null) return;
      toast(typeof r === 'number' ? `Import completato: ${r} righe caricate` : 'Import completato', 'ok');
      table?.reload();
    });
  }

  return () => {
    destroyed = true;
    clearTimeout(reloadTimer);
    table?.destroy();
    socket?.close();
  };
}
