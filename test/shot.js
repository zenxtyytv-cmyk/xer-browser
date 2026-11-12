// Screenshot tool: boots the real app and saves PNGs of the window (chrome) and the new-tab page.
const { spawn } = require('child_process'); const WebSocket = require('ws'); const fs = require('fs');
const { waitReady, freshProfile, get, sleep } = require('./helpers');
const cdp = (u, method, params = {}) => new Promise((res, rej) => { const ws = new WebSocket(u);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method, params })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result); } }); ws.on('error', rej); });
(async () => {
  const out = process.argv[2] || '/tmp/shots'; fs.mkdirSync(out, { recursive: true });
  const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${freshProfile()}`, '--remote-debugging-port=9390', '--window-size=1280,800'], { stdio: 'ignore', detached: true });
  try {
    const t = await waitReady(9390); const main = t.find(x => x.url.includes('renderer/index.html'));
    const nt = t.find(x => x.url.includes('newtab.html'));
    await sleep(2500);
    const m = await cdp(main.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out + '/chrome.png', Buffer.from(m.data, 'base64'));
    if (nt) { await cdp(nt.webSocketDebuggerUrl, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 716, deviceScaleFactor: 1, mobile: false });
      await sleep(600); const n = await cdp(nt.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out + '/newtab.png', Buffer.from(n.data, 'base64')); }
    console.log('saved to ' + out);
  } catch (e) { console.log('ERR ' + e.message); }
  try { process.kill(-p.pid, 'SIGTERM'); } catch {} await sleep(800); process.exit(0);
})();
