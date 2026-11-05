const http = require('http');
const get = (u) => new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Wait until the app's debug port lists both the main window and the first tab page.
async function waitReady(port, timeoutMs = 45000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const t = await get(`http://127.0.0.1:${port}/json`);
      if (t.some(x => x.url.includes('renderer/index.html')) && t.length >= 2) { await sleep(800); return t; }
    } catch {}
    await sleep(400);
  }
  throw new Error('app not ready on port ' + port + ' after ' + timeoutMs + 'ms');
}
const fs = require('fs'), os = require('os'), path = require('path');
const freshProfile = () => fs.mkdtempSync(path.join(os.tmpdir(), 'xer-test-'));
module.exports = { get, sleep, waitReady, freshProfile };
