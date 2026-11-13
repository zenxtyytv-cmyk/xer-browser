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

async function models() {
  const r = await fetch(cfg.ollamaUrl + '/api/tags', { signal: AbortSignal.timeout(3000) });
  const d = await r.json(); return (d.models || []).map(m => m.name);
}
async function ask({ messages, system }) {
  if (!cfg.model) throw new Error('Pick a local model in AI settings (run `ollama pull <model>` first).');
  const r = await fetch(cfg.ollamaUrl + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, stream: false, messages: [{ role: 'system', content: system }, ...messages] })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Ollama error ' + r.status);
  return d.message?.content || '';
}
module.exports = { init, get, set, sanitize, models, ask };
