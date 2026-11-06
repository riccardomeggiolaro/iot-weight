// Prenotazioni (schede Multiple, Permanenti, Transiti) e Pesate (storico di ogni pesata, voce di menu a sé).
// Le due sezioni condividono azioni e finestre, per questo stanno nello stesso modulo. Da qui si crea, modifica, conclude ed elimina una prenotazione,
// si apre il PDF di una pesata, si vedono le foto e si elimina l'ultima pesata.
// Modifiche ed eliminazioni bloccano il record sul server (websocket dell'anagrafica access).

import { api, getMe, openProtectedFile, downloadProtectedFile } from '../api.js';
import { AnagraficSocket } from '../anagrafic-socket.js';
import { createDataTable } from '../data-table.js';
import { anagraficInput } from '../anagrafic-input.js';
import { plant } from '../plant.js';
import { esc, toast, openDialog, confirmDialog, formatDateTime, formatKg } from '../ui.js';

const WRITABLE = 2;

const TABS = {
  multiple:   { label: 'Multiple',   kind: 'access', query: { excludeManuallyAccess: true, excludeTransitAccess: true, permanent: false }, create: 'Nuova prenotazione' },
  permanenti: { label: 'Permanenti', kind: 'access', query: { excludeManuallyAccess: true, excludeTransitAccess: true, permanent: true }, create: 'Nuova prenotazione permanente', permanent: true },
  transiti:   { label: 'Transiti',   kind: 'access', query: { transits: true }, create: 'Nuovo transito', transit: true },
};
const PESATE = { label: 'Pesate', kind: 'inout' };
const TAB_KEYS = Object.keys(TABS);

// Anagrafiche collegate a una prenotazione/pesata: chiave API, campo mostrato, etichetta
const LINKS = [
  { key: 'customer', field: 'social_reason', label: 'Cliente', secondary: r => r.cfpiva },
  { key: 'supplier', field: 'social_reason', label: 'Fornitore', secondary: r => r.cfpiva },
  { key: 'vector', field: 'social_reason', label: 'Vettore', secondary: r => r.cfpiva },
  { key: 'driver', field: 'social_reason', label: 'Autista', secondary: r => r.telephone },
  { key: 'material', field: 'description', label: 'Materiale' },
];

const STATUS = {
  // Stati del server: Attesa/Aperto (nessuna pesata, Aperto è usato dai transiti), Entrato, Chiusa
  Attesa: { label: 'In attesa', cls: 'info' },
  Aperto: { label: 'In attesa', cls: 'info' },
  Entrato: { label: 'In corso', cls: 'warn' },
  Chiusa: { label: 'Conclusa', cls: '' },
};

const ICON = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
};

