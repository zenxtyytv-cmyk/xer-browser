// Live extension test: loads a real unpacked MV3 extension into an Electron session and checks that its
// content script runs on a page, that disabling/removing works, and that settings renders the section.
// Run: xvfb-run -a npx electron test/extlive.js --no-sandbox --disable-gpu
const { app, BrowserWindow, session } = require('electron');
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const E = require('../src/main/extensions');

app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xerextlive-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Xer Test Ext', version: '1.0', description: 'test',
    content_scripts: [{ matches: ['http://127.0.0.1/*'], js: ['c.js'], run_at: 'document_end' }]
  }));
  fs.writeFileSync(path.join(dir, 'c.js'), "document.documentElement.setAttribute('data-xer-ext','ran');");

  const m = E.readManifest(dir);
  check('manifest validates', m.name === 'Xer Test Ext' && m.risky.length === 0 && m.allSites === false);

  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<html><body>hi</body></html>'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';

  const ses = session.fromPartition('persist:xerexttest');
  let ext = null, loadErr = '';
  try { ext = await ses.extensions.loadExtension(dir, { allowFileAccess: false }); } catch (e) { loadErr = e.message; }
  check('extension loads into the session' + (loadErr ? ' (' + loadErr + ')' : ''), !!(ext && ext.id));
  check('extension is listed by the session', !!ext && !!ses.extensions.getExtension(ext.id));

  // Like the real browser: ONE long-lived window stays open while extensions are enabled/disabled.
  // (Electron 39 can hard-crash if the only window on a session is destroyed and recreated right after removeExtension.)
  const live = new BrowserWindow({ show: false, webPreferences: { session: ses, contextIsolation: true } });
  let n = 0;
  async function probe() {
    await live.loadURL(url + '?n=' + (++n)); await new Promise(r => setTimeout(r, 600));
    return live.webContents.executeJavaScript("document.documentElement.getAttribute('data-xer-ext')");
  }
  check('content script ran on the page', (await probe()) === 'ran');

  await ses.extensions.removeExtension(ext.id);
  await new Promise(r => setTimeout(r, 800));
  check('removed extension is gone from the session', !ses.extensions.getExtension(ext.id));
  check('content script no longer runs after removal', (await probe()) === null);
  check('browsing still works after removal (page loaded)', live.webContents.getURL().includes('n=' + n));

  let reload = null; try { reload = await ses.extensions.loadExtension(dir); } catch {}
  check('extension can be re-enabled', !!(reload && reload.id));
  check('re-enabled content script runs again', (await probe()) === 'ran');

  let bad = ''; try { await ses.extensions.loadExtension(path.join(dir, 'nope')); } catch (e) { bad = e.message; }
  check('loading a missing folder fails cleanly', bad.length > 0);

  // Settings page renders the Extensions section and survives with stub IPC
  const { ipcMain } = require('electron');
  ipcMain.handle('ext:list', () => [{ path: dir, name: 'Xer Test Ext', version: '1.0', enabled: true, loaded: true, id: 'abc' }]);
  for (const c of ['net:status', 'ai:get', 'game:get', 'dash:get']) { try { ipcMain.handle(c, () => ({ mode: 'direct', proxies: [], dohOn: false, provider: 'claude', ollamaUrl: '', cfg: {}, restartNeeded: false })); } catch {} }
  const sw = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '../src/main/preload-internal.js'), contextIsolation: true, sandbox: false } });
  const errs = []; sw.webContents.on('console-message', (e, l, m) => { if (l >= 3) errs.push(m); });
  await sw.loadFile(path.join(__dirname, '../src/renderer/settings.html')); await new Promise(r => setTimeout(r, 800));
  const txt = await sw.webContents.executeJavaScript("document.querySelector('#extlist').innerText");
  check('settings lists the extension with status', /Xer Test Ext/.test(txt) && /running/.test(txt));
  check('settings has no script errors', errs.length === 0);
  if (errs.length) console.log(errs.join('\n'));

  srv.close(); app.exit(fails ? 1 : 0);
});
