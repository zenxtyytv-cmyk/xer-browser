// Feature tests: electron test/features.js --no-sandbox --disable-gpu
const { app, BrowserWindow, session } = require('electron');
const path = require('path'); const http = require('http'); const net = require('net');
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const { calc } = require('../src/renderer/calc');

app.whenReady().then(async () => {
  const network = require('../src/main/network');
  // calculator
  check('calc basic', calc('2*(3+4)') === 14);
  let bad = false; try { calc('alert(1)'); } catch { bad = true; } check('calc rejects code', bad);

  // proxy validation
  for (const [u, ok] of [['socks5://127.0.0.1:9050', true], ['http://proxy.example:8080', true], ['ftp://x:1', false], ['socks5://host', false], ['socks5://h:99999', false], ['javascript:alert(1)', false]]) {
    let got = true; try { await network.addProxy({ name: 't', url: u }); } catch { got = false; }
    check('proxy validate ' + u, got === ok);
  }

  // real routing test: local HTTP proxy that records requests
  let seen = [];
  const proxy = http.createServer((req, res) => { seen.push(req.url); res.end('via-proxy'); });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  const port = proxy.address().port;
  const st = await network.addProxy({ name: 'local', url: `http://127.0.0.1:${port}` });
  const id = st.proxies.find(p => p.url.endsWith(':' + port)).id;
  await network.setMode('proxy', id);
  const ses = session.fromPartition('persist:xer');
  const r = await ses.fetch('http://example.test/hello'); const body = await r.text();
  check('traffic routed through proxy', body === 'via-proxy' && seen.some(u => u.includes('example.test/hello')));
  await network.setMode('direct');
  seen = []; let direct = true; try { await ses.fetch('http://example.test/x', { signal: AbortSignal.timeout(3000) }); direct = seen.length === 0; } catch { direct = seen.length === 0; }
  check('direct mode bypasses proxy', direct);
  proxy.close();

  // dashboard pages load and render
  const w = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '../src/main/preload-internal.js'), contextIsolation: true } });
  const widgets = require('../src/main/widgets'); const { ipcMain } = require('electron');
  const guardless = { 'dash:get': () => ({ ...widgets.get(), blocked: 7, bookmarks: [] }), 'dash:set': (d) => widgets.set(d), 'dash:reset': () => widgets.reset(),
    'net:status': () => network.status(), 'ai:get': () => ({ provider: 'claude', ollamaUrl: 'http://127.0.0.1:11434', model: '' }), 'ai:set': () => ({}), 'ai:models': () => ({ ok: false, error: 'x' }) };
  for (const [k, f] of Object.entries(guardless)) ipcMain.handle(k, async (_, ...a) => f(...a));
  const errs = []; w.webContents.on('console-message', (e, l, m) => { if (l >= 3) errs.push(m); });
  await w.loadFile(path.join(__dirname, '../src/renderer/newtab.html')); await new Promise(r => setTimeout(r, 800));
  const n = await w.webContents.executeJavaScript('document.querySelectorAll(".w").length');
  check('dashboard renders default widgets (' + n + ')', n === 6);
  await w.webContents.executeJavaScript('document.querySelector("[data-add=calc]").click()'); await new Promise(r => setTimeout(r, 300));
  check('add widget works', (await w.webContents.executeJavaScript('document.querySelectorAll(".w").length')) === 7);
  check('widget persisted', widgets.get().widgets.length === 7);
  await w.webContents.executeJavaScript('document.querySelector("#cAccent").value="#ff0000";document.querySelector("#cAccent").dispatchEvent(new Event("input"))');
  check('theme change applies', (await w.webContents.executeJavaScript('getComputedStyle(document.documentElement).getPropertyValue("--accent")')).trim() === '#ff0000');
  check('no dashboard errors', errs.length === 0);
  if (errs.length) console.log(errs);
  await w.loadFile(path.join(__dirname, '../src/renderer/settings.html')); await new Promise(r => setTimeout(r, 800));
  check('settings page renders', await w.webContents.executeJavaScript('!!document.querySelector("#plist") && document.querySelectorAll(".px").length >= 1'));
  check('no settings errors', errs.length === 0);
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); app.exit(fails ? 1 : 0);
});
