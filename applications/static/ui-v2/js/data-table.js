// Tabella con filtri per colonna, ordinamento e paginazione lato server.
//
// createDataTable(el, {
//   columns: [{ key, label, filter?: 'text'|'select', options?, upper?, sortable?, render?(row), className? }],
//   load: async ({ limit, offset, filters, sort }) => ({ rows, total }),
//   actions?: row => [{ label, icon, kind, run(row) }],
//   rowClass?: row => string,
//   expand?: row => html|null      // dettaglio sotto la riga, al clic
//   empty: 'Nessun elemento'
// }) → { reload(), destroy() }

import { esc } from './ui.js';

const PAGE_SIZES = [10, 25, 50, 100];
const SIZE_KEY = 'ui-v2.pageSize';

export function createDataTable(el, opts) {
  const state = {
    page: 0,
    size: (() => { try { return Number(localStorage.getItem(SIZE_KEY)) || 25; } catch (_) { return 25; } })(),
    filters: {},
    sort: opts.defaultSort || null, // { key, dir }
    total: 0,
    rows: [],
    expanded: new Set(),
    seq: 0,
  };

  el.classList.add('dt');
  el.innerHTML = `
    <div class="dt-scroll">
      <table class="dt-table">
        <thead>
          <tr class="dt-head">${opts.columns.map(c => `<th class="${c.className || ''}" data-key="${esc(c.key)}">${c.sortable === false ? esc(c.label)
            : `<button type="button" class="dt-sort" data-key="${esc(c.key)}">${esc(c.label)}<span class="dt-arrow"></span></button>`}</th>`).join('')}
            ${opts.actions ? '<th class="dt-actions-h"><span class="sr">Azioni</span></th>' : ''}</tr>
          <tr class="dt-filters">${opts.columns.map(c => `<th class="${c.className || ''}">${filterHtml(c)}</th>`).join('')}${opts.actions ? '<th></th>' : ''}</tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="dt-foot">
      <span class="dt-total muted"></span>
      <label class="dt-size muted">Righe <select class="input">${PAGE_SIZES.map(s => `<option ${s === state.size ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <div class="dt-pager">
        <button type="button" class="btn dt-prev" aria-label="Pagina precedente">‹</button>
        <span class="dt-page"></span>
        <button type="button" class="btn dt-next" aria-label="Pagina successiva">›</button>
      </div>
    </div>`;

  function filterHtml(c) {
    if (!c.filter) return '';
    if (c.filter === 'select') {
      return `<select class="input dt-filter" data-key="${esc(c.key)}" aria-label="Filtro ${esc(c.label)}">
        ${c.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`;
    }
    return `<input class="input dt-filter" type="search" data-key="${esc(c.key)}" placeholder="Cerca…" aria-label="Filtro ${esc(c.label)}" autocomplete="off"${c.upper ? ' data-upper' : ''}>`;
  }

  const tbody = el.querySelector('tbody');
  const colspan = opts.columns.length + (opts.actions ? 1 : 0);

  let filterTimer = null;
  el.querySelectorAll('.dt-filter').forEach(inp => {
    const apply = () => {
      if (inp.hasAttribute('data-upper')) inp.value = inp.value.toUpperCase();
      const v = inp.value.trim();
      if (v) state.filters[inp.dataset.key] = v; else delete state.filters[inp.dataset.key];
      state.page = 0;
      clearTimeout(filterTimer);
      filterTimer = setTimeout(reload, inp.tagName === 'SELECT' ? 0 : 300);
    };
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', apply);
  });
  el.querySelectorAll('.dt-sort').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    state.sort = state.sort?.key === key ? (state.sort.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' };
    state.page = 0;
    reload();
  }));
  el.querySelector('.dt-size select').addEventListener('change', e => {
    state.size = Number(e.target.value);
    try { localStorage.setItem(SIZE_KEY, String(state.size)); } catch (_) {}
    state.page = 0;
    reload();
  });
  el.querySelector('.dt-prev').addEventListener('click', () => { if (state.page > 0) { state.page--; reload(); } });
  el.querySelector('.dt-next').addEventListener('click', () => { if ((state.page + 1) * state.size < state.total) { state.page++; reload(); } });

  tbody.addEventListener('click', e => {
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      const row = state.rows[Number(actBtn.closest('tr').dataset.idx)];
      const act = opts.actions(row)[Number(actBtn.dataset.act)];
      act?.run(row);
      return;
    }
    if (!opts.expand || e.target.closest('a, button, input, select')) return;
    const tr = e.target.closest('tr.dt-row');
    if (!tr) return;
    const row = state.rows[Number(tr.dataset.idx)];
    if (state.expanded.has(row.id)) state.expanded.delete(row.id); else state.expanded.add(row.id);
    render();
  });

  function render() {
    el.querySelectorAll('.dt-sort').forEach(b => {
      const on = state.sort?.key === b.dataset.key;
      b.closest('th').setAttribute('aria-sort', on ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      b.querySelector('.dt-arrow').textContent = on ? (state.sort.dir === 'asc' ? '▲' : '▼') : '';
    });
    if (!state.rows.length) {
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="dt-empty">${esc(opts.empty || 'Nessun elemento')}</td></tr>`;
    } else {
      tbody.innerHTML = state.rows.map((r, i) => {
        const acts = opts.actions ? opts.actions(r) : [];
        const open = opts.expand && state.expanded.has(r.id);
        const detail = open ? opts.expand(r) : null;
        return `<tr class="dt-row ${opts.expand ? 'clickable' : ''} ${open ? 'open' : ''} ${opts.rowClass ? opts.rowClass(r) : ''}" data-idx="${i}">
          ${opts.columns.map(c => `<td class="${c.className || ''}" data-label="${esc(c.label)}">${c.render ? c.render(r) : esc(get(r, c.key) ?? '') || '<span class="muted">—</span>'}</td>`).join('')}
          ${opts.actions ? `<td class="dt-actions">${acts.map((a, j) => `<button type="button" class="dt-act ${a.kind || ''}" data-act="${j}" title="${esc(a.label)}" aria-label="${esc(a.label)}">${a.icon || esc(a.label)}</button>`).join('')}</td>` : ''}
        </tr>${detail ? `<tr class="dt-detail"><td colspan="${colspan}">${detail}</td></tr>` : ''}`;
      }).join('');
    }
    const pages = Math.max(1, Math.ceil(state.total / state.size));
    el.querySelector('.dt-total').textContent = `${state.total.toLocaleString('it-IT')} element${state.total === 1 ? 'o' : 'i'}`;
    el.querySelector('.dt-page').textContent = `${state.page + 1} / ${pages}`;
    el.querySelector('.dt-prev').disabled = state.page === 0;
    el.querySelector('.dt-next').disabled = state.page + 1 >= pages;
  }

  async function reload() {
    const seq = ++state.seq;
    el.classList.add('loading');
    try {
      const { rows, total } = await opts.load({ limit: state.size, offset: state.page * state.size, filters: { ...state.filters }, sort: state.sort });
      if (seq !== state.seq) return;
      // se la pagina corrente è rimasta vuota (es. dopo un'eliminazione) torno indietro
      if (!rows.length && state.page > 0 && total > 0) { state.page = Math.max(0, Math.ceil(total / state.size) - 1); return reload(); }
      state.rows = rows;
      state.total = total;
      render();
    } catch (err) {
      if (seq !== state.seq) return;
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="dt-empty err">Impossibile caricare i dati: ${esc(err.message)}</td></tr>`;
    } finally {
      if (seq === state.seq) el.classList.remove('loading');
    }
  }

  reload();
  return { reload, get filters() { return { ...state.filters }; }, get sort() { return state.sort; }, destroy() { state.seq++; clearTimeout(filterTimer); } };
}

export function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
