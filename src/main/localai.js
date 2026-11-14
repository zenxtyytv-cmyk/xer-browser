// Local AI provider via Ollama (https://github.com/ollama/ollama, MIT). Runs any model you
// pull yourself, fully on-device. Also works with any OpenAI-compatible local server.
const store = require('./store');
let cfg = { provider: 'claude', ollamaUrl: 'http://127.0.0.1:11434', model: '' };
const init = () => { cfg = { ...cfg, ...store.load('ai', {}) }; };
const get = () => cfg;
// Only known keys are accepted, and the Ollama URL must be http(s). Anything else is ignored.
function sanitize(p) {
  const out = {}; if (!p || typeof p !== 'object') return out;
  if (p.provider === 'claude' || p.provider === 'local') out.provider = p.provider;
  if (typeof p.model === 'string') out.model = p.model.slice(0, 200);
  if (typeof p.ollamaUrl === 'string') {
    try { const u = new URL(p.ollamaUrl.trim()); if (/^https?:$/.test(u.protocol)) out.ollamaUrl = u.origin; } catch {}
  }
  return out;
}
function set(p) { cfg = { ...cfg, ...sanitize(p) }; store.save('ai', cfg); return cfg; }

const MAX_MESSAGES = 20;          // same history cap the Claude path uses
const CONNECT_TIMEOUT = 8000;     // ms to first response byte
const IDLE_TIMEOUT = 60000;       // ms of silence mid-stream before giving up

// Keep only well-formed {role, content} turns and the most recent ones. Pure, tested.
function trimMessages(messages, max = MAX_MESSAGES) {
  return (Array.isArray(messages) ? messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-max).map(m => ({ role: m.role, content: m.content }));
}

// Incremental parser for Ollama's streaming format (one JSON object per line, NDJSON).
// feed(text) returns the new reply text found so far; chunks may split a line anywhere.
function createStreamParser() {
  let buf = '', done = false, error = null;
  const readLine = (line) => {
    line = line.trim(); if (!line) return '';
    let o; try { o = JSON.parse(line); } catch { return ''; }
    if (o.error) { error = String(o.error); return ''; }
    if (o.done) done = true;
    return o.message && typeof o.message.content === 'string' ? o.message.content : '';
  };
  return {
    feed(chunk) {
      buf += chunk; let out = ''; let i;
      while ((i = buf.indexOf('\n')) >= 0) { out += readLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
      return out;
    },
    end() { const out = readLine(buf); buf = ''; return out; },
    get done() { return done; }, get error() { return error; }
  };
}

async function models() {
  const r = await fetch(cfg.ollamaUrl + '/api/tags', { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error('Ollama error ' + r.status);
  const d = await r.json(); return (d.models || []).map(m => m.name);
}

// Streams the reply. onToken(text) is called for each piece; resolves with the full text.
// Fails (instead of hanging) when Ollama is unreachable or goes silent.
async function ask({ messages, system, onToken, signal }) {
  if (!cfg.model) throw new Error('Pick a local model in AI settings (run `ollama pull <model>` first).');
  const ctl = new AbortController();
  if (signal) signal.addEventListener('abort', () => ctl.abort());
  let timer = setTimeout(() => ctl.abort(new Error('timeout')), CONNECT_TIMEOUT);
  const bump = () => { clearTimeout(timer); timer = setTimeout(() => ctl.abort(new Error('timeout')), IDLE_TIMEOUT); };
  try {
    let r;
    try {
      r = await fetch(cfg.ollamaUrl + '/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ model: cfg.model, stream: true, messages: [{ role: 'system', content: system || '' }, ...trimMessages(messages)] })
      });
    } catch (e) { throw new Error(ctl.signal.aborted ? 'Ollama did not respond. Is it running at ' + cfg.ollamaUrl + '?' : 'Cannot reach Ollama at ' + cfg.ollamaUrl); }
    if (!r.ok) { let m = 'Ollama error ' + r.status; try { const d = await r.json(); if (d.error) m = d.error; } catch {} throw new Error(m); }
    const parser = createStreamParser(), dec = new TextDecoder(); let full = '';
    const emit = (t) => { if (t) { full += t; if (onToken) onToken(t); } };
    try {
      for await (const chunk of r.body) { bump(); emit(parser.feed(dec.decode(chunk, { stream: true }))); if (parser.error) break; }
    } catch (e) { if (!full) throw new Error(ctl.signal.aborted ? 'Ollama stopped responding.' : e.message); }
    emit(parser.feed(dec.decode()) ); emit(parser.end());
    if (parser.error) throw new Error(parser.error);
    return full;
  } finally { clearTimeout(timer); }
}
module.exports = { init, get, set, sanitize, models, ask, trimMessages, createStreamParser };
