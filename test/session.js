// Session restore e2e: open tabs, pin one, quit, relaunch, verify tabs + pin come back.
// Uses an isolated user-data dir so it never touches real data.
const { spawn } = require('child_process'); const http = require('http'); const { waitReady } = require('./helpers'); const fs = require('fs'); const os = require('os'); const path = require('path');
const WebSocket = require('ws');
const get = (u) => new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const evalIn = (ws_url, expr) => new Promise((res, rej) => { const ws = new WebSocket(ws_url);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result?.result?.value); } }); ws.on('error', rej); });
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'xer-sess-'));
const launch = (port) => spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`], { stdio: 'ignore', detached: true });
const killp = (p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch {} };
(async () => {
  const site = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<title>' + q.url + '</title><h1>' + q.url + '</h1>'); }).listen(9555);
  let p = launch(9341);
  try {
    let t = await waitReady(9341); const main = t.find(x => x.url.includes('renderer/index.html'));
    for (const u of ['/a', '/b']) { await evalIn(main.webSocketDebuggerUrl, `window.xer.newTab("http://127.0.0.1:9555${u}")`); await sleep(1200); }
    // pin tab whose URL ends /b: find its id via the tabs event the UI renders
    const ids = await evalIn(main.webSocketDebuggerUrl, `new Promise(r => { window.xer.on('tabs', d => r(JSON.stringify(d.tabs))); window.xer.reload(); })`);
    const tabs = JSON.parse(ids); const b = tabs.find(x => x.url.endsWith('/b'));
    check('tab /b exists', !!b);
    if (b) await evalIn(main.webSocketDebuggerUrl, `window.xer.pinTab(${b.id})`);
    await sleep(2500); // let debounced autosave run (1.5s)
    const sess = JSON.parse(fs.readFileSync(path.join(udd, 'session.json'), 'utf8'));
    check('autosave wrote session without quitting', Array.isArray(sess) && sess.length >= 2);
    check('session records pinned flag', sess.some(r => r.url.endsWith('/b') && r.pinned === true));
    check('pinned tab ordered first', sess[0] && sess[0].pinned === true);
  } catch (e) { check('phase1 error: ' + e.message, false); }
  killp(p); await sleep(2500);
  p = launch(9342);
  try {
    const t = await waitReady(9342);
    const urls = t.map(x => x.url);
    check('/a restored', urls.some(u => u.endsWith('/a')));
    check('/b restored', urls.some(u => u.endsWith('/b')));
    const main = t.find(x => x.url.includes('renderer/index.html'));
    const tabs = JSON.parse(await evalIn(main.webSocketDebuggerUrl, `new Promise(r => { window.xer.on('tabs', d => r(JSON.stringify(d.tabs))); window.xer.reload(); })`));
    const rb = tabs.find(x => x.url.endsWith('/b'));
    check('/b restored AS PINNED', !!rb && rb.pinned === true);
    check('pinned tab is first in bar', tabs[0] && tabs[0].pinned === true);
  } catch (e) { check('phase2 error: ' + e.message, false); }
  if (!ok) { try { console.log('DEBUG session.json:', fs.readFileSync(path.join(udd, 'session.json'), 'utf8')); const tt = await get('http://127.0.0.1:9342/json'); console.log('DEBUG targets after relaunch:', JSON.stringify(tt.map(x => x.url))); } catch (e) { console.log('DEBUG err', e.message); } }
  killp(p); site.close();
  console.log(ok ? 'SESSION PASSED' : 'SESSION FAILED'); process.exit(ok ? 0 : 1);
})();
