// Impostazioni › Integrazioni: cartella remota sincronizzata, broker MQTT, pannello a messaggi, sirena.

import { api } from '../api.js';
import { esc, toast, confirmDialog } from '../ui.js';
import { SUPER_ADMIN, section, readonlyNotice } from './impostazioni.js';

export function renderIntegrazioni(el, { level }) {
  if (level < SUPER_ADMIN) {
    readonlyNotice(el, 'Le integrazioni sono riservate al super amministratore.');
    return;
  }
  syncFolder(el);
  messageBroker(el);
  device(el, {
    name: 'panel', title: 'Pannello a messaggi',
    description: 'Display che mostra le targhe chiamate in pesa.',
    test: { label: 'Invia messaggio di prova', run: async () => {
      await api('/api/anagrafic/message/panel', { query: { text: 'PROVA', broadcastMessageBuffer: false } });
      setTimeout(() => api('/api/anagrafic/buffer/panel', { method: 'DELETE' }).catch(() => {}), 5000);
    } },
  });
  device(el, {
    name: 'siren', title: 'Sirena',
    description: 'Segnale acustico per chiamare i mezzi.',
    test: { label: 'Fai suonare', run: () => api('/api/anagrafic/call/siren') },
  });
}

// ── Cartella remota ──────────────────────────────────────────────────────────
function syncFolder(el) {
  const rows = section(el, 'Cartella remota',
    'Copia automatica di PDF, CSV e foto delle pesate in una cartella di rete (es. il server dell\'ufficio).');
  const box = document.createElement('div');
  rows.appendChild(box);

  async function load() {
    box.innerHTML = '<p class="muted backups-msg">Caricamento…</p>';
    let cfg = {};
    try { cfg = await api('/api/sync-folder'); } catch (err) { box.innerHTML = `<p class="dt-empty err">${esc(err.message)}</p>`; return; }
    const r = cfg.remote_folder || {};
    box.innerHTML = `
      <form class="device-form">
        <div class="form-grid">
          <label class="field"><span>Protocollo</span><select class="input" name="protocol">
            ${[['samba', 'Cartella condivisa Windows (SMB)'], ['ftp', 'FTP'], ['sftp', 'SFTP']].map(([v, l]) => `<option value="${v}" ${r.protocol === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Indirizzo IP</span><input class="input" name="ip" required pattern="\\d{1,3}(\\.\\d{1,3}){3}" placeholder="192.168.1.10" value="${esc(r.ip || '')}"></label>
          <label class="field"><span>Porta <em class="muted">(vuoto: predefinita)</em></span><input class="input" name="port" type="number" min="1" max="65535" value="${esc(r.port ?? '')}"></label>
          <label class="field"><span>Condivisione</span><input class="input" name="share_name" required placeholder="es. Pesate" value="${esc(r.share_name || '')}"></label>
          <label class="field"><span>Sottocartella <em class="muted">(facoltativo)</em></span><input class="input" name="sub_path" value="${esc(r.sub_path || '')}"></label>
          <label class="field"><span>Dominio <em class="muted">(facoltativo)</em></span><input class="input" name="domain" value="${esc(r.domain || '')}"></label>
          <label class="field"><span>Utente</span><input class="input" name="username" required autocomplete="off" value="${esc(r.username || '')}"></label>
          <label class="field"><span>Password</span><input class="input" name="password" type="password" required autocomplete="new-password" value="${esc(r.password || '')}"></label>
        </div>
        <p class="device-status muted">${cfg.remote_folder ? 'Configurata. Usa “Verifica” per controllare il collegamento.' : 'Non configurata.'}</p>
        <div class="settings-actions inline">
          <button type="submit" class="btn primary">Salva e collega</button>
          ${cfg.remote_folder ? '<button type="button" class="btn" data-a="test">Verifica</button><button type="button" class="btn danger" data-a="remove">Scollega</button>' : ''}
        </div>
      </form>`;
    const form = box.querySelector('form');
    const status = box.querySelector('.device-status');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const body = Object.fromEntries(['protocol', 'ip', 'share_name', 'sub_path', 'domain', 'username', 'password'].map(k => [k, form.elements[k].value.trim()]));
      body.port = form.elements.port.value ? Number(form.elements.port.value) : null;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const res = await api('/api/sync-folder', { method: 'POST', body });
        toast(res.mounted ? 'Cartella remota collegata' : 'Configurazione salvata, ma il collegamento non è riuscito', res.mounted ? 'ok' : 'warn');
        load();
      } catch (err) { toast(err.message, 'err'); }
      finally { btn.disabled = false; }
    });
    form.querySelector('[data-a="test"]')?.addEventListener('click', async () => {
      status.textContent = 'Verifica in corso…';
      try {
        const res = await api('/api/sync-folder/test');
        status.textContent = res.mounted ? `Collegata: ${res.remote_path || ''}` : `Non collegata${res.status ? ' (' + res.status + ')' : ''}`;
        status.className = `device-status ${res.mounted ? 'ok' : 'err'}`;
      } catch (err) { status.textContent = err.message; status.className = 'device-status err'; }
    });
    form.querySelector('[data-a="remove"]')?.addEventListener('click', async () => {
      const ok = await confirmDialog('Scollega cartella remota', '<p>Smettere di copiare i file nella cartella remota?</p>',
        { label: 'Scollega', kind: 'danger', onConfirm: () => api('/api/sync-folder', { method: 'DELETE' }) });
      if (ok) { toast('Cartella remota scollegata', 'ok'); load(); }
    });
  }
  load();
}

// ── Broker MQTT ──────────────────────────────────────────────────────────────
const fmtDate = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString('it-IT'); };

function messageBroker(el) {
  const rows = section(el, 'Broker MQTT',
    'Invio di ogni pesata (dati, foto, PDF e CSV) a un broker MQTT in TLS. I messaggi restano in coda finché il broker non conferma la ricezione.');
  const box = document.createElement('div');
  rows.appendChild(box);

  async function load() {
    box.innerHTML = '<p class="muted backups-msg">Caricamento…</p>';
    let cfg, st = null;
    try { cfg = await api('/api/message-broker'); } catch (err) { box.innerHTML = `<p class="dt-empty err">${esc(err.message)}</p>`; return; }
    const b = cfg.broker;
    if (b) { try { st = await api('/api/message-broker/test'); } catch (_) { /* stato non disponibile */ } }
    const certs = cfg.certificates || {};
    const certInfo = kind => {
      const c = certs[kind] || {};
      if (!c.present) return '<em class="muted">nessuno</em>';
      return `installato${c.subject ? ` · ${esc(c.subject)}` : ''}${c.expires_at ? ` · scade il ${esc(fmtDate(c.expires_at))}` : ''}`;
    };
    const check = (name, label, on) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${esc(label)}</label>`;

    box.innerHTML = `
      <form class="device-form">
        <div class="form-grid">
          <label class="field"><span>Host</span><input class="input" name="host" required placeholder="es. broker.esempio.it" value="${esc(b?.host || '')}" autocomplete="off"></label>
          <label class="field"><span>Porta</span><input class="input" name="port" type="number" min="1" max="65535" required value="${esc(b?.port ?? 8883)}"></label>
          <label class="field"><span>Utente</span><input class="input" name="username" value="${esc(b?.username || '')}" autocomplete="off"></label>
          <label class="field"><span>Password${b?.has_password ? ' <em class="muted">(vuoto: invariata)</em>' : ''}</span><input class="input" name="password" type="password" autocomplete="new-password"></label>
          <label class="field"><span>Certificato CA</span><input class="input" name="ca_file" type="file" accept=".pem,.crt,.cer"><small class="muted">Attuale: ${certInfo('ca')}</small></label>
          <label class="field"><span>Certificato client</span><input class="input" name="cert_file" type="file" accept=".pem,.crt,.cer"><small class="muted">Attuale: ${certInfo('cert')}</small></label>
          <label class="field"><span>Chiave client</span><input class="input" name="key_file" type="file" accept=".pem,.key"><small class="muted">Attuale: ${certInfo('key')}</small></label>
        </div>
        <p class="muted">Autenticazione con utente e password, con certificato e chiave client (mTLS) o con entrambi. Senza certificato CA si usano i certificati di sistema.</p>
        <div class="mb-checks">
          ${check('include_images', 'Allega le foto', b ? b.include_images : true)}
          ${check('include_pdf', 'Allega il PDF del report', b ? b.include_pdf : true)}
          ${check('include_csv', 'Allega il CSV', b ? b.include_csv : true)}
          ${certs.ca?.present ? check('remove_ca', 'Rimuovi il certificato CA', false) : ''}
          ${certs.cert?.present || certs.key?.present ? check('remove_client_cert', 'Rimuovi certificato e chiave client', false) : ''}
        </div>
        <p class="muted">Client ID e topic di pubblicazione: <strong>${esc(cfg.topic || cfg.client_id || '–')}</strong></p>
        <div class="mb-status"></div>
        <div class="settings-actions inline">
          <button type="submit" class="btn primary">Salva e collega</button>
          ${b ? '<button type="button" class="btn" data-a="test">Verifica</button>' : ''}
          ${st?.failed ? `<button type="button" class="btn" data-a="retry">Rinvia falliti (${st.failed})</button>` : ''}
          ${b ? '<button type="button" class="btn danger" data-a="remove">Scollega</button>' : ''}
        </div>
      </form>`;
    const form = box.querySelector('form');
    const statusBox = box.querySelector('.mb-status');
    const drawStatus = s => {
      if (!b) { statusBox.innerHTML = '<p class="device-status muted">Non configurato.</p>'; return; }
      if (!s) { statusBox.innerHTML = '<p class="device-status muted">Stato non disponibile.</p>'; return; }
      statusBox.innerHTML = `
        <p class="device-status ${s.connected ? 'ok' : 'err'}">${s.connected ? 'Connesso' : 'Non connesso'}
          · in coda: ${s.pending ?? 0} · falliti: ${s.failed ?? 0}${s.last_sent_at ? ` · ultimo invio: ${esc(fmtDate(s.last_sent_at))}` : ''}</p>
        ${s.last_error ? `<p class="device-status err">Ultimo errore: ${esc(s.last_error)}</p>` : ''}`;
    };
    drawStatus(st);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const fd = new FormData();
      fd.append('host', form.elements.host.value.trim());
      fd.append('port', form.elements.port.value);
      const username = form.elements.username.value.trim();
      if (username) fd.append('username', username);
      if (form.elements.password.value) fd.append('password', form.elements.password.value);
      for (const k of ['include_images', 'include_pdf', 'include_csv', 'remove_ca', 'remove_client_cert']) {
        if (form.elements[k]) fd.append(k, form.elements[k].checked ? 'true' : 'false');
      }
      for (const k of ['ca_file', 'cert_file', 'key_file']) {
        const f = form.elements[k].files[0];
        if (f) fd.append(k, f);
      }
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const res = await api('/api/message-broker', { method: 'POST', body: fd });
        toast(res.connected ? 'Broker MQTT collegato' : 'Configurazione salvata, ma la connessione al broker non è riuscita', res.connected ? 'ok' : 'warn');
        load();
      } catch (err) { toast(err.message, 'err'); }
      finally { btn.disabled = false; }
    });
    form.querySelector('[data-a="test"]')?.addEventListener('click', async () => {
      statusBox.innerHTML = '<p class="device-status muted">Verifica in corso…</p>';
      try { drawStatus(await api('/api/message-broker/test')); }
      catch (err) { statusBox.innerHTML = `<p class="device-status err">${esc(err.message)}</p>`; }
    });
    form.querySelector('[data-a="retry"]')?.addEventListener('click', async () => {
      try {
        const res = await api('/api/message-broker/retry-failed', { method: 'POST' });
        toast(`${res.requeued} messaggi rimessi in coda`, 'ok');
        load();
      } catch (err) { toast(err.message, 'err'); }
    });
    form.querySelector('[data-a="remove"]')?.addEventListener('click', async () => {
      const ok = await confirmDialog('Scollega broker MQTT', '<p>Smettere di inviare le pesate al broker MQTT? I messaggi in coda restano salvati.</p>',
        { label: 'Scollega', kind: 'danger', onConfirm: () => api('/api/message-broker', { method: 'DELETE' }) });
      if (ok) { toast('Broker MQTT scollegato', 'ok'); load(); }
    });
  }
  load();
}

