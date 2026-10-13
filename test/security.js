// Security e2e: drives the REAL app via DevTools protocol.
// Verifies internal-page IPC works from bundled pages and is rejected from web pages.
const { spawn } = require('child_process'); const http = require('http'); const WebSocket = require('ws');
const get = (u) => new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function evalIn(wsUrl, expr) { return new Promise((res, rej) => { const ws = new WebSocket(wsUrl);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result?.result?.value ?? d.result?.exceptionDetails?.exception?.description); } });
  ws.on('error', rej); }); }
(async () => {
  // local "evil" site whose URL ends in index.html
  const evil = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<h1>evil</h1>'); }).listen(9444);
  const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9334'], { stdio: 'ignore', detached: true });
  let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
  try {
    await sleep(9000);
    let targets = await get('http://127.0.0.1:9334/json');
    const nt = targets.find(t => t.url.includes('newtab.html'));
    check('newtab target found', !!nt);
    const r1 = await evalIn(nt.webSocketDebuggerUrl, 'window.xerInternal.net.status().then(s => typeof s.mode)');
    check('internal page can call net:status', r1 === 'string');
    // open a web tab and navigate it to the lookalike URL, via the main window API
    const main = targets.find(t => t.url.includes('renderer/index.html'));
    await evalIn(main.webSocketDebuggerUrl, 'window.xer.newTab("http://127.0.0.1:9444/index.html")'); await sleep(2500);
    targets = await get('http://127.0.0.1:9334/json');
    const web = targets.find(t => t.url.includes('9444'));
    check('web tab opened', !!web);
    if (web) {
      const r2 = await evalIn(web.webSocketDebuggerUrl, 'typeof window.xerInternal + "|" + typeof window.xer');
      check('web page has NO xerInternal / xer API', r2 === 'undefined|undefined');
    }
  } catch (e) { check('error ' + e.message, false); }
  try { process.kill(-p.pid); } catch { p.kill('SIGKILL'); } evil.close();
  console.log(ok ? 'SECURITY PASSED' : 'SECURITY FAILED'); process.exit(ok ? 0 : 1);
})();
