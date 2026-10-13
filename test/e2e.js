// E2E: launches the real app with --remote-debugging-port and checks tab behavior.
const { spawn } = require('child_process');
const http = require('http');
const get = (u) => new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9333'], { stdio: 'ignore', detached: true });
  let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
  try {
    await sleep(8000);
    const targets = await get('http://127.0.0.1:9333/json');
    check('main window target exists', targets.some(t => t.url.includes('index.html')));
    check('first tab (newtab page) exists', targets.some(t => t.url.includes('newtab.html')));
  } catch (e) { check('app reachable: ' + e.message, false); }
  try { process.kill(-p.pid); } catch { p.kill('SIGKILL'); }
  console.log(ok ? 'E2E PASSED' : 'E2E FAILED'); process.exit(ok ? 0 : 1);
})();