// ── Pannello e sirena ────────────────────────────────────────────────────────
const TYPES = [
  ['disabled', 'Disattivato'],
  ['tcp_custom', 'TCP – protocollo pannello'],
  ['tcp_raw', 'TCP – testo semplice'],
  ['http_simple', 'HTTP'],
  ['http_basic', 'HTTP con autenticazione Basic'],
  ['http_digest', 'HTTP con autenticazione Digest'],
  ['http_bearer', 'HTTP con token'],
];

// campi specifici per tipo: [chiave, etichetta, tipo input, extra]
const TYPE_FIELDS = {
  tcp_custom: [['panel_id', 'ID pannello', 'number', { value: 16 }], ['duration', 'Durata messaggio (s)', 'number', { value: 90 }], ['max_string_content', 'Targhe visibili insieme', 'number', { value: 3 }]],
  tcp_raw: [['encoding', 'Codifica', 'text', { value: 'utf-8' }], ['line_ending', 'Fine riga', 'select', { options: [['\r\n', 'CR+LF'], ['\n', 'LF'], ['', 'Nessuno']] }], ['wait_response', 'Attendi risposta', 'checkbox']],
  http: [['endpoint', 'Indirizzo (URL)', 'url'], ['method', 'Metodo', 'select', { options: [['GET', 'GET'], ['POST', 'POST']] }], ['query_param', 'Parametro nella URL', 'text', { help: 'es. text' }], ['body_param', 'Campo nel corpo (POST)', 'text', { value: 'message' }]],
  auth: [['username', 'Utente', 'text'], ['password', 'Password', 'password']],
  bearer: [['token', 'Token', 'password']],
};
function fieldsFor(type) {
  if (type === 'tcp_custom' || type === 'tcp_raw') return TYPE_FIELDS[type];
  if (type === 'http_basic' || type === 'http_digest') return [...TYPE_FIELDS.http, ...TYPE_FIELDS.auth];
  if (type === 'http_bearer') return [...TYPE_FIELDS.http, ...TYPE_FIELDS.bearer];
  if (type === 'http_simple') return TYPE_FIELDS.http;
  return [];
}

