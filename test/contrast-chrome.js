// Contrast of the browser chrome (tabs, address bar, buttons) measured on real rendered pixels, incl. an active + inactive tab.
const { spawn } = require('child_process'); const WebSocket = require('ws'); const zlib = require('zlib');
const { waitReady, freshProfile, sleep } = require('./helpers');
const cdp = (u, method, params = {}) => new Promise((res, rej) => { const ws = new WebSocket(u);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method, params })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result); } }); ws.on('error', rej); });
const lum = (c) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function decode(b64) { const buf = Buffer.from(b64, 'base64'); let o = 8, W = 0, H = 0, ct = 0; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.slice(o + 8, o + 8 + len); if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); ct = d[9]; } if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = W * bpp, px = Buffer.alloc(H * stride);
  for (let y = 0; y < H; y++) { const f = raw[y * (stride + 1)], row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)), prev = y ? px.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride), cur = px.slice(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); } cur[i] = v & 255; } }
  return { W, H, at: (x, y) => { const i = y * stride + x * bpp; return [px[i], px[i + 1], px[i + 2]]; } }; }
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
(async () => {
  const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${freshProfile()}`, '--remote-debugging-port=9392', '--window-size=1280,800'], { stdio: 'ignore', detached: true });
  try {
    const t = await waitReady(9392); const main = t.find(x => x.url.includes('renderer/index.html')); await sleep(1500);
    for (let i = 0; i < 2; i++) { await cdp(main.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: 'window.xer.newTab("data:text/html,<title>Second tab with a long title</title>")', awaitPromise: true }); await sleep(700); }
    const js = `(() => { const out = []; const w = document.createTreeWalker(document.getElementById('chrome'), NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); if (b.width < 3 || b.height < 3) continue;
        out.push({ t: n.textContent.trim().slice(0, 22), x: b.left, y: b.top, w: b.width, h: b.height, c: cs.color, tab: !!el.closest('.tab'), active: !!el.closest('.tab.active') }); }
      const u = document.getElementById('url'); const ub = u.getBoundingClientRect(); out.push({ t: 'URL placeholder', x: ub.left + 14, y: ub.top + 6, w: 120, h: ub.height - 12, c: getComputedStyle(u, '::placeholder').color, ph: true });
      return out; })()`;
    const boxes = (await cdp(main.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: js, returnByValue: true })).result.value;
    const img = decode((await cdp(main.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' })).data);
    const bad = []; let n = 0, tabs = 0, actv = 0;
    for (const b of boxes) {
      const fg = (b.c.match(/[\d.]+/g) || []).slice(0, 3).map(Number); const counts = new Map();
      for (let y = Math.max(0, b.y | 0); y < Math.min(img.H, (b.y + b.h) | 0); y++) for (let x = Math.max(0, b.x | 0); x < Math.min(img.W, (b.x + b.w) | 0); x++) {
        const c = img.at(x, y); if (Math.abs(c[0] - fg[0]) + Math.abs(c[1] - fg[1]) + Math.abs(c[2] - fg[2]) < 70) continue;
        const k = (c[0] >> 3) + ',' + (c[1] >> 3) + ',' + (c[2] >> 3); counts.set(k, (counts.get(k) || 0) + 1); }
      if (!counts.size) continue; const bg = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(v => v * 8 + 4);
      const r = ratio(fg, bg); n++; if (b.tab) tabs++; if (b.active) actv++; if (r < 4.5) bad.push([r.toFixed(1), b.t, b.c, 'bg rgb(' + bg + ')']);
    }
    console.log('measured ' + n + ' chrome text elements (' + tabs + ' in tabs, ' + actv + ' in the active tab)');
    check('chrome text >= 4.5:1' + (bad.length ? ' ' + JSON.stringify(bad) : ''), bad.length === 0);
    check('tabs were actually measured', tabs >= 2 && actv >= 1);
  } catch (e) { console.log('ERR ' + e.message); ok = false; }
  try { process.kill(-p.pid, 'SIGTERM'); } catch {} await sleep(800);
  console.log(ok ? 'CHROME CONTRAST PASSED' : 'CHROME CONTRAST FAILED'); process.exit(ok ? 0 : 1);
})();
