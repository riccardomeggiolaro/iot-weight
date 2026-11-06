// Impostazioni › Pese e dispositivi: collegamenti (TCP o seriale), pese con terminale,
// documenti per tipo di pesata, fotocamere, sbarre/relè ed RFID.
// Nota: la modifica di una pesa sostituisce in blocco eventi, fotocamere e relè, quindi il form
// manda sempre la configurazione completa della pesa.

import { api } from '../api.js';
import { plant } from '../plant.js';
import { esc, toast, openDialog, confirmDialog } from '../ui.js';
import { SUPER_ADMIN, readonlyNotice } from './impostazioni.js';

const CFG = '/api/config-weigher';
const KINDS = [
  ['in', 'Entrata'],
  ['out', 'Uscita'],
  ['tare', 'Uscita con tara'],
  ['generic', 'Generica / test'],
];
const RELAY_EVENTS = [
  ['over_min', 'Mezzo sulla pesa', 'Quando il peso supera il minimo (es. chiudere la sbarra d\'ingresso).'],
  ['under_min', 'Pesa libera', 'Quando il peso torna sotto il minimo (es. riaprire la sbarra d\'ingresso).'],
  ['weighing_in', 'Dopo la pesata di entrata', 'Anche per le pesate generiche.'],
  ['weighing_out', 'Dopo la pesata di uscita', 'Anche per le uscite con tara.'],
];
const BEHAVIOUR = [
  ['need_take_of_weight_on_startup', 'Scaricare la pesa all\'avvio', 'Dopo l\'avvio del programma la pesa deve tornare a zero prima della prima pesata.'],
  ['need_take_of_weight_before_weighing', 'Scaricare la pesa tra due pesate', 'Il mezzo deve uscire dalla pesa prima della pesata successiva.'],
  ['continuous_transmission', 'Trasmissione continua', 'Il terminale invia il peso di continuo senza essere interrogato.'],
];
const ADVANCED = [
  ['maintaine_session_realtime_after_command', 'Mantieni la lettura del peso dopo un comando'],
  ['diagnostic_has_priority_than_realtime', 'La diagnostica ha priorità sulla lettura del peso'],
  ['always_execute_realtime_in_undeground', 'Leggi il peso anche quando nessuno lo sta guardando'],
];

const noneStr = v => (v == null || v === 'None' || v === 'null' ? '' : String(v));
const reloadAction = { label: 'Ricarica', run: () => location.reload() };

