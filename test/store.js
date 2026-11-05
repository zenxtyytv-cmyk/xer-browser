// Store tests: atomic writes + recovery from a corrupted/empty file.
const { app } = require('electron'); const fs = require('fs'); const os = require('os'); const path = require('path');
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu');
let f = 0; const ck = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) f++; };
app.whenReady().then(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xer-store-')); app.setPath('userData', dir);
  const store = require('../src/main/store');
  store.save('x', { a: 1 }); ck('save + load round trip', store.load('x', null).a === 1);
  ck('no leftover .tmp file', !fs.existsSync(path.join(dir, 'x.json.tmp')));
  store.save('x', { a: 2 }); ck('overwrite works', store.load('x', null).a === 2);
  ck('.bak holds previous version', JSON.parse(fs.readFileSync(path.join(dir, 'x.json.bak'), 'utf8')).a === 1);
  fs.writeFileSync(path.join(dir, 'x.json'), '');                    // simulate crash that left an empty file
  ck('empty file recovers from .bak', store.load('x', null)?.a === 1);
  fs.writeFileSync(path.join(dir, 'x.json'), '{"a":'); // truncated JSON
  ck('truncated file recovers from .bak', store.load('x', null)?.a === 1);
  ck('missing file returns default', store.load('nope', 'dflt') === 'dflt');
  fs.writeFileSync(path.join(dir, 'y.json'), 'garbage'); ck('corrupt with no .bak returns default', store.load('y', 7) === 7);
  console.log(f ? f + ' FAILED' : 'ALL PASSED'); app.exit(f ? 1 : 0);
});
