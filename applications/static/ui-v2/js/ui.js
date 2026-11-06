// Piccole utilità per l'interfaccia: escape HTML, avvisi, formattazione.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Avviso in basso a destra. kind: '' | 'ok' | 'warn' | 'err'. action: { label, run } opzionale. */
export function toast(text, kind = '', { action, timeout = 6000 } = {}) {
  const box = document.getElementById('toasts');
  // lo stesso messaggio può arrivare sia dalla risposta che dal websocket: lo mostro una volta
  if ([...box.children].some(c => c.dataset.text === text)) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.dataset.text = text;
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(span);
  if (action) {
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = action.label;
    a.addEventListener('click', e => { e.preventDefault(); action.run(); });
    el.appendChild(a);
  }
  box.appendChild(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 350); }, timeout);
}

export function formatKg(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('it-IT') : String(value);
}

export function formatTime(date = new Date()) {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Finestra modale. body: HTML (già escapato) o nodo.
 * actions: [{ label, kind: '' | 'primary' | 'danger', value, submit }] — il pulsante con submit invia il form.
 * onSubmit(form): async, se lancia un errore la finestra resta aperta e mostra il messaggio.
 * Restituisce una Promise con il value del pulsante premuto (null se chiusa).
 */
export function openDialog({ title, body = '', actions = [{ label: 'Chiudi', value: null }], onSubmit, onClose, wide = false }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = `dialog${wide ? ' wide' : ''}`;
    dlg.innerHTML = `
      <form method="dialog" class="dialog-form" novalidate>
        <header class="dialog-h"><h2>${esc(title)}</h2>
          <button type="button" class="icon-btn dialog-x" aria-label="Chiudi">✕</button></header>
        <div class="dialog-b"></div>
        <p class="dialog-error" role="alert" hidden></p>
        <footer class="dialog-f"></footer>
      </form>`;
    const form = dlg.querySelector('form');
    const b = dlg.querySelector('.dialog-b');
    if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
    const err = dlg.querySelector('.dialog-error');
    const footer = dlg.querySelector('.dialog-f');
    let result = null;
    let busy = false;

    const close = value => { result = value; dlg.close(); };
    dlg.addEventListener('close', () => { dlg.remove(); onClose?.(result); resolve(result); });
    dlg.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dlg.querySelector('.dialog-x').addEventListener('click', () => { if (!busy) close(null); });

    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.type = a.submit ? 'submit' : 'button';
      btn.className = `btn ${a.kind || ''}`;
      btn.textContent = a.label;
      if (!a.submit) btn.addEventListener('click', () => { if (!busy) close(a.value ?? null); });
      footer.appendChild(btn);
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (busy) return;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (!onSubmit) { close(true); return; }
      busy = true;
      err.hidden = true;
      footer.querySelectorAll('button').forEach(x => x.disabled = true);
      try {
        const v = await onSubmit(form);
        close(v === undefined ? true : v);
      } catch (ex) {
        err.textContent = ex.message || String(ex);
        err.hidden = false;
      } finally {
        busy = false;
        footer.querySelectorAll('button').forEach(x => x.disabled = false);
      }
    });

    document.body.appendChild(dlg);
    dlg.showModal();
    const first = dlg.querySelector('.dialog-b input:not([type=hidden]), .dialog-b select, .dialog-b textarea');
    if (first) first.focus();
  });
}

/** Conferma semplice: resolve true/false. */
export async function confirmDialog(title, html, { label = 'Conferma', kind = 'primary', onConfirm } = {}) {
  const r = await openDialog({
    title, body: html, onSubmit: onConfirm,
    actions: [{ label: 'Annulla', value: false }, { label, kind, submit: true }],
  });
  return r === true;
}
