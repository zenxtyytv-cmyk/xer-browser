// Unit tests: clear-browsing-data planning + Ollama settings sanitizing (no Electron needed for cleardata).
const cd = require('../src/main/cleardata');
let f = 0; const ck = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) f++; };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const NOW = 1_000_000_000_000;
ck('plan needs at least one kind', throws(() => cd.plan({ kinds: [] })));
ck('plan rejects missing request', throws(() => cd.plan()));
ck('plan drops unknown kinds', throws(() => cd.plan({ kinds: ['bogus', '__proto__'] })));
ck('plan keeps known kinds, dedupes', JSON.stringify(cd.plan({ kinds: ['history', 'history', 'cache', 'x'] }).kinds) === '["history","cache"]');
ck('range all means since 0', cd.plan({ kinds: ['history'], range: 'all' }, NOW).since === 0);
ck('range hour', cd.plan({ kinds: ['history'], range: 'hour' }, NOW).since === NOW - 3600e3);
ck('range day', cd.plan({ kinds: ['history'], range: 'day' }, NOW).since === NOW - 86400e3);
ck('range week', cd.plan({ kinds: ['history'], range: 'week' }, NOW).since === NOW - 7 * 86400e3);
ck('unknown range falls back to all', cd.plan({ kinds: ['history'], range: 'constructor' }, NOW).range === 'all');
ck('default range is all', cd.plan({ kinds: ['history'] }, NOW).range === 'all');
const items = [{ t: NOW - 10 }, { t: NOW - 5e6 }, { t: NOW - 9e8 }, { nothing: 1 }];
ck('keepOlder with since 0 clears all', cd.keepOlder(items, 0, 't').length === 0);
ck('keepOlder keeps only older entries', cd.keepOlder(items, NOW - 1e6, 't').length === 3);
ck('keepOlder keeps entries with no time (not provably recent)', cd.keepOlder(items, NOW - 1e6, 't').some(i => i.nothing));
ck('keepOlder tolerates non-arrays', cd.keepOlder(null, 5).length === 0);
ck('cookie clear never lists the cache', !cd.COOKIE_STORAGES.includes('cache') && cd.COOKIE_STORAGES.includes('cookies'));

// localai.sanitize (requires store -> electron, so stub it)
const Module = require('module'); const orig = Module._load;
Module._load = function (r, ...a) { if (r === 'electron') return { app: { getPath: () => '/tmp' } }; return orig.call(this, r, ...a); };
const ai = require('../src/main/localai'); Module._load = orig;
ck('sanitize keeps valid provider', ai.sanitize({ provider: 'local' }).provider === 'local');
ck('sanitize rejects bad provider', !('provider' in ai.sanitize({ provider: 'evil' })));
ck('sanitize drops unknown keys', Object.keys(ai.sanitize({ foo: 1, __proto__: { x: 1 }, model: 'm' })).join() === 'model');
ck('sanitize accepts http url as origin', ai.sanitize({ ollamaUrl: 'http://127.0.0.1:11434/x' }).ollamaUrl === 'http://127.0.0.1:11434');
ck('sanitize rejects file: and javascript: urls', !('ollamaUrl' in ai.sanitize({ ollamaUrl: 'file:///etc/passwd' })) && !('ollamaUrl' in ai.sanitize({ ollamaUrl: 'javascript:1' })));
ck('sanitize rejects non-object', Object.keys(ai.sanitize('x')).length === 0);
console.log(f ? f + ' FAILED' : 'ALL PASSED'); process.exit(f ? 1 : 0);
