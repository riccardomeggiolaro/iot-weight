// Impostazioni › Utenti: profilo dell'utente collegato e gestione degli utenti (amministratori).
// Livelli: 1 sola lettura, 2 operatore, 3 amministratore, 4 super amministratore.
// Un utente può gestire solo utenti di livello inferiore al proprio (regola del server).

import { api } from '../api.js';
import { esc, toast, openDialog, confirmDialog, formatDateTime } from '../ui.js';

const LEVELS = {
  1: { label: 'Sola lettura', help: 'Vede pesate, prenotazioni e anagrafiche ma non può modificarle.' },
  2: { label: 'Operatore', help: 'Pesa, gestisce prenotazioni e anagrafiche.' },
  3: { label: 'Amministratore', help: 'Come l\'operatore, in più gestisce gli utenti.' },
  4: { label: 'Super amministratore', help: 'Accesso completo, comprese le impostazioni dell\'impianto.' },
};
const ADMIN = 3;

export function renderUtenti(el, { me }) {
  const level = me?.level ?? 0;
  el.innerHTML = `
    <section class="card settings-section">
      <header><h3>Il mio profilo</h3><p class="muted">Utente collegato.</p></header>
      <div class="settings-rows">
        <div class="settings-row"><span class="settings-text"><span class="settings-label">${esc(me?.username || '')}</span>
          <span class="settings-help">${esc(me?.description || '')} · ${esc(LEVELS[level]?.label || 'Livello ' + level)}</span></span>
          <span class="page-actions"><button type="button" class="btn" data-a="profile">Modifica nome</button><button type="button" class="btn" data-a="password">Cambia password</button></span>
        </div>
      </div>
    </section>
    ${level >= ADMIN ? `
    <section class="card settings-section users-section">
      <header class="settings-head-actions"><div><h3>Utenti</h3><p class="muted">Puoi gestire gli utenti con un livello inferiore al tuo.</p></div>
        <button type="button" class="btn primary" data-a="add">+ Nuovo utente</button></header>
      <div class="users-list"><p class="muted" style="padding:12px 18px">Caricamento…</p></div>
    </section>
    <section class="card settings-section"><header><h3>Livelli di accesso</h3></header><div class="settings-rows">
      ${Object.entries(LEVELS).map(([, l]) => `<div class="settings-row"><span class="settings-text"><span class="settings-label">${esc(l.label)}</span><span class="settings-help">${esc(l.help)}</span></span></div>`).join('')}
    </div></section>` : ''}`;

  el.querySelector('[data-a="profile"]').addEventListener('click', () => editProfile(me));
  el.querySelector('[data-a="password"]').addEventListener('click', () => changePassword());
  if (level < ADMIN) return;

  const listEl = el.querySelector('.users-list');
  el.querySelector('[data-a="add"]').addEventListener('click', () => userForm(null));

  const assignable = () => Object.entries(LEVELS).filter(([n]) => Number(n) < level);

  async function load() {
    try {
      const res = await api('/api/auth/users');
      const users = (Array.isArray(res?.[0]) ? res[0] : res?.data || res || [])
        .filter(u => u.level > 0) // utenti di sistema (fotocamere, terminali) esclusi
        .sort((a, b) => b.level - a.level || a.username.localeCompare(b.username));
      listEl.innerHTML = `<table class="dt-table"><thead><tr class="dt-head"><th>Utente</th><th>Descrizione</th><th>Livello</th><th>Creato il</th><th class="dt-actions-h"><span class="sr">Azioni</span></th></tr></thead>
        <tbody>${users.map(u => `<tr class="dt-row" data-id="${u.id}">
          <td><strong>${esc(u.username)}</strong>${u.id === me.id ? ' <span class="badge info">tu</span>' : ''}</td>
          <td>${esc(u.description || '') || '<span class="muted">—</span>'}</td>
          <td><span class="badge">${esc(LEVELS[u.level]?.label || u.level)}</span></td>
          <td class="nowrap">${esc(formatDateTime(u.date_created))}</td>
          <td class="dt-actions">${u.level < level && u.id !== me.id ? `
            <button type="button" class="dt-act" data-edit="${u.id}" title="Modifica" aria-label="Modifica ${esc(u.username)}">✎</button>
            <button type="button" class="dt-act danger" data-del="${u.id}" title="Elimina" aria-label="Elimina ${esc(u.username)}">🗑</button>` : ''}</td>
        </tr>`).join('')}</tbody></table>`;
      listEl.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => userForm(users.find(u => u.id === Number(b.dataset.edit)))));
      listEl.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => removeUser(users.find(u => u.id === Number(b.dataset.del)))));
    } catch (err) {
      listEl.innerHTML = `<p class="dt-empty err">Impossibile caricare gli utenti: ${esc(err.message)}</p>`;
    }
  }

  function userForm(user) {
    const isEdit = !!user;
    const options = assignable();
    return openDialog({
      title: isEdit ? `Modifica utente ${user.username}` : 'Nuovo utente',
      body: `<div class="form-grid">
        <label class="field"><span>Nome utente</span><input class="input" name="username" autocomplete="off" required minlength="2" value="${esc(user?.username || '')}"></label>
        <label class="field"><span>Descrizione <em class="muted">(es. nome e cognome)</em></span><input class="input" name="description" autocomplete="off" ${isEdit ? '' : 'required'} value="${esc(user?.description || '')}"></label>
        <label class="field"><span>Livello</span><select class="input" name="level" required>
          ${options.map(([n, l]) => `<option value="${n}" ${Number(n) === (user?.level ?? 2) ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select></label>
        <label class="field"><span>Password ${isEdit ? '<em class="muted">(lascia vuoto per non cambiarla)</em>' : ''}</span>
          <input class="input" name="password" type="password" autocomplete="new-password" minlength="4" ${isEdit ? '' : 'required'}></label>
      </div>`,
      actions: [{ label: 'Annulla', value: null }, { label: 'Salva', kind: 'primary', submit: true }],
      onSubmit: async form => {
        const body = {
          username: form.elements.username.value.trim(),
          description: form.elements.description.value.trim(),
          level: Number(form.elements.level.value),
        };
        const pwd = form.elements.password.value;
        if (pwd) body.password = pwd;
        if (isEdit) {
          if (body.username === user.username) delete body.username;
          await api(`/api/auth/user/${user.id}`, { method: 'PATCH', body });
        } else {
          await api('/api/auth/register', { method: 'POST', body });
        }
      },
    }).then(saved => { if (saved) { toast(isEdit ? 'Utente modificato' : 'Utente creato', 'ok'); load(); } });
  }

  async function removeUser(user) {
    const ok = await confirmDialog('Elimina utente', `<p>Eliminare l'utente <strong>${esc(user.username)}</strong>?</p><p class="muted">Le pesate già registrate restano.</p>`,
      { label: 'Elimina', kind: 'danger', onConfirm: () => api(`/api/auth/user/${user.id}`, { method: 'DELETE' }) });
    if (ok) { toast('Utente eliminato', 'ok'); load(); }
  }

  load();
}

function editProfile(me) {
  return openDialog({
    title: 'Il mio profilo',
    body: `<label class="field"><span>Descrizione <em class="muted">(es. nome e cognome)</em></span><input class="input" name="description" required value="${esc(me?.description || '')}"></label>`,
    actions: [{ label: 'Annulla', value: null }, { label: 'Salva', kind: 'primary', submit: true }],
    onSubmit: form => api('/api/auth/me', { method: 'PATCH', body: { description: form.elements.description.value.trim() } }),
  }).then(saved => { if (saved) { toast('Profilo aggiornato', 'ok'); location.reload(); } });
}

function changePassword() {
  return openDialog({
    title: 'Cambia password',
    body: `<div class="form-grid">
      <label class="field"><span>Nuova password</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="4" required></label>
      <label class="field"><span>Ripeti la nuova password</span><input class="input" name="confirm" type="password" autocomplete="new-password" minlength="4" required></label>
    </div>`,
    actions: [{ label: 'Annulla', value: null }, { label: 'Cambia password', kind: 'primary', submit: true }],
    onSubmit: async form => {
      if (form.elements.password.value !== form.elements.confirm.value) throw new Error('Le due password non coincidono');
      await api('/api/auth/me', { method: 'PATCH', body: { password: form.elements.password.value } });
    },
  }).then(saved => { if (saved) toast('Password cambiata', 'ok'); });
}
