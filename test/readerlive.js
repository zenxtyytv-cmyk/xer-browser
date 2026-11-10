// Live reader-mode safety test against the REAL app: a hostile article must not run any script in the reader page.
const { spawn } = require('child_process'); const http = require('http');
const WebSocket = require('ws'); const { waitReady, freshProfile, get, sleep } = require('./helpers');
const evalIn = (u, expr) => new Promise((res, rej) => { const ws = new WebSocket(u);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result?.result?.value ?? d.result?.exceptionDetails?.exception?.description); } }); ws.on('error', rej); });
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
const para = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ';
const ARTICLE = `<html><head><title>Hostile article</title></head><body><article><h1>Hostile article</h1><p>${para}</p><p>${para}</p>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onload="window.__pwned=(window.__pwned||0)+1" onerror="window.__pwned=(window.__pwned||0)+10">
<p><a id="evil" href="javascript:window.__pwned=100">a link</a> ${para}</p><p>${para}</p></article></body></html>`;
const prof = freshProfile();
const killp = (p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch {} };
(async () => {
  const site = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(ARTICLE); }).listen(9667);
  const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${prof}`, '--remote-debugging-port=9361'], { stdio: 'ignore', detached: true });
  try {
    let t = await waitReady(9361); const main = t.find(x => x.url.includes('renderer/index.html'));
    await evalIn(main.webSocketDebuggerUrl, 'window.xer.newTab("http://127.0.0.1:9667/")'); await sleep(3500);
    const r = await evalIn(main.webSocketDebuggerUrl, 'window.xer.readerOpen()');
    check('reader mode reports success', r && r.ok === true);
    await sleep(2000);
    t = await get('http://127.0.0.1:9361/json'); const rd = t.find(x => x.url.startsWith('data:text/html'));
    check('reader page opened', !!rd);
    if (rd) {
      check('hostile handlers did not run', (await evalIn(rd.webSocketDebuggerUrl, 'String(window.__pwned)')) === 'undefined');
      check('no on* attributes left in page', (await evalIn(rd.webSocketDebuggerUrl, 'document.querySelectorAll("[onload],[onerror],[onclick]").length')) === 0);
      check('no javascript: links left', (await evalIn(rd.webSocketDebuggerUrl, '[...document.querySelectorAll("a")].filter(a => /^javascript:/i.test(a.getAttribute("href")||"")).length')) === 0);
      check('article text still shown', /Hostile article/.test(await evalIn(rd.webSocketDebuggerUrl, 'document.body.innerText')) && /Lorem ipsum/.test(await evalIn(rd.webSocketDebuggerUrl, 'document.body.innerText')));
      check('CSP meta present', (await evalIn(rd.webSocketDebuggerUrl, 'document.querySelector("meta[http-equiv=Content-Security-Policy]") ? document.querySelector("meta[http-equiv=Content-Security-Policy]").content : ""')).includes("default-src 'none'"));
      check('reader page cannot reach Xer APIs', (await evalIn(rd.webSocketDebuggerUrl, 'typeof window.xer')) !== 'object' || (await evalIn(rd.webSocketDebuggerUrl, 'window.xer.game ? "has-game" : "none"')) !== 'has-game');
    }
  } catch (e) { console.log('FAIL exception: ' + e.message); ok = false; }
  killp(p); site.close(); setTimeout(() => process.exit(ok ? 0 : 1), 500);
})();