export function renderPese(el, { config, level }) {
  const ro = level < SUPER_ADMIN;
  let weighers = config.weighers || {};
  let terminals = [];
  let printers = [];

  el.innerHTML = `
    ${ro ? '' : `<div class="page-h"><p class="muted">Ogni collegamento è un cavo o un indirizzo di rete verso un terminale di pesatura, a cui sono collegate una o più pese.</p>
      <button type="button" class="btn primary" data-a="add-conn">+ Nuovo collegamento</button></div>`}
    <div class="pese-list"></div>`;
  if (ro) readonlyNotice(el.insertBefore(document.createElement('div'), el.firstChild));
  const list = el.querySelector('.pese-list');
  el.querySelector('[data-a="add-conn"]')?.addEventListener('click', () => connectionForm(null));

  const extras = Promise.all([
    api(`${CFG}/terminals`).catch(() => []),
    api('/api/printer/list').catch(() => []),
  ]).then(([t, p]) => {
    terminals = Array.isArray(t) ? t : [];
    printers = (Array.isArray(p) ? p : []).map(x => x.nome || x.name || x).filter(Boolean);
  });

  async function reload() {
    try { weighers = (await api(`${CFG}/configuration`)).weighers || {}; } catch (_) { /* resta l'ultimo stato */ }
    draw();
  }

  function weigherStatus(instance, name) {
    const w = plant.weighers.find(x => x.instanceName === instance && x.name === name);
    if (!w) return '<span class="badge">nuova: ricarica la pagina</span>';
    return w.connected ? '<span class="badge ok">collegata</span>' : '<span class="badge err">non collegata</span>';
  }

  function connLabel(c) {
    if (!c) return 'Collegamento non configurato';
    if (c.serial_port_name) return `Seriale ${c.serial_port_name} · ${c.baudrate || ''} baud`;
    return `Rete ${c.ip}:${c.port}`;
  }

  function draw() {
    const entries = Object.entries(weighers);
    if (!entries.length) {
      list.innerHTML = '<div class="placeholder"><h2>Nessuna pesa configurata</h2><p class="muted">Aggiungi un collegamento e poi le pese collegate.</p></div>';
      return;
    }
    list.innerHTML = entries.map(([inst, w]) => `
      <section class="card settings-section" data-inst="${esc(inst)}">
        <header class="settings-head-actions"><div><h3>Collegamento ${esc(inst)}</h3><p class="muted">${esc(connLabel(w.connection))}
          · pausa tra comandi ${esc(w.time_between_actions ?? '—')} s${w.auto_close_connection ? ' · chiude la connessione dopo ogni comando' : ''}</p></div>
          ${ro ? '' : `<span class="page-actions"><button type="button" class="btn" data-a="edit-conn">Modifica</button>
            <button type="button" class="btn" data-a="add-node">+ Aggiungi pesa</button>
            <button type="button" class="btn danger" data-a="del-conn">Elimina</button></span>`}</header>
        <div class="settings-rows">
          ${Object.entries(w.nodes || {}).map(([name, n]) => `
            <div class="settings-row" data-node="${esc(name)}">
              <span class="settings-text"><span class="settings-label">${esc(name)} ${weigherStatus(inst, name)}${n.run === false ? ' <span class="badge warn">disattivata</span>' : ''}</span>
                <span class="settings-help">Terminale ${esc(n.terminal || '—')} · da ${esc(n.min_weight)} a ${esc(n.max_weight)} kg, divisione ${esc(n.division)} kg
                  · ${(n.events?.weighing?.cams || []).length} fotocamere · ${Object.keys(n.rele || {}).length} relè</span></span>
              ${ro ? '' : `<span class="page-actions"><button type="button" class="btn" data-a="edit-node">Modifica</button>
                <button type="button" class="btn" data-a="rfid">RFID</button>
                <button type="button" class="btn danger" data-a="del-node" aria-label="Elimina la pesa ${esc(name)}">Elimina</button></span>`}
            </div>`).join('') || '<p class="muted backups-msg">Nessuna pesa su questo collegamento.</p>'}
        </div>
      </section>`).join('');
  }

  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-a]');
    if (!btn) return;
    const inst = btn.closest('[data-inst]')?.dataset.inst;
    const node = btn.closest('[data-node]')?.dataset.node;
    const a = btn.dataset.a;
    if (a === 'edit-conn') connectionForm(inst);
    else if (a === 'del-conn') deleteConnection(inst);
    else if (a === 'add-node') nodeForm(inst, null);
    else if (a === 'edit-node') nodeForm(inst, node);
    else if (a === 'del-node') deleteNode(inst, node);
    else if (a === 'rfid') rfidForm(inst, node);
  });

  // ── Collegamento ───────────────────────────────────────────────────────────
  async function connectionForm(inst) {
    const w = inst ? weighers[inst] : null;
    const c = w?.connection || {};
    const serial = !!c.serial_port_name;
    let ports = [];
    try { ports = (await api('/api/generic/list/serial-ports')).list_serial_ports || []; } catch (_) { /* nessuna porta */ }
    const portOptions = [...new Set([...ports.map(p => p.port), c.serial_port_name].filter(Boolean))];
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="segmented conn-type" role="radiogroup" aria-label="Tipo di collegamento">
        <label><input type="radio" name="kind" value="tcp" ${serial ? '' : 'checked'}><span>Rete (TCP/IP)</span></label>
        <label><input type="radio" name="kind" value="serial" ${serial ? 'checked' : ''}><span>Seriale</span></label>
      </div>
      <div class="form-grid kind-tcp">
        <label class="field"><span>Indirizzo IP</span><input class="input" name="ip" value="${esc(c.ip || '')}" placeholder="192.168.1.20"></label>
        <label class="field"><span>Porta</span><input class="input" name="port" type="number" min="1" max="65535" value="${esc(c.port || '')}"></label>
      </div>
      <div class="form-grid kind-serial">
        <label class="field"><span>Porta seriale</span><input class="input" name="serial_port_name" list="serial-ports" value="${esc(c.serial_port_name || '')}" placeholder="/dev/ttyUSB0">
          <datalist id="serial-ports">${portOptions.map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>
        <label class="field"><span>Velocità (baud)</span><select class="input" name="baudrate">${[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(b => `<option ${Number(c.baudrate || 19200) === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
      </div>
      <div class="form-grid">
        <label class="field"><span>Timeout (s)</span><input class="input" name="timeout" type="number" min="0.1" step="0.1" required value="${esc(c.timeout ?? 1)}"></label>
        <label class="field"><span>Pausa tra comandi (s)</span><input class="input" name="time_between_actions" type="number" min="0.1" step="0.1" required value="${esc(w?.time_between_actions ?? 0.3)}"></label>
        ${inst ? `<label class="check wide"><input type="checkbox" name="auto_close" ${w?.auto_close_connection ? 'checked' : ''}> Chiudi la connessione dopo ogni comando</label>` : ''}
      </div>`;
    const sync = () => {
      const kind = body.querySelector('input[name=kind]:checked').value;
      body.querySelector('.kind-tcp').hidden = kind !== 'tcp';
      body.querySelector('.kind-serial').hidden = kind !== 'serial';
      body.querySelectorAll('.kind-tcp input').forEach(i => { i.required = kind === 'tcp'; });
      body.querySelector('[name=serial_port_name]').required = kind === 'serial';
    };
    body.querySelectorAll('input[name=kind]').forEach(i => i.addEventListener('change', sync));
    sync();
    const saved = await openDialog({
      title: inst ? `Collegamento ${inst}` : 'Nuovo collegamento', body, wide: true,
      actions: [{ label: 'Annulla', value: null }, { label: 'Salva', kind: 'primary', submit: true }],
      onSubmit: async form => {
        const kind = form.querySelector('input[name=kind]:checked').value;
        const timeout = Number(form.elements.timeout.value);
        const tba = Number(form.elements.time_between_actions.value);
        const payload = kind === 'tcp'
          ? { ip: form.elements.ip.value.trim(), port: Number(form.elements.port.value), timeout, time_between_actions: tba }
          : { serial_port_name: form.elements.serial_port_name.value.trim(), baudrate: Number(form.elements.baudrate.value), timeout, time_between_actions: tba };
        if (inst) {
          await api(`${CFG}/instance/connection/${encodeURIComponent(inst)}`, { method: 'PATCH', body: payload });
          if (tba !== w.time_between_actions) await api(`${CFG}/instance/time-between-actions/${tba}`, { method: 'PATCH', query: { instance_name: inst } });
          const ac = form.elements.auto_close.checked;
          if (ac !== !!w.auto_close_connection) await api(`${CFG}/instance/auto-close-connection/${ac}`, { method: 'PATCH', query: { instance_name: inst } });
        } else {
          await api(`${CFG}/instance/connection`, { method: 'POST', body: payload });
        }
      },
    });
    if (saved) { toast(inst ? 'Collegamento aggiornato' : 'Collegamento creato: ora aggiungi le pese', 'ok'); reload(); }
  }

  async function deleteConnection(inst) {
    const n = Object.keys(weighers[inst]?.nodes || {}).length;
    const ok = await confirmDialog(`Elimina collegamento ${inst}`,
      `<p>Eliminare il collegamento ${esc(inst)}${n ? ` e le sue <strong>${n} pese</strong>` : ''}?</p><p class="muted">Le pesate già registrate restano.</p>`,
      { label: 'Elimina', kind: 'danger', onConfirm: () => api(`${CFG}/instance/connection/${encodeURIComponent(inst)}`, { method: 'DELETE' }) });
    if (ok) { toast('Collegamento eliminato', 'ok', { action: reloadAction }); reload(); }
  }

  // ── Pesa ───────────────────────────────────────────────────────────────────
  async function nodeForm(inst, name) {
    await extras; // elenco terminali e stampanti
    const n = name ? weighers[inst].nodes[name] : null;
    const ev = n?.events || {};
    const wev = ev.weighing || {};
    const body = document.createElement('div');
    body.className = 'node-form';
    const printerSelect = (kind) => {
      const current = noneStr(wev.printer?.[kind]);
      const opts = [...new Set([...printers, current].filter(Boolean))];
      return `<select class="input" name="printer_${kind}" aria-label="Stampante ${kind}"><option value="">Nessuna</option>${opts.map(p => `<option ${p === current ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>`;
    };
    const relayRows = (list) => (list || []).map(r => relayRow(r)).join('');
    const relayRow = (r = { rele: '1', set: 1, order: 0 }) => `
      <div class="mini-row"><input class="input" name="rele" value="${esc(r.rele)}" aria-label="Relè" placeholder="Relè" required>
        <select class="input" name="set" aria-label="Azione"><option value="1" ${Number(r.set) === 1 ? 'selected' : ''}>Attiva (1)</option><option value="0" ${Number(r.set) === 0 ? 'selected' : ''}>Disattiva (0)</option></select>
        <input class="input" name="order" type="number" min="0" value="${esc(r.order ?? 0)}" aria-label="Ordine" title="Ordine di esecuzione">
        <button type="button" class="dt-act danger" data-rm aria-label="Rimuovi">✕</button></div>`;
    const camRow = (c = { picture: '', live: '', active: true }) => `
      <div class="mini-row cam"><input class="input" name="picture" type="url" value="${esc(noneStr(c.picture))}" placeholder="URL della foto (http://…)" required aria-label="URL della foto">
        <input class="input" name="live" type="url" value="${esc(noneStr(c.live))}" placeholder="URL video live (facoltativo)" aria-label="URL video live">
        <label class="check"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> attiva</label>
        <button type="button" class="dt-act danger" data-rm aria-label="Rimuovi">✕</button></div>`;
    body.innerHTML = `
      <div class="form-section">Generale</div>
      <div class="form-grid">
        <label class="field"><span>Nome della pesa</span><input class="input" name="name" required pattern="[^\\s]+" title="Senza spazi" value="${esc(name || '')}" placeholder="P1"></label>
        <label class="field"><span>Terminale</span><select class="input" name="terminal" required>${[...new Set([...terminals, n?.terminal].filter(Boolean))].map(t => `<option ${t === n?.terminal ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="field"><span>Indirizzo sul terminale <em class="muted">(facoltativo)</em></span><input class="input" name="node" value="${esc(noneStr(n?.node))}"></label>
        <label class="field"><span>Peso minimo (kg)</span><input class="input" name="min_weight" type="number" min="1" required value="${esc(n?.min_weight ?? 500)}"></label>
        <label class="field"><span>Portata massima (kg)</span><input class="input" name="max_weight" type="number" min="1" required value="${esc(n?.max_weight ?? 60000)}"></label>
        <label class="field"><span>Divisione (kg)</span><input class="input" name="division" type="number" min="1" required value="${esc(n?.division ?? 20)}"></label>
        <label class="field"><span>Soglia di avviso (kg) <em class="muted">(facoltativo)</em></span><input class="input" name="max_theshold" type="number" min="1" value="${esc(n?.max_theshold ?? '')}"></label>
        <label class="check"><input type="checkbox" name="run" ${n?.run === false ? '' : 'checked'}> Pesa attiva</label>
      </div>
      <div class="form-section">Comportamento</div>
      <div class="checks">${BEHAVIOUR.map(([k, l, h]) => `<label class="check" title="${esc(h)}"><input type="checkbox" name="${k}" ${n ? (n[k] ? 'checked' : '') : (k === 'continuous_transmission' ? '' : 'checked')}> ${esc(l)}</label>`).join('')}</div>
      <details class="advanced"><summary>Opzioni avanzate del terminale</summary><div class="checks">
        ${ADVANCED.map(([k, l]) => `<label class="check"><input type="checkbox" name="${k}" ${n ? (n[k] ? 'checked' : '') : 'checked'}> ${esc(l)}</label>`).join('')}</div></details>
      <div class="form-section">Documenti per tipo di pesata</div>
      <table class="sub-table kinds"><thead><tr><th>Pesata</th><th>PDF</th><th>CSV</th><th>Stampante</th><th>Copie</th></tr></thead><tbody>
        ${KINDS.map(([k, l]) => `<tr><td>${esc(l)}</td>
          <td><input type="checkbox" name="report_${k}" aria-label="PDF ${esc(l)}" ${(n ? wev.report?.[k] : true) ? 'checked' : ''}></td>
          <td><input type="checkbox" name="csv_${k}" aria-label="CSV ${esc(l)}" ${(n ? wev.csv?.[k] : true) ? 'checked' : ''}></td>
          <td>${printerSelect(k)}</td>
          <td><input class="input copies" name="prints_${k}" type="number" min="1" max="9" value="${esc(wev.prints?.[k] ?? 1)}" aria-label="Copie ${esc(l)}"></td></tr>`).join('')}
      </tbody></table>
      <div class="form-section">Fotocamere <button type="button" class="btn small" data-add="cam">+ Aggiungi</button></div>
      <div class="mini-list" data-list="cam">${(wev.cams || []).map(camRow).join('')}</div>
      <div class="form-section">Sbarre e relè</div>
      ${RELAY_EVENTS.map(([k, l, h]) => {
        const rows = k === 'over_min' || k === 'under_min' ? ev.realtime?.[k]?.set_rele : wev.set_rele?.[k === 'weighing_in' ? 'in' : 'out'];
        return `<div class="relay-event"><div class="relay-h"><span><b>${esc(l)}</b> <span class="muted">${esc(h)}</span></span>
          <button type="button" class="btn small" data-add="${k}">+ Relè</button></div>
          <div class="mini-list" data-list="${k}">${relayRows(rows)}</div></div>`;
      }).join('')}`;

    body.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) {
        const listEl = body.querySelector(`[data-list="${add.dataset.add}"]`);
        listEl.insertAdjacentHTML('beforeend', add.dataset.add === 'cam' ? camRow() : relayRow());
        return;
      }
      const rm = e.target.closest('[data-rm]');
      if (rm) rm.closest('.mini-row').remove();
    });

    const saved = await openDialog({
      title: name ? `Pesa ${name}` : `Nuova pesa sul collegamento ${inst}`, body, wide: true,
      actions: [{ label: 'Annulla', value: null }, { label: 'Salva', kind: 'primary', submit: true }],
      onSubmit: async form => {
        const f = form.elements;
        const num = k => Number(f[k].value);
        const payload = {
          name: f.name.value.trim(),
          terminal: f.terminal.value,
          node: f.node.value.trim() || null,
          min_weight: num('min_weight'), max_weight: num('max_weight'), division: num('division'),
          max_theshold: f.max_theshold.value ? num('max_theshold') : null,
          run: f.run.checked,
          printer_name: n?.printer_name ?? null,
          number_of_prints: n?.number_of_prints ?? 1,
        };
        if (payload.min_weight >= payload.max_weight) throw new Error('Il peso minimo deve essere inferiore alla portata massima');
        for (const [k] of [...BEHAVIOUR, ...ADVANCED]) payload[k] = f[k].checked;
        for (const [k] of KINDS) {
          payload[`report_on_${k}`] = f[`report_${k}`].checked;
          payload[`csv_on_${k}`] = f[`csv_${k}`].checked;
          payload[`printer_name_${k}`] = f[`printer_${k}`].value || null;
          payload[`number_of_prints_${k}`] = Number(f[`prints_${k}`].value) || 1;
        }
        payload.cams = [...body.querySelectorAll('[data-list="cam"] .mini-row')].map(r => ({
          picture: r.querySelector('[name=picture]').value.trim(),
          live: r.querySelector('[name=live]').value.trim() || null,
          active: r.querySelector('[name=active]').checked,
        }));
        for (const [k] of RELAY_EVENTS) {
          payload[k] = [...body.querySelectorAll(`[data-list="${k}"] .mini-row`)].map(r => ({
            rele: r.querySelector('[name=rele]').value.trim(),
            set: Number(r.querySelector('[name=set]').value),
            order: Number(r.querySelector('[name=order]').value) || 0,
          }));
        }
        if (name) await api(`${CFG}/instance/node`, { method: 'PATCH', body: payload, query: { instance_name: inst, weigher_name: name } });
        else await api(`${CFG}/instance/node`, { method: 'POST', body: payload, query: { instance_name: inst } });
      },
    });
    if (saved) { toast(name ? 'Pesa aggiornata' : 'Pesa aggiunta', 'ok', { action: reloadAction }); reload(); }
  }

  async function deleteNode(inst, name) {
    const ok = await confirmDialog(`Elimina pesa ${name}`, `<p>Eliminare la pesa <strong>${esc(name)}</strong>?</p><p class="muted">Le pesate già registrate restano. Viene eliminato anche il lettore RFID collegato.</p>`,
      { label: 'Elimina', kind: 'danger', onConfirm: () => api(`${CFG}/instance/node`, { method: 'DELETE', query: { instance_name: inst, weigher_name: name } }) });
    if (ok) { toast('Pesa eliminata', 'ok', { action: reloadAction }); reload(); }
  }

  // ── RFID ───────────────────────────────────────────────────────────────────
  async function rfidForm(inst, name) {
    const q = { instance_name: inst, weigher_name: name };
    let current = null;
    try { current = await api(`${CFG}/instance/rfid`, { query: q }); } catch (_) { /* non configurato */ }
    const c = current?.connection || {};
    let ports = [];
    try { ports = (await api('/api/generic/list/serial-ports')).list_serial_ports || []; } catch (_) { /* nessuna porta */ }
    const result = await openDialog({
      title: `Lettore RFID della pesa ${name}`,
      body: `<p class="muted">Lettore di tessere collegato alla pesa: riconosce il mezzo dalla tessera.</p>
        <div class="form-grid">
          <label class="field"><span>Protocollo</span><select class="input" name="protocol">
            ${[['rfid', 'RFID seriale'], ['apromix', 'Apromix']].map(([v, l]) => `<option value="${v}" ${current?.protocol === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Porta seriale</span><input class="input" name="serial_port_name" list="rfid-ports" required value="${esc(c.serial_port_name || '')}" placeholder="/dev/ttyUSB1">
            <datalist id="rfid-ports">${ports.map(p => `<option value="${esc(p.port)}">`).join('')}</datalist></label>
          <label class="field"><span>Velocità (baud)</span><select class="input" name="baudrate">${[4800, 9600, 19200, 38400, 57600, 115200].map(b => `<option ${Number(c.baudrate || 9600) === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
          <label class="field"><span>Timeout (s)</span><input class="input" name="timeout" type="number" min="1" step="1" value="${esc(c.timeout ?? 1)}"></label>
        </div>`,
      actions: [
        { label: 'Annulla', value: null },
        ...(current ? [{ label: 'Rimuovi lettore', kind: 'danger', value: 'remove' }] : []),
        { label: 'Salva', kind: 'primary', submit: true },
      ],
      onSubmit: form => api(`${CFG}/instance/rfid`, { method: 'POST', query: q, body: {
        name, protocol: form.elements.protocol.value,
        connection: { serial_port_name: form.elements.serial_port_name.value.trim(), baudrate: Number(form.elements.baudrate.value), timeout: Number(form.elements.timeout.value) || 1 },
      } }).then(() => true),
    });
    if (result === 'remove') {
      try { await api(`${CFG}/instance/rfid`, { method: 'DELETE', query: q }); toast('Lettore RFID rimosso', 'ok'); }
      catch (err) { toast(err.message, 'err'); }
    } else if (result === true) toast('Lettore RFID salvato', 'ok');
  }

  draw();
}
