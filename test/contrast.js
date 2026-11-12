// Measures REAL text contrast on the new-tab page: for every visible text element, compare its colour with the
// pixels actually rendered behind it (taken from a screenshot), so wallpaper + glass blending is included.
const { spawn } = require('child_process'); const WebSocket = require('ws'); const fs = require('fs'); const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();
const { waitReady, freshProfile, sleep } = require('./helpers');
const zlib = require('zlib');
const cdp = (u, method, params = {}) => new Promise((res, rej) => { const ws = new WebSocket(u);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method, params })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result); } }); ws.on('error', rej); });
const lum = (c) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
(async () => {
  const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${freshProfile()}`, '--remote-debugging-port=9391'], { stdio: 'ignore', detached: true });
  let ok = true;
  try {
    const t = await waitReady(9391); const nt = t.find(x => x.url.includes('newtab.html')); await sleep(2000);
    globalThis.__main = t.find(x => x.url.includes('renderer/index.html'));
    await cdp(nt.webSocketDebuggerUrl, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }); await sleep(500);
    // text boxes + colours from the DOM
    const js = `(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement; const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); if (b.width < 4 || b.height < 4 || b.bottom < 0 || b.top > innerHeight) continue;
        if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue; // gradient-clipped logo text
        out.push({ t: n.textContent.trim().slice(0, 24), x: b.left, y: b.top, w: b.width, h: b.height, c: cs.color, dock: !!el.closest('#dock') }); }
      return out; })()`;
    const boxes = (await cdp(nt.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: js, returnByValue: true })).result.value;
    const shot = await cdp(nt.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/contrast.png', Buffer.from(shot.data, 'base64'));
    // Decode PNG (RGB/RGBA 8-bit) without extra deps
    const buf = Buffer.from(shot.data, 'base64'); let o = 8, W = 0, H = 0, ct = 0; const idat = [];
    while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.slice(o + 8, o + 8 + len);
      if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); ct = d[9]; } if (type === 'IDAT') idat.push(d); o += 12 + len; }
    const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = W * bpp, px = Buffer.alloc(H * stride);
    for (let y = 0; y < H; y++) { const f = raw[y * (stride + 1)], row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)), prev = y ? px.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride), cur = px.slice(y * stride, (y + 1) * stride);
      for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = row[i];
        if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); } cur[i] = v & 255; } }
    const at = (x, y) => { const i = y * stride + x * bpp; return [px[i], px[i + 1], px[i + 2]]; };
    let textBad = [], iconBad = [], nText = 0, nIcon = 0;
    for (const b of boxes) {
      const fg = (b.c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const isIcon = b.dock; const pad = isIcon ? 0 : 0;
      // background = the most common (coarsely bucketed) colour among pixels in the box that are far from the text colour
      const counts = new Map();
      for (let y = Math.max(0, b.y | 0); y < Math.min(H, (b.y + b.h) | 0); y++) for (let x = Math.max(0, b.x | 0); x < Math.min(W, (b.x + b.w) | 0); x++) {
        const c = at(x, y); if (Math.abs(c[0] - fg[0]) + Math.abs(c[1] - fg[1]) + Math.abs(c[2] - fg[2]) < 60) continue; // skip glyph pixels
        const k = (c[0] >> 3) + ',' + (c[1] >> 3) + ',' + (c[2] >> 3); counts.set(k, (counts.get(k) || 0) + 1); }
      if (!counts.size) continue;
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(v => v * 8 + 4);
      const r = ratio(fg, top);
      if (isIcon) { nIcon++; if (r < 3) iconBad.push([r.toFixed(1), b.t]); } else { nText++; if (r < 4.5) textBad.push([r.toFixed(1), b.t, b.c]); }
    }
    const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
    console.log('measured ' + nText + ' text elements and ' + nIcon + ' dock icons from real rendered pixels');
    check('all widget/bar text has >= 4.5:1 contrast' + (textBad.length ? ' ' + JSON.stringify(textBad) : ''), textBad.length === 0);
    check('all dock icons have >= 3:1 contrast' + (iconBad.length ? ' ' + JSON.stringify(iconBad) : ''), iconBad.length === 0);
    check('measured a sensible number of elements', nText >= 8 && nIcon >= 8);
  } catch (e) { console.log('ERR ' + e.message); ok = false; }
  try { process.kill(-p.pid, 'SIGTERM'); } catch {} await sleep(800);
  console.log(ok ? 'CONTRAST PASSED' : 'CONTRAST FAILED'); process.exit(ok ? 0 : 1);
})();