function device(el, { name, title, description, test }) {
  const rows = section(el, title, description);
  const box = document.createElement('div');
  rows.appendChild(box);

  async function load() {
    let cfg;
    try { cfg = await api(`/api/anagrafic/configuration/${name}`); } catch (err) { box.innerHTML = `<p class="dt-empty err">${esc(err.message)}</p>`; return; }
    const conn = cfg.connection || {};
    box.innerHTML = `
      <form class="device-form">
        <div class="form-grid">
          <label class="field"><span>Tipo di collegamento</span><select class="input" name="type">
            ${TYPES.map(([v, l]) => `<option value="${v}" ${(cfg.enabled ? cfg.type : 'disabled') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="conn-fields form-grid" style="grid-column:1/-1">
            <label class="field"><span>Indirizzo IP</span><input class="input" name="ip" value="${esc(conn.ip && conn.ip !== '0.0.0.0' ? conn.ip : '')}" placeholder="192.168.1.100"></label>
            <label class="field"><span>Porta</span><input class="input" name="port" type="number" min="1" max="65535" value="${esc(conn.port || '')}"></label>
            <label class="field"><span>Timeout (s)</span><input class="input" name="timeout" type="number" min="0.2" step="0.1" value="${esc(conn.timeout ?? 5)}"></label>
          </div>
          <div class="type-fields form-grid" style="grid-column:1/-1"></div>
        </div>
        <div class="settings-actions inline">
          <button type="submit" class="btn primary">Salva</button>
          ${cfg.enabled ? `<button type="button" class="btn" data-a="test">${esc(test.label)}</button>` : ''}
        </div>
      </form>`;
    const form = box.querySelector('form');
    const typeSel = form.elements.type;
    const typeBox = box.querySelector('.type-fields');
    const connBox = box.querySelector('.conn-fields');
    const drawType = () => {
      const t = typeSel.value;
      connBox.hidden = t === 'disabled';
      const saved = t === cfg.type ? (cfg.config || {}) : {};
      typeBox.innerHTML = fieldsFor(t).map(([k, label, kind, extra = {}]) => {
        const v = saved[k] ?? extra.value ?? '';
        if (kind === 'select') return `<label class="field"><span>${esc(label)}</span><select class="input" name="cfg_${k}">${extra.options.map(([ov, ol]) => `<option value="${esc(ov)}" ${ov === v ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select></label>`;
        if (kind === 'checkbox') return `<label class="check"><input type="checkbox" name="cfg_${k}" ${v ? 'checked' : ''}> ${esc(label)}</label>`;
        return `<label class="field"><span>${esc(label)}${extra.help ? ` <em class="muted">(${esc(extra.help)})</em>` : ''}</span><input class="input" name="cfg_${k}" type="${kind}" value="${esc(v)}" autocomplete="off"></label>`;
      }).join('');
      connBox.querySelectorAll('input').forEach(i => { i.required = t !== 'disabled' && i.name !== 'timeout'; });
    };
    typeSel.addEventListener('change', drawType);
    drawType();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const type = typeSel.value;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        if (type === 'disabled') {
          await api(`/api/anagrafic/configuration/${name}`, { method: 'DELETE' });
        } else {
          const config = {};
          for (const [k, , kind] of fieldsFor(type)) {
            const input = form.elements[`cfg_${k}`];
            if (kind === 'checkbox') config[k] = input.checked;
            else if (kind === 'number') { if (input.value !== '') config[k] = Number(input.value); }
            else if (input.value !== '') config[k] = input.value;
          }
          await api(`/api/anagrafic/configuration/${name}`, { method: 'PATCH', body: {
            enabled: true, type,
            connection: { ip: form.elements.ip.value.trim(), port: Number(form.elements.port.value), timeout: Number(form.elements.timeout.value || 5) },
            config,
          } });
        }
        toast(`${title}: ${type === 'disabled' ? 'disattivato' : 'salvato'}`, 'ok');
        load();
      } catch (err) { toast(err.message, 'err'); }
      finally { btn.disabled = false; }
    });
    form.querySelector('[data-a="test"]')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await test.run(); toast(`${title}: prova inviata`, 'ok'); }
      catch (err) { toast(`${title}: ${err.message}`, 'err'); }
      finally { btn.disabled = false; }
    });
  }
  load();
}
