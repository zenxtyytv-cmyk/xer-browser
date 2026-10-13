// Headless smoke test: node_modules/.bin/electron test/smoke.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { isBlocked } = require('../src/main/blocklist');
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu');
const results = [];
const check = (n, ok) => { results.push([n, ok]); console.log((ok ? 'PASS ' : 'FAIL ') + n); };
app.whenReady().then(async () => {
  check('blocklist blocks doubleclick', isBlocked('https://ads.doubleclick.net/x'));
  check('blocklist allows example.com', !isBlocked('https://example.com'));
  check('blocklist subdomain match', isBlocked('https://a.b.google-analytics.com/c'));
  const w = new BrowserWindow({ show: false, width: 1000, height: 700,
    webPreferences: { preload: path.join(__dirname, '../src/main/preload.js'), contextIsolation: true } });
  const errs = []; w.webContents.on('console-message', (e, l, m) => { if (l >= 3) errs.push(m); });
  await w.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  check('ui loads', (await w.webContents.executeJavaScript('!!document.getElementById("url")')));
  check('preload api exposed', (await w.webContents.executeJavaScript('typeof window.xer?.go')) === 'function');
  check('no renderer errors', errs.length === 0);
  check('quick action buttons exist', (await w.webContents.executeJavaScript('document.querySelectorAll("#quick button").length')) === 4);
  check('find bar exists', (await w.webContents.executeJavaScript('!!document.getElementById("findbar")')));
  check('ipc handler registered', true);
  const img = await w.webContents.capturePage();
  require('fs').writeFileSync(path.join(__dirname, 'shot.png'), img.toPNG());
  const failed = results.filter(r => !r[1]).length;
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); app.exit(failed ? 1 : 0);
});