function currentTab() {
  const sub = location.hash.replace(/^#\/?/, '').split('/')[1];
  return TAB_KEYS.includes(sub) ? sub : TAB_KEYS[0];
}

const useAnagrafic = key => plant.config?.use_anagrafic?.[key] !== false;
const name = (obj, field = 'social_reason') => obj?.[field] || '';
const dash = '<span class="muted">—</span>';
const cell = v => (v === null || v === undefined || v === '' ? dash : esc(v));

function waitingSince(a) {
  // il timer parte dall'ultima pesata, altrimenti dalla creazione della prenotazione
  const last = a.in_out?.length ? a.in_out[a.in_out.length - 1] : null;
  return last?.weight2?.date || last?.weight1?.date || a.date_created;
}
function elapsed(since) {
  const ms = Date.now() - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return `${d ? d + 'g ' : ''}${d || h ? h + 'h ' : ''}${m % 60}min`;
}
function operations(a) {
  const done = a.in_out?.filter(io => io.weight2 || io.idWeight2).length ?? 0;
  return a.number_in_out == null ? `${done} / ∞` : `${done} / ${a.number_in_out}`;
}
const pictures = io => [...(io.weight1?.weighing_pictures || []), ...(io.weight2?.weighing_pictures || [])];
const imgUrl = p => `/images${p.path_name.startsWith('/') ? '' : '/'}${p.path_name}`;

export function renderPrenotazioni(el) {
  const tab = currentTab();
  return renderSection(el, TABS[tab], tab);
}

export function renderPesate(el) {
  return renderSection(el, PESATE, null);
}

function renderSection(el, conf, tab) {
  let table = null;
  let socket = null;
  let destroyed = false;
  let canWrite = false;
  let tick = null;

  el.innerHTML = `
    <div class="page">
      ${tab ? `<nav class="tabs" aria-label="Prenotazioni">
        ${TAB_KEYS.map(t => `<a class="tab" href="#/prenotazioni/${t}" ${t === tab ? 'aria-current="page"' : ''}>${esc(TABS[t].label)}</a>`).join('')}
      </nav>` : ''}
      <div class="page-h">
        <h2>${esc(tab ? conf.label : 'Storico pesate')}</h2>
        <div class="page-actions"></div>
      </div>
      <div class="filter-bar">
        ${conf.kind === 'access' ? `
          <label class="field inline"><span>Stato</span>
            <select class="input" data-f="status">
              <option value="NOT_CLOSED" selected>Attive</option>
              <option value="${conf.transit ? 'OPEN' : 'WAITING'}">In attesa</option>
              <option value="ENTERED">In corso</option>
              <option value="CLOSED">Concluse</option>
              <option value="">Tutte</option>
            </select></label>` : ''}
        <label class="field inline"><span>${conf.kind === 'access' ? 'Create dal' : 'Pesate dal'}</span><input class="input" type="date" data-f="fromDate"></label>
        <label class="field inline"><span>al</span><input class="input" type="date" data-f="toDate"></label>
      </div>
      <div class="card table-card"></div>
    </div>`;
  const actionsEl = el.querySelector('.page-actions');
  const tableEl = el.querySelector('.table-card');
  const bar = {};
  el.querySelectorAll('[data-f]').forEach(i => {
    bar[i.dataset.f] = i;
    i.addEventListener('change', () => table?.search());
  });
  const barQuery = () => {
    const q = {};
    for (const [k, i] of Object.entries(bar)) if (i.value) q[k] = i.value;
    return q;
  };

  getMe().catch(() => ({ level: 0 })).then(me => {
    if (destroyed) return;
    canWrite = (me?.level ?? 0) >= WRITABLE;
    if (conf.kind === 'access') setupAccessTab(); else setupInOutTab();
    socket = new AnagraficSocket('access', ({ action }) => {
      if (['add', 'update', 'delete', 'call', 'cancel_call'].includes(action)) scheduleReload();
    });
  });

  let reloadTimer = null;
  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => table?.reload(), 300);
  }

  // ── Scheda prenotazioni (multiple / permanenti / transiti) ───────────────
  function setupAccessTab() {
    if (canWrite) {
      actionsEl.innerHTML = `<button type="button" class="btn primary" data-a="add">+ ${esc(conf.create)}</button>`;
      actionsEl.querySelector('[data-a="add"]').addEventListener('click', () => openAccessForm(null));
    }
    const cols = [
      { key: 'vehicle.plate', label: 'Targa', filter: 'text', upper: true, sortable: false, render: r => `<strong>${cell(r.vehicle?.plate)}</strong>${r.type === 'Manuale' ? ' <span class="badge" title="Accesso manuale">manuale</span>' : ''}` },
    ];
    if (plant.config?.use_badge) cols.push({ key: 'card_registry.number', label: 'Tessera', filter: 'text', upper: true, sortable: false, render: r => cell(r.card_registry?.number) });
    for (const l of LINKS) {
      if (!useAnagrafic(l.key)) continue;
      cols.push({ key: `${l.key}.${l.field}`, label: l.label, filter: 'text', sortable: false, render: r => cell(name(r[l.key], l.field)) });
    }
    if (!conf.transit) cols.push({ key: 'number_in_out', label: 'Operazioni', sortable: false, className: 'nowrap', render: r => esc(operations(r)) });
    cols.push(
      { key: 'status', label: 'Stato', sortable: false, render: r => { const s = STATUS[r.status] || { label: r.status, cls: '' }; return `<span class="badge ${s.cls}">${esc(s.label)}</span>`; } },
      { key: 'date_created', label: 'Creata il', sortable: false, className: 'nowrap', render: r => esc(formatDateTime(r.date_created)) },
      { key: 'waiting', label: 'Attesa', sortable: false, className: 'nowrap', render: r => (r.type === 'Prenotazione' && r.status !== 'Chiusa') ? `<span class="elapsed" data-since="${esc(waitingSince(r))}">${esc(elapsed(waitingSince(r)))}</span>` : '' },
    );

    table = createDataTable(tableEl, {
      columns: cols,
      empty: 'Nessuna prenotazione',
      load: async ({ limit, offset, filters }) => {
        const query = { limit, offset, ...conf.query, ...barQuery() };
        for (const [k, v] of Object.entries(filters)) query[k] = `%${v}%`;
        const res = await api('/api/anagrafic/access/list', { query });
        return { rows: res.data || [], total: res.total_rows || 0 };
      },
      rowClass: r => r.status === 'Chiusa' ? 'row-muted' : '',
      expand: r => accessDetail(r),
      actions: canWrite ? r => {
        const acts = [];
        const last = r.in_out?.[r.in_out.length - 1];
        if (r.status !== 'Chiusa' && last && (last.weight2 || last.idWeight2)) acts.push({ label: 'Concludi', icon: ICON.close, kind: 'primary', run: closeAccess });
        acts.push({ label: 'Modifica', icon: ICON.edit, run: editAccess });
        if (!r.in_out?.length) acts.push({ label: 'Elimina', icon: ICON.del, kind: 'danger', run: deleteAccess });
        return acts;
      } : null,
    });

    // azioni nel dettaglio (pesate della prenotazione)
    tableEl.addEventListener('click', e => {
      const b = e.target.closest('[data-io]');
      if (!b) return;
      e.stopPropagation();
      const access = table.rows.find(a => a.id === Number(b.dataset.access));
      const io = access?.in_out?.find(x => x.id === Number(b.dataset.io));
      if (!io) return;
      if (b.dataset.do === 'pdf') openPdf(io);
      else if (b.dataset.do === 'undo') deleteLastWeighing(access, io);
      else if (b.dataset.do === 'img') showPictures(io, Number(b.dataset.n || 0));
    });

    tick = setInterval(() => {
      tableEl.querySelectorAll('.elapsed[data-since]').forEach(s => { s.textContent = elapsed(s.dataset.since); });
    }, 30000);
  }

  function accessDetail(a) {
    const rows = [];
    const info = [
      ['Riferimento documento', a.document_reference],
      ['Note', a.note],
    ].filter(([, v]) => v);
    if (info.length) rows.push(`<dl class="kv detail-kv">${info.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`);
    if (!a.in_out?.length) {
      rows.push('<p class="muted">Nessuna pesata effettuata.</p>');
      return rows.join('');
    }
    const list = [...a.in_out].reverse();
    rows.push(`<table class="sub-table"><thead><tr>
        <th>1ª pesata</th><th class="num">Peso 1</th><th>2ª pesata</th><th class="num">Peso 2</th><th class="num">Netto</th><th>Materiale</th><th></th>
      </tr></thead><tbody>${list.map((io, i) => {
        const pics = pictures(io);
        const isLast = i === 0;
        return `<tr>
          <td>${io.weight1 ? `${esc(formatDateTime(io.weight1.date))}<br><small class="muted">${esc(io.weight1.pid || '')}</small>` : dash}</td>
          <td class="num">${io.weight1 ? esc(formatKg(io.weight1.weight)) : dash}</td>
          <td>${io.weight2 ? `${esc(formatDateTime(io.weight2.date))}<br><small class="muted">${esc(io.weight2.pid || '')}</small>` : dash}</td>
          <td class="num">${io.weight2 ? esc(formatKg(io.weight2.weight)) : dash}</td>
          <td class="num"><strong>${io.net_weight != null ? esc(formatKg(io.net_weight)) + ' kg' : dash}</strong></td>
          <td>${cell(io.material?.description)}</td>
          <td class="dt-actions">
            ${pics.length ? `<button type="button" class="thumb-btn" data-io="${io.id}" data-access="${a.id}" data-do="img" title="Foto (${pics.length})"><img src="${esc(imgUrl(pics[0]))}" alt="Foto della pesata" loading="lazy"><span>${pics.length}</span></button>` : ''}
            ${io.weight1 || io.weight2 ? `<button type="button" class="dt-act" data-io="${io.id}" data-access="${a.id}" data-do="pdf" title="PDF della pesata" aria-label="PDF della pesata">${ICON.pdf}</button>` : ''}
            ${canWrite && isLast && a.status !== 'Chiusa' ? `<button type="button" class="dt-act danger" data-io="${io.id}" data-access="${a.id}" data-do="undo" title="Elimina l'ultima pesata" aria-label="Elimina l'ultima pesata">${ICON.undo}</button>` : ''}
          </td></tr>`;
      }).join('')}</tbody></table>`);
    return rows.join('');
  }

  // ── Form prenotazione ─────────────────────────────────────────────────────
  function openAccessForm(rec) {
    const isEdit = !!rec;
    const permanent = isEdit ? rec.number_in_out == null : !!conf.permanent;
    const showOps = !conf.transit && !permanent && rec?.type !== 'Manuale';
    const body = document.createElement('div');
    body.className = 'form-grid';

    const inputs = {};
    inputs.vehicle = anagraficInput({ name: 'vehicle', field: 'plate', label: 'Targa', upper: true, required: true, value: rec?.vehicle, secondary: r => r.description });
    body.appendChild(inputs.vehicle.el);
    if (plant.config?.use_badge) {
      inputs.card = anagraficInput({ name: 'card-registry', field: 'number', label: 'Tessera', upper: true, allowNew: false, value: rec?.card_registry, secondary: r => r.code });
      body.appendChild(inputs.card.el);
    }
    if (showOps) {
      const done = rec?.in_out?.length || 0;
      const f = document.createElement('label');
      f.className = 'field';
      f.innerHTML = `<span>Numero di operazioni</span><input class="input" type="number" name="number_in_out" min="${Math.max(1, done)}" max="99" step="1" required value="${esc(rec?.number_in_out ?? 1)}">`;
      body.appendChild(f);
    }
    const section = document.createElement('div');
    section.className = 'form-section';
    section.textContent = 'Anagrafiche';
    body.appendChild(section);
    for (const l of LINKS) {
      if (!useAnagrafic(l.key)) continue;
      inputs[l.key] = anagraficInput({ name: l.key, field: l.field, label: l.label, value: rec?.[l.key], secondary: l.secondary });
      body.appendChild(inputs[l.key].el);
    }
    const extra = [];
    if (useAnagrafic('document_reference')) extra.push(['document_reference', 'Riferimento documento']);
    if (useAnagrafic('note')) extra.push(['note', 'Note']);
    for (const [k, label] of extra) {
      const f = document.createElement('label');
      f.className = `field ${k === 'note' ? 'wide' : ''}`;
      f.innerHTML = `<span>${esc(label)} <em class="muted">(facoltativo)</em></span>${k === 'note'
        ? `<textarea class="input" name="note" rows="2">${esc(rec?.note || '')}</textarea>`
        : `<input class="input" name="${k}" autocomplete="off" value="${esc(rec?.[k] || '')}">`}`;
      body.appendChild(f);
    }
    const hint = document.createElement('p');
    hint.className = 'muted form-hint';
    hint.innerHTML = 'Se scrivi un nome che non esiste ancora (<span class="ai-tag new">nuovo</span>), viene aggiunto alle anagrafiche al salvataggio.';
    body.appendChild(hint);

    const title = isEdit ? `Modifica ${conf.transit ? 'transito' : 'prenotazione'}${rec.vehicle?.plate ? ' ' + rec.vehicle.plate : ''}` : conf.create;
    return openDialog({
      title, body, wide: true,
      actions: [{ label: 'Annulla', value: null }, { label: 'Salva', kind: 'primary', submit: true }],
      onSubmit: async form => {
        const err = inputs.card?.validate();
        if (err) throw new Error(`La tessera "${inputs.card.input.value.trim()}" non esiste: registrala prima in Anagrafiche › Tessere`);
        const payload = {};
        const v = inputs.vehicle.value(isEdit);
        if (v !== undefined) payload.vehicle = v;
        for (const l of LINKS) {
          if (!inputs[l.key]) continue;
          const val = inputs[l.key].value(isEdit);
          if (val !== undefined) payload[l.key] = val;
        }
        if (inputs.card) {
          const id = inputs.card.selectedId();
          if (!isEdit || id !== (rec.card_registry?.id ?? null)) payload.idCardRegistry = id ?? -1;
        }
        for (const [k] of extra) {
          const val = form.elements[k].value.trim();
          if (!isEdit || val !== (rec[k] || '')) payload[k] = val;
        }
        if (showOps) {
          const n = Number(form.elements.number_in_out.value);
          if (!isEdit || n !== rec.number_in_out) payload.number_in_out = n;
        }
        if (isEdit) {
          await api(`/api/anagrafic/access/${rec.id}`, { method: 'PATCH', body: payload });
        } else {
          if (!payload.vehicle?.id && !payload.vehicle?.plate) throw new Error('Inserisci la targa');
          if (permanent || conf.transit) payload.number_in_out = null;
          payload.type = 'RESERVATION';
          payload.mode = conf.transit ? 'TRANSIT' : 'STANDARD';
          await api('/api/anagrafic/access', { method: 'POST', body: payload });
        }
      },
    }).then(saved => {
      if (saved) { toast(isEdit ? 'Prenotazione modificata' : `${conf.transit ? 'Transito creato' : 'Prenotazione creata'}`, 'ok'); table?.reload(); }
      return saved;
    });
  }

  async function withLock(id, type, fn) {
    try { await socket.lock(id, type, 'access'); } catch (err) { toast(err.message, 'warn'); return; }
    try { await fn(); } finally { socket.unlock(id, type, 'access'); }
  }

  const editAccess = r => withLock(r.id, 'UPDATE', () => openAccessForm(r));

  const closeAccess = r => withLock(r.id, 'UPDATE', async () => {
    const ok = await confirmDialog('Concludi prenotazione',
      `<p>Concludere la prenotazione di <strong>${esc(r.vehicle?.plate || '#' + r.id)}</strong>?</p>
       <p class="muted">Non saranno più possibili altre pesate con questa prenotazione.</p>`,
      { label: 'Concludi', onConfirm: () => api(`/api/anagrafic/access/close/${r.id}`) });
    if (ok) { toast('Prenotazione conclusa', 'ok'); table?.reload(); }
  });

  const deleteAccess = r => withLock(r.id, 'DELETE', async () => {
    const ok = await confirmDialog('Elimina prenotazione',
      `<p>Eliminare la prenotazione di <strong>${esc(r.vehicle?.plate || '#' + r.id)}</strong>?</p><p class="muted">L'operazione non si può annullare.</p>`,
      { label: 'Elimina', kind: 'danger', onConfirm: () => api(`/api/anagrafic/access/${r.id}`, { method: 'DELETE' }) });
    if (ok) { toast('Prenotazione eliminata', 'ok'); table?.reload(); }
  });

  function deleteLastWeighing(access, io) {
    const w = io.weight2 || io.weight1;
    return withLock(access.id, 'DELETE', async () => {
      const ok = await confirmDialog('Elimina ultima pesata',
        `<p>Eliminare l'ultima pesata di <strong>${esc(access.vehicle?.plate || '#' + access.id)}</strong>${w?.pid ? ` (PID <strong>${esc(w.pid)}</strong>)` : ''}?</p>
         <p class="muted">La pesata viene tolta dalla prenotazione, che torna in corso (o in attesa, se non restano pesate). L'operazione non si può annullare.</p>`,
        { label: 'Elimina pesata', kind: 'danger', onConfirm: () => api(`/api/anagrafic/access/last-weighing/${access.id}`, { method: 'DELETE' }) });
      if (ok) { toast('Ultima pesata eliminata', 'ok'); table?.reload(); }
    });
  }

  function openPdf(io) {
    openProtectedFile(`/api/anagrafic/access/in-out/pdf/${io.id}`).catch(err => toast(`PDF non disponibile: ${err.message}`, 'err'));
  }

  function showPictures(io, start = 0) {
    const pics = pictures(io);
    if (!pics.length) return;
    let i = Math.min(start, pics.length - 1);
    const box = document.createElement('div');
    box.className = 'gallery';
    const draw = () => {
      box.innerHTML = `<img src="${esc(imgUrl(pics[i]))}" alt="Foto ${i + 1} di ${pics.length}">
        ${pics.length > 1 ? `<div class="gallery-nav"><button type="button" class="btn" data-g="-1" aria-label="Foto precedente">‹</button>
        <span class="muted">${i + 1} / ${pics.length}</span><button type="button" class="btn" data-g="1" aria-label="Foto successiva">›</button></div>` : ''}`;
    };
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-g]');
      if (b) { i = (i + Number(b.dataset.g) + pics.length) % pics.length; draw(); }
    });
    draw();
    openDialog({ title: 'Foto della pesata', body: box, wide: true });
  }

  // ── Scheda pesate (una riga per pesata) ──────────────────────────────────
  function setupInOutTab() {
    actionsEl.innerHTML = `
      <button type="button" class="btn" data-a="xlsx">Esporta Excel</button>
      <button type="button" class="btn" data-a="pdf">Esporta PDF</button>`;
    actionsEl.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => exportInOut(b.dataset.a, b)));

    const cols = [
      { key: 'access.vehicle.plate', label: 'Targa', filter: 'text', upper: true, sortable: false, render: r => `<strong>${cell(r.access?.vehicle?.plate)}</strong>` },
    ];
    for (const l of LINKS) {
      if (!useAnagrafic(l.key)) continue;
      cols.push({ key: `${l.key}.${l.field}`, label: l.label, filter: 'text', sortable: false, render: r => cell(name(r[l.key], l.field)) });
    }
    cols.push(
      { key: 'weight1', label: '1ª pesata', sortable: false, className: 'nowrap', render: r => r.weight1 ? `${esc(formatDateTime(r.weight1.date))}<br><small class="muted">${esc(r.weight1.pid || '')}</small>` : dash },
      { key: 'weight1.weight', label: 'Peso 1', sortable: false, className: 'num', render: r => r.weight1 ? esc(formatKg(r.weight1.weight)) : (r.weight2?.tare ? `${esc(formatKg(r.weight2.tare))} <small class="muted">tara</small>` : dash) },
      { key: 'weight2', label: '2ª pesata', sortable: false, className: 'nowrap', render: r => r.weight2 ? `${esc(formatDateTime(r.weight2.date))}<br><small class="muted">${esc(r.weight2.pid || '')}</small>` : dash },
      { key: 'weight2.weight', label: 'Peso 2', sortable: false, className: 'num', render: r => r.weight2 ? esc(formatKg(r.weight2.weight)) : dash },
      { key: 'net_weight', label: 'Netto', sortable: false, className: 'num', render: r => r.net_weight != null ? `<strong>${esc(formatKg(r.net_weight))}</strong>` : dash },
    );

    table = createDataTable(tableEl, {
      columns: cols,
      empty: 'Nessuna pesata',
      load: async ({ limit, offset, filters }) => {
        const query = { limit, offset, ...barQuery() };
        for (const [k, v] of Object.entries(filters)) query[k] = `%${v}%`;
        const res = await api('/api/anagrafic/access/in-out/list', { query });
        return { rows: res.data || [], total: res.total_rows || 0 };
      },
      expand: r => inOutDetail(r),
      actions: r => {
        const acts = [];
        if (r.weight1 || r.weight2) acts.push({ label: 'PDF della pesata', icon: ICON.pdf, run: openPdf });
        if (canWrite) {
          acts.push({ label: 'Modifica dati della pesata', icon: ICON.edit, run: editInOut });
          if (r.is_last && r.access?.status !== 'Chiusa') acts.push({ label: "Elimina l'ultima pesata", icon: ICON.undo, kind: 'danger', run: io => deleteLastWeighing(io.access || { id: io.idAccess }, io) });
        }
        return acts;
      },
    });
    tableEl.addEventListener('click', e => {
      const b = e.target.closest('[data-do="img"]');
      if (!b) return;
      e.stopPropagation();
      const io = table.rows.find(x => x.id === Number(b.dataset.io));
      if (io) showPictures(io, Number(b.dataset.n || 0));
    });
  }

  function inOutDetail(io) {
    const a = io.access || {};
    const info = [
      ['Accesso', a.type ? `${a.type}${a.mode === 'Transito' ? ' (transito)' : ''} · ${(STATUS[a.status] || { label: a.status }).label}` : null],
      ['Tessera', a.card_registry?.number],
      ['Operatore', io.weight1?.operator?.description || io.weight2?.operator?.description],
      ['Riferimento documento', io.document_reference],
      ['Note', io.note],
    ].filter(([, v]) => v);
    const pics = pictures(io);
    return `${info.length ? `<dl class="kv detail-kv">${info.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      ${pics.length ? `<div class="thumbs">${pics.map((p, n) => `<button type="button" class="thumb-btn" data-io="${io.id}" data-do="img" data-n="${n}" title="Foto ${n + 1}"><img src="${esc(imgUrl(p))}" alt="Foto ${n + 1} della pesata" loading="lazy"></button>`).join('')}</div>` : ''}
      ${!info.length && !pics.length ? '<p class="muted">Nessun altro dato.</p>' : ''}`;
  }

  function editInOut(io) {
    const idAccess = io.idAccess || io.access?.id;
    return withLock(idAccess, 'UPDATE', () => {
      const body = document.createElement('div');
      body.className = 'form-grid';
      const inputs = {};
      for (const l of LINKS) {
        if (!useAnagrafic(l.key)) continue;
        inputs[l.key] = anagraficInput({ name: l.key, field: l.field, label: l.label, value: io[l.key], secondary: l.secondary });
        body.appendChild(inputs[l.key].el);
      }
      const extra = [];
      if (useAnagrafic('document_reference')) extra.push(['document_reference', 'Riferimento documento']);
      if (useAnagrafic('note')) extra.push(['note', 'Note']);
      for (const [k, label] of extra) {
        const f = document.createElement('label');
        f.className = `field ${k === 'note' ? 'wide' : ''}`;
        f.innerHTML = `<span>${esc(label)} <em class="muted">(facoltativo)</em></span>${k === 'note'
          ? `<textarea class="input" name="note" rows="2">${esc(io.note || '')}</textarea>`
          : `<input class="input" name="${k}" autocomplete="off" value="${esc(io[k] || '')}">`}`;
        body.appendChild(f);
      }
      return openDialog({
        title: `Modifica pesata${io.access?.vehicle?.plate ? ' ' + io.access.vehicle.plate : ''}`,
        body, wide: true,
        actions: [{ label: 'Annulla', value: null }, { label: 'Salva', kind: 'primary', submit: true }],
        onSubmit: async form => {
          const payload = {};
          for (const l of LINKS) {
            if (!inputs[l.key]) continue;
            const val = inputs[l.key].value(true);
            if (val !== undefined) payload[l.key] = val;
          }
          for (const [k] of extra) {
            const val = form.elements[k].value.trim();
            if (val !== (io[k] || '')) payload[k] = val;
          }
          await api(`/api/anagrafic/access/${idAccess}`, { method: 'PATCH', body: payload, query: { idInOut: io.id } });
        },
      }).then(saved => { if (saved) { toast('Pesata modificata', 'ok'); table?.reload(); } });
    });
  }

  async function exportInOut(type, btn) {
    const qs = new URLSearchParams(barQuery());
    for (const [k, v] of Object.entries(table?.filters || {})) qs.set(k, `%${v}%`);
    btn.disabled = true;
    try {
      await downloadProtectedFile(`/api/anagrafic/access/export/${type}?${qs}`, `pesate_${new Date().toISOString().slice(0, 10)}.${type}`);
    } catch (err) {
      toast(`Esportazione non riuscita: ${err.message}`, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  return () => {
    destroyed = true;
    clearTimeout(reloadTimer);
    clearInterval(tick);
    table?.destroy();
    socket?.close();
  };
}
