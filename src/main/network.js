// Proxy / VPN manager. Works with any SOCKS5/HTTP(S) proxy, including those from
// VPN providers (Mullvad, Proton, etc.), a local Tor daemon (socks5://127.0.0.1:9050),
// or a WireGuard/OpenVPN client exposing a local SOCKS port.
const { session } = require('electron');
const store = require('./store');

let cfg = { mode: 'direct', proxies: [], active: null, dohOn: true, dohServer: 'https://cloudflare-dns.com/dns-query' };

function init() { cfg = { ...cfg, ...store.load('network', {}) }; return apply(); }
function persist() { store.save('network', cfg); }
function get() { return cfg; }

function validate(p) {
  const m = /^(socks5|socks4|http|https):\/\/([^\s:\/]+):(\d{1,5})$/i.exec((p || '').trim());
  if (!m || +m[3] > 65535) throw new Error('Use format: socks5://host:port or http://host:port');
  return p.trim();
}

async function apply() {
  const ses = session.fromPartition('persist:xer');
  const act = cfg.proxies.find(x => x.id === cfg.active);
  if (cfg.mode === 'proxy' && act) {
    await ses.setProxy({ mode: 'fixed_servers', proxyRules: act.url, proxyBypassRules: '<local>' });
  } else if (cfg.mode === 'system') {
    await ses.setProxy({ mode: 'system' });
  } else {
    await ses.setProxy({ mode: 'direct' });
  }
  return status();
}

async function status() {
  const act = cfg.proxies.find(x => x.id === cfg.active);
  return { mode: cfg.mode, active: act || null, proxies: cfg.proxies, dohOn: cfg.dohOn, dohServer: cfg.dohServer };
}

async function addProxy({ name, url, user, pass }) {
  url = validate(url);
  const id = Date.now().toString(36);
  cfg.proxies.push({ id, name: name || url, url, user: user || '', pass: pass || '' });
  persist(); return status();
}
async function removeProxy(id) {
  cfg.proxies = cfg.proxies.filter(p => p.id !== id);
  if (cfg.active === id) { cfg.active = null; cfg.mode = 'direct'; }
  persist(); return apply();
}
async function setMode(mode, id) {
  if (!['direct', 'proxy', 'system'].includes(mode)) throw new Error('bad mode');
  cfg.mode = mode; if (id) cfg.active = id;
  if (mode === 'proxy' && !cfg.active && cfg.proxies[0]) cfg.active = cfg.proxies[0].id;
  persist(); return apply();
}
function setDoh(on) { cfg.dohOn = !!on; persist(); return status(); }

// Proxy auth: called from app 'login' event
function credsFor(authInfo) {
  if (!authInfo.isProxy) return null;
  const act = cfg.proxies.find(x => x.id === cfg.active);
  return act && act.user ? { username: act.user, password: act.pass } : null;
}

// Check exit IP through current proxy (privacy check)
async function exitIp() {
  const ses = session.fromPartition('persist:xer');
  const r = await ses.fetch('https://api.ipify.org?format=json');
  return (await r.json()).ip;
}
module.exports = { init, get, status, addProxy, removeProxy, setMode, setDoh, credsFor, exitIp };
