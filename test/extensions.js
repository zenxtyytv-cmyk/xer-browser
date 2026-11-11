// Unit tests for extension manifest validation and list handling (no Electron needed).
const E = require('../src/main/extensions');
const fs = require('fs'), os = require('os'), path = require('path');
let fail = 0;
const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fail++; };
const throws = (f) => { try { f(); return false; } catch { return true; } };

const ok3 = E.validateManifest({ manifest_version: 3, name: ' Dark Mode ', version: '1.2', permissions: ['storage', 'tabs'], host_permissions: ['<all_urls>'], description: 'x' });
check('MV3 accepted, name trimmed', ok3.name === 'Dark Mode' && ok3.manifestVersion === 3);
check('risky permissions flagged', ok3.risky.includes('tabs') && ok3.risky.includes('<all_urls>') && !ok3.risky.includes('storage'));
check('all-sites access detected', ok3.allSites === true);
check('MV2 accepted', E.validateManifest({ manifest_version: 2, name: 'a', version: '1' }).manifestVersion === 2);
check('quiet extension has no risk', E.validateManifest({ manifest_version: 3, name: 'a', version: '1', permissions: ['storage'] }).risky.length === 0);
check('wildcard host is all-sites', E.validateManifest({ manifest_version: 3, name: 'a', version: '1', host_permissions: ['https://*/*'] }).allSites === true);
check('single-site host is not all-sites', E.validateManifest({ manifest_version: 3, name: 'a', version: '1', host_permissions: ['https://example.com/*'] }).allSites === false);
check('rejects manifest_version 1', throws(() => E.validateManifest({ manifest_version: 1, name: 'a', version: '1' })));
check('rejects missing name', throws(() => E.validateManifest({ manifest_version: 3, version: '1' })));
check('rejects missing version', throws(() => E.validateManifest({ manifest_version: 3, name: 'a' })));
check('rejects non-object / array / null', throws(() => E.validateManifest(null)) && throws(() => E.validateManifest([])) && throws(() => E.validateManifest('x')));
check('non-string permissions ignored', E.validateManifest({ manifest_version: 3, name: 'a', version: '1', permissions: [1, null, 'tabs'] }).permissions.length === 1);
check('__MSG_ description hidden', E.validateManifest({ manifest_version: 3, name: 'a', version: '1', description: '__MSG_desc__' }).description === '');

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'xerext-'));
check('missing manifest.json gives clear error', throws(() => E.readManifest(d)));
fs.writeFileSync(path.join(d, 'manifest.json'), '{ nope');
check('invalid JSON gives error', throws(() => E.readManifest(d)));
fs.writeFileSync(path.join(d, 'manifest.json'), '\uFEFF' + JSON.stringify({ manifest_version: 3, name: 'BOM ext', version: '2' }));
check('BOM-prefixed manifest parses', E.readManifest(d).name === 'BOM ext');

const list = E.normalizeList([{ path: '/a', name: 'A' }, { path: '/a', name: 'dup' }, { path: 'rel/path' }, null, { path: '/b', enabled: false }, 5]);
check('list drops duplicates, relative paths and junk', list.length === 2 && list[0].path === '/a' && list[1].path === '/b');
check('enabled defaults true, false preserved', list[0].enabled === true && list[1].enabled === false);
check('non-array list becomes empty', E.normalizeList(undefined).length === 0 && E.normalizeList({}).length === 0);
const up = E.upsert(list, { path: '/a', name: 'A2', version: '9', id: 'x' });
check('upsert replaces same path, no duplicate', up.length === 2 && up.find(e => e.path === '/a').name === 'A2');
process.exit(fail ? 1 : 0);
