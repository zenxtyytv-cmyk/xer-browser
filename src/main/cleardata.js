// Clear browsing data (Settings > Privacy). Pure helpers: choose what to clear and for how long,
// so they can be unit tested without Electron. main.js performs the actual clearing.
const KINDS = ['history', 'cookies', 'cache', 'permissions', 'downloads'];
const RANGES = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, all: Infinity };

// Returns { kinds: [...], range, since } or throws a readable error. Unknown kinds are dropped.
function plan(req, now = Date.now()) {
  const r = req && typeof req === 'object' ? req : {};
  const kinds = [...new Set((Array.isArray(r.kinds) ? r.kinds : []).filter(k => KINDS.includes(k)))];
  if (!kinds.length) throw new Error('Pick at least one thing to clear.');
  const range = Object.prototype.hasOwnProperty.call(RANGES, r.range) ? r.range : 'all';
  return { kinds, range, since: RANGES[range] === Infinity ? 0 : now - RANGES[range] };
}

// Keeps items older than `since` (items need a numeric time field). since 0 clears everything.
function keepOlder(list, since, field = 'time') {
  if (!Array.isArray(list)) return [];
  if (!since) return [];
  return list.filter(i => !(Number(i && i[field]) >= since));
}

// Electron clearStorageData options for the cookies kind: cookies and site storage, never the cache.
const COOKIE_STORAGES = ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql', 'filesystem'];
module.exports = { KINDS, RANGES, plan, keepOlder, COOKIE_STORAGES };
