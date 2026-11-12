// Game Mode must drop the costly glass blur (GPU time goes to the game) and restore it afterwards.
const { spawn } = require('child_process'); const WebSocket = require('ws');
const { waitReady, freshProfile, sleep } = require('./helpers');
const ev = (u, e) => new Promise((res, rej) => { const ws = new WebSocket(u); ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: e, awaitPromise: true, returnByValue: true } }))); ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result?.result?.value); } }); ws.on('error', rej); });
(async () => {
  const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${freshProfile()}`, '--remote-debugging-port=9393'], { stdio: 'ignore', detached: true });
  let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
  try {
    const t = await waitReady(9393); const m = t.find(x => x.url.includes('renderer/index.html'));
    const blur = () => ev(m.webSocketDebuggerUrl, 'getComputedStyle(document.getElementById("chrome")).backdropFilter');
    const b0 = await blur(); check('glass blur is ON when Game Mode is off (' + b0 + ')', /blur/.test(b0));
    await ev(m.webSocketDebuggerUrl, 'window.xer.game.toggle()'); await sleep(900);
    const b1 = await blur(); check('Game Mode drops the blur (' + b1 + ')', b1 === 'none');
    await ev(m.webSocketDebuggerUrl, 'window.xer.game.toggle()'); await sleep(900);
    const b2 = await blur(); check('blur returns when Game Mode is turned off', /blur/.test(b2));
  } catch (e) { check('error ' + e.message, false); }
  try { process.kill(-p.pid, 'SIGTERM'); } catch {} await sleep(800);
  console.log(ok ? 'LITE PASSED' : 'LITE FAILED'); process.exit(ok ? 0 : 1);
})();
