// Websocket di un'anagrafica (/api/anagrafic/{nome}):
// - avvisi in tempo reale di inserimenti, modifiche ed eliminazioni (anche da altri utenti)
// - blocco dei record: prima di modificare o eliminare un record lo si blocca,
//   così nessun altro può modificarlo nello stesso momento.

import { getToken, wsUrl } from './api.js';

const REQUEST_TIMEOUT = 8000;

export class AnagraficSocket {
  /** onEvent({ action: 'add'|'update'|'delete'|'call'|..., data }) */
  constructor(name, onEvent) {
    this.name = name;
    this.onEvent = onEvent;
    this.pending = new Map();
    this.counter = 0;
    this.closed = false;
    this.ws = null;
    this.retry = null;
    this.connect();
  }

  connect() {
    if (this.closed) return;
    const ws = new WebSocket(wsUrl(`/api/anagrafic/${this.name}?token=${encodeURIComponent(getToken() || '')}`));
    this.ws = ws;
    this.ready = new Promise(res => { ws.addEventListener('open', res, { once: true }); });
    ws.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (_) { return; }
      if (msg.idRequest && this.pending.has(msg.idRequest)) {
        const p = this.pending.get(msg.idRequest);
        this.pending.delete(msg.idRequest);
        clearTimeout(p.timer);
        if (msg.success) p.resolve(msg.data); else p.reject(new Error(msg.error || 'Operazione non riuscita'));
        return;
      }
      if (msg.action && msg.data) {
        // il server manda il record come stringa JSON dentro { nome: "..." }
        const data = {};
        for (const [k, v] of Object.entries(msg.data)) {
          if (typeof v === 'string') { try { data[k] = JSON.parse(v); continue; } catch (_) {} }
          data[k] = v;
        }
        this.onEvent?.({ action: msg.action, data });
      }
    };
    ws.onclose = () => {
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Connessione con il server persa')); }
      this.pending.clear();
      if (!this.closed) this.retry = setTimeout(() => this.connect(), 3000);
    };
  }

  async request(action, idRecord, type, anagrafic = this.name) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      await Promise.race([this.ready, new Promise(r => setTimeout(r, 3000))]);
    }
    if (this.ws?.readyState !== WebSocket.OPEN) throw new Error('Connessione con il server non disponibile, riprova');
    const idRequest = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(idRequest); reject(new Error('Il server non risponde, riprova')); }, REQUEST_TIMEOUT);
      this.pending.set(idRequest, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ action, idRecord, type, anagrafic, idRequest }));
    });
  }

  /** Blocca il record e restituisce i suoi dati aggiornati. type: 'UPDATE' | 'DELETE' */
  lock(idRecord, type, anagrafic) { return this.request('lock', idRecord, type, anagrafic); }
  unlock(idRecord, type, anagrafic) { return this.request('unlock', idRecord, type, anagrafic).catch(() => {}); }

  close() {
    this.closed = true;
    clearTimeout(this.retry);
    try { this.ws?.close(); } catch (_) {}
  }
}
