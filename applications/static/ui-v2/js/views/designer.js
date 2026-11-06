// Report designer dentro l'app: la pagina del designer in un riquadro, con il menu dell'app.
// #/designer/<entrata|uscita|tara|generica>

import { esc } from '../ui.js';

const TYPES = {
  entrata: 'Entrata',
  uscita: 'Uscita',
  tara: 'Uscita con tara',
  generica: 'Generica / test',
};

export function renderDesigner(el) {
  const sub = location.hash.replace(/^#\/?/, '').split('/')[1];
  const type = TYPES[sub] ? sub : 'uscita';
  el.innerHTML = `
    <div class="designer-page">
      <div class="designer-h">
        <a class="btn" href="#/impostazioni/stampe">‹ Stampe ed export</a>
        <h2>Modello di stampa · ${esc(TYPES[type])}</h2>
        <nav class="tabs designer-tabs" aria-label="Tipo di pesata">
          ${Object.entries(TYPES).map(([k, l]) => `<a class="tab" href="#/designer/${k}" ${k === type ? 'aria-current="page"' : ''}>${esc(l)}</a>`).join('')}
        </nav>
      </div>
      <iframe class="designer-frame" src="/report-designer/${type}" title="Report designer: modello ${esc(TYPES[type])}"></iframe>
    </div>`;
}
