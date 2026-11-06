// Campo con suggerimenti per scegliere un record di un'anagrafica (veicolo, cliente, ...).
// Se il testo scritto non corrisponde a un record esistente, il valore viene mandato
// come nuovo record e il server lo crea al salvataggio (tranne dove allowNew è false).
//
// const c = anagraficInput({ name: 'customer', field: 'social_reason', label: 'Cliente', value: {id, social_reason} })
// form.appendChild(c.el); c.value(isEdit) -> { id, social_reason } da mandare all'API

import { api } from './api.js';
import { esc } from './ui.js';

let seq = 0;

export function anagraficInput({ name, field, label, value = null, upper = false, required = false, allowNew = true, placeholder = '', secondary }) {
  const uid = `ai-${++seq}`;
  const original = value && value.id ? { id: value.id, text: value[field] || '' } : null;
  let selected = original ? { ...original } : null;
  let items = [];
  let active = -1;
  let timer = null;
  let reqSeq = 0;

  const el = document.createElement('label');
  el.className = 'field ai';
  el.innerHTML = `
    <span>${esc(label)}${required ? '' : ' <em class="muted">(facoltativo)</em>'}</span>
    <div class="ai-box">
      <input class="input" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false"
        aria-controls="${uid}" ${required ? 'required' : ''} placeholder="${esc(placeholder)}">
      <span class="ai-tag" hidden></span>
      <ul class="ai-list" id="${uid}" role="listbox" hidden></ul>
    </div>`;
  const input = el.querySelector('input');
  const list = el.querySelector('.ai-list');
  const tag = el.querySelector('.ai-tag');
  input.value = original?.text || '';

  function updateTag() {
    const text = input.value.trim();
    if (!text) { tag.hidden = true; return; }
    if (selected && selected.text.toLowerCase() === text.toLowerCase()) { tag.hidden = true; return; }
    tag.hidden = false;
    tag.className = `ai-tag ${allowNew ? 'new' : 'err'}`;
    tag.textContent = allowNew ? 'nuovo' : 'non trovato';
  }

  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }
  function render() {
    if (!items.length) { close(); return; }
    list.innerHTML = items.map((it, i) => `<li role="option" id="${uid}-${i}" data-i="${i}" class="${i === active ? 'active' : ''}">
      <span>${esc(it[field])}</span>${secondary && secondary(it) ? `<small>${esc(secondary(it))}</small>` : ''}</li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${uid}-${active}`); else input.removeAttribute('aria-activedescendant');
  }
  function pick(it) {
    selected = { id: it.id, text: it[field] || '' };
    input.value = selected.text;
    close();
    updateTag();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function search() {
    const text = input.value.trim();
    const my = ++reqSeq;
    try {
      const query = { limit: 8, order_by: field, order_direction: 'asc' };
      if (text) query[field] = `%${text}%`;
      const res = await api(`/api/anagrafic/${name}/list`, { query });
      if (my !== reqSeq) return;
      items = res.data || [];
      active = -1;
      // corrispondenza esatta: la seleziono senza bisogno di cliccare
      const exact = text && items.find(it => String(it[field] || '').toLowerCase() === text.toLowerCase());
      if (exact && (!selected || selected.id !== exact.id)) selected = { id: exact.id, text: exact[field] };
      if (document.activeElement === input) render();
      else input.addEventListener('focus', render, { once: true });
      updateTag();
    } catch (_) { /* suggerimenti non disponibili: si può comunque scrivere */ }
  }

  input.addEventListener('input', () => {
    if (upper) { const p = input.selectionStart; input.value = input.value.toUpperCase(); input.setSelectionRange(p, p); }
    if (selected && selected.text.toLowerCase() !== input.value.trim().toLowerCase()) selected = null;
    input.setCustomValidity('');
    updateTag();
    clearTimeout(timer);
    timer = setTimeout(search, 200);
  });
  // L'elenco si apre quando l'utente scrive, clicca sul campo o preme ↓; non per il solo focus
  // (es. il focus automatico all'apertura del form), altrimenti coprirebbe i campi sotto.
  input.addEventListener('mousedown', () => { clearTimeout(timer); if (list.hidden) search(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && list.hidden) { e.preventDefault(); search(); return; }
    if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  list.addEventListener('mousedown', e => {
    const li = e.target.closest('li[data-i]');
    if (li) { e.preventDefault(); pick(items[Number(li.dataset.i)]); }
  });

  return {
    el,
    input,
    /** Controlla il campo (es. tessera inesistente). Restituisce un messaggio d'errore o ''. */
    validate() {
      const text = input.value.trim();
      const msg = !allowNew && text && !(selected && selected.text.toLowerCase() === text.toLowerCase())
        ? `${label}: "${text}" non esiste nell'anagrafica` : '';
      input.setCustomValidity(msg);
      return msg;
    },
    /**
     * Valore per l'API. In modifica: id -1 svuota il campo; id null + testo crea un nuovo record.
     * Restituisce undefined se in modifica il campo non è cambiato.
     */
    value(isEdit = false) {
      const text = input.value.trim();
      if (!text) {
        if (isEdit && original) return { id: -1 };
        return isEdit ? undefined : { id: null };
      }
      if (selected && selected.text.toLowerCase() === text.toLowerCase()) {
        if (isEdit && original && original.id === selected.id) return undefined;
        return { id: selected.id };
      }
      return { id: null, [field]: upper ? text.toUpperCase() : text };
    },
    selectedId() { return selected && selected.text.toLowerCase() === input.value.trim().toLowerCase() ? selected.id : null; },
  };
}
