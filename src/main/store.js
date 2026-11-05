// Tiny JSON persistence for bookmarks, history, session, and site permissions.
// Writes are atomic (temp file + rename) so a crash or kill mid-write can never
// leave a truncated or empty file behind. A .bak copy is kept as a second chance.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const file = (n) => path.join(app.getPath('userData'), n + '.json');

function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

function load(name, def) {
  const f = file(name);
  try { return readJson(f); } catch {}
  try { return readJson(f + '.bak'); } catch {}   // recover from the last good copy
  return def;
}

function save(name, data) {
  const f = file(name), tmp = f + '.tmp';
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    try { fs.copyFileSync(f, f + '.bak'); } catch {}  // previous good version
    fs.renameSync(tmp, f);                             // atomic replace
  } catch {}
}
module.exports = { load, save };
