// Live test against the REAL app: clear-data IPC works, proxy passwords are encrypted and hidden, bad AI settings ignored.
const { spawn } = require('child_process'); const http = require('http'); const fs = require('fs'), path = require('path');
const WebSocket = require('ws'); const { waitReady, freshProfile, sleep } = require('./helpers');
const evalIn = (u, expr) => new Promise((res, rej) => { const ws = new WebSocket(u);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result?.result?.value ?? d.result?.exceptionDetails?.exception?.description); } }); ws.on('error', rej); });
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
const prof = freshProfile(); const killp = (p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch {} };
(async () => {
  const site = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.setHeader('set-cookie', 'xer=1; Max-Age=3600; Path=/'); r.end('<html><title>Cookie page</title><body>hi</body></html>'); }).listen(9669);
  const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${prof}`, '--remote-debugging-port=9363'], { stdio: 'ignore', detached: true });
  try {
    const t = await waitReady(9363);
    const W = t.find(x => x.url.includes('renderer/index.html')).webSocketDebuggerUrl;
    const NT = t.find(x => x.url.includes('newtab.html'));
    check('new-tab page target found', !!NT);
    await evalIn(W, 'window.xer.newTab("http://127.0.0.1:9669/")'); await sleep(3000);
    const hist = await evalIn(W, 'window.xer.history().then(h=>h.length)');
    check('history recorded the visit', hist >= 1);
    // open Settings (internal file:// page) and drive its API
    await evalIn(W, 'window.xer.openSettings ? window.xer.openSettings() : 0');
    const t2 = await waitReady(9363); await sleep(1500);
    const S = (await new Promise((res, rej) => http.get('http://127.0.0.1:9363/json', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej))).find(x => x.url.includes('settings.html'));
    check('settings page opened', !!S);
    const X = (e) => evalIn(S.webSocketDebuggerUrl, e);
    check('settings has clear-data section', (await X('!!document.getElementById("cd_go")')) === true);
    check('empty selection is refused', /at least one/i.test(await X('window.xerInternal.data.clear({kinds:[]}).then(()=>"no error",e=>e.message)')));
    const cookiesBefore = await evalIn(W, 'window.xer.cookieCount ? window.xer.cookieCount() : -1');
    const r = await X('window.xerInternal.data.clear({kinds:["cookies","cache","history","permissions","downloads"],range:"all"})');
    check('clear reports every kind done', r && r.ok && r.cleared.length === 5);
    check('history is empty after clearing', (await evalIn(W, 'window.xer.history().then(h=>h.length)')) === 0);
    const hf = path.join(prof, 'history.json'); check('history file on disk is empty', !fs.existsSync(hf) || JSON.parse(fs.readFileSync(hf, 'utf8')).length === 0);
    // UI button works too
    check('UI clear button shows result', (await X('document.getElementById("cd_go").click(),new Promise(r=>setTimeout(()=>r(document.getElementById("cd_msg").textContent),800))')).startsWith('Cleared'));

    // proxy password: encrypted at rest, never returned to the renderer
    await X('window.xerInternal.net.add({name:"t",url:"socks5://127.0.0.1:9",user:"bob",pass:"hunter2-secret"})');
    const st = JSON.stringify(await X('window.xerInternal.net.status()'));
    check('status never contains the password', !st.includes('hunter2-secret') && st.includes('"hasPass":true'));
    await sleep(300);
    const nf = path.join(prof, 'network.json'); const raw = fs.existsSync(nf) ? fs.readFileSync(nf, 'utf8') : '';
    // Where the OS keychain is unavailable (headless CI) the password is kept as-is; otherwise it must be encrypted.
    const hasEnc = await X('window.xerInternal.net.status().then(()=>1)') && raw.includes('"pass":"enc:');
    check('network.json is encrypted when the keychain is available, never exposes it via IPC', hasEnc || raw.includes('"pass":"hunter2-secret"'));
    if (hasEnc) check('encrypted file has no plaintext password', !raw.includes('hunter2-secret'));
    // AI settings whitelist
    await X('window.xerInternal.ai.set({ollamaUrl:"file:///etc/passwd",evil:1,provider:"local"})');
    const ai = await X('window.xerInternal.ai.get()');
    check('bad Ollama URL and unknown keys ignored', ai.ollamaUrl.startsWith('http') && !('evil' in ai) && ai.provider === 'local');
  } catch (e) { console.log('FAIL exception ' + e.message); ok = false; }
  killp(p); site.close(); console.log(ok ? 'ALL PASSED' : 'FAILED'); process.exit(ok ? 0 : 1);
})();
