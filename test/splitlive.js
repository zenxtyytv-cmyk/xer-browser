// Split view live test: real app, real IPC. Verifies panes, focus, ratio, swap, close behaviour and that
// closing one side / switching to an outside tab ends the split. Checks real page widths via CDP.
// Run: xvfb-run -a node test/splitlive.js
const { spawn } = require('child_process'); const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path');
const WebSocket = require('ws'); const { waitReady, get } = require('./helpers');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
const evalIn = (url, expr) => new Promise((res, rej) => { const ws = new WebSocket(url);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result?.result?.value); } }); ws.on('error', rej); });
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'xer-split-'));
const PORT = 9347;
const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`], { stdio: 'ignore', detached: true });
const killp = () => { try { process.kill(-p.pid, 'SIGTERM'); } catch {} };
// Do an action and return the settled tab state.
const snap = (main, action) => evalIn(main, `new Promise(r => { let last = null, t; window.xer.on('tabs', d => { last = JSON.stringify(d); clearTimeout(t); t = setTimeout(() => r(last), 450); }); ${action}; setTimeout(() => { if (!last) r(null); }, 4000); })`).then(v => v ? JSON.parse(v) : null);
// Inner width of each web page, as the page itself sees it.
const widths = async () => {
  const targets = (await get(`http://127.0.0.1:${PORT}/json`)).filter(x => x.url.startsWith('http://127.0.0.1:9557'));
  const out = {}; for (const t of targets) out[new URL(t.url).pathname] = await evalIn(t.webSocketDebuggerUrl, 'innerWidth');
  return out;
};

(async () => {
  const site = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<title>' + q.url + '</title><h1>' + q.url + '</h1>'); }).listen(9557);
  try {
    const t = await waitReady(PORT); const main = t.find(x => x.url.includes('renderer/index.html')).webSocketDebuggerUrl;
    for (const u of ['/a', '/b', '/c']) { await evalIn(main, `window.xer.newTab("http://127.0.0.1:9557${u}")`); await sleep(900); }
    let s = await snap(main, 'window.xer.reload()');
    const id = (u) => s.tabs.find(x => x.url.endsWith(u))?.id;
    const [A, B, C] = ['/a', '/b', '/c'].map(id);
    check('three tabs open', [A, B, C].every(x => x != null));
    check('no split initially', s.split === null);

    // split with the next tab
    await evalIn(main, `window.xer.switchTab(${A})`); await sleep(500);
    s = await snap(main, 'window.xer.split.toggle()');
    check('split opens with the next tab', s.split && s.split.left === A && s.split.right === B && s.split.ratio === 0.5);
    check('active tab is the left pane', s.activeId === A);
    await sleep(600);
    let w = await widths();
    const total = (w['/a'] || 0) + (w['/b'] || 0);
    check('both panes are visible side by side', w['/a'] > 100 && w['/b'] > 100);
    check('even split gives near-equal widths', Math.abs(w['/a'] - w['/b']) <= 2);
    check('panes together fill the window (minus divider gap)', total >= 1000 - 20);
    check('third tab is not shown in the split', s.split.left !== C && s.split.right !== C);

    // ratio
    const r = await evalIn(main, 'window.xer.split.ratio(0.7)'); await sleep(500);
    w = await widths();
    check('ratio call returns the new ratio', r === 0.7);
    check('70/30 makes left pane wider', w['/a'] > w['/b'] * 2);
    const bad = await evalIn(main, 'window.xer.split.ratio("junk")'); check('junk ratio is rejected', bad === false);
    const clamp = await evalIn(main, 'window.xer.split.ratio(0.99)'); check('extreme ratio is clamped to 0.8', clamp === 0.8);
    await evalIn(main, 'window.xer.split.ratio(0.5)');

    // draggable divider: drag to a new x, panes follow; double-click resets
    const geo = JSON.parse(await evalIn(main, `(() => { const d = document.getElementById('splitDivider'); const r = d.getBoundingClientRect(); return JSON.stringify({ hidden: d.hidden, x: r.x, w: r.width, cursor: getComputedStyle(d).cursor }); })()`));
    check('divider strip is shown while split', geo.hidden === false && geo.w === 8 && geo.cursor === 'col-resize');
    const dr = await evalIn(main, 'window.xer.split.drag(300)'); await sleep(500);
    w = await widths();
    check('drag IPC moves the divider to the pointer', dr > 0.2 && dr < 0.4 && w['/a'] < w['/b'] * 0.6);
    const lim = await evalIn(main, 'window.xer.split.drag(1)'); check('dragging past the edge clamps to 0.2', lim === 0.2);
    check('junk drag is rejected', (await evalIn(main, 'window.xer.split.drag("x")')) === false);
    // a real pointer drag on the strip, using synthetic pointer events with capture
    await evalIn(main, `(() => { const d = document.getElementById('splitDivider'); const r = d.getBoundingClientRect(); const y = r.y + 50;
      d.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: r.x + 4, clientY: y, bubbles: true }));
      d.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 700, clientY: y, bubbles: true }));
      d.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 700, clientY: y, bubbles: true })); })()`);
    await sleep(700); w = await widths();
    check('a pointer drag on the strip puts the divider under the pointer', Math.abs(w['/a'] + 4 - 700) <= 3 && w['/a'] > w['/b']);
    await evalIn(main, `document.getElementById('splitDivider').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`); await sleep(500);
    const after = await evalIn(main, 'window.xer.split.get()');
    check('double-click resets to an even split', after && after.ratio === 0.5);
    await sleep(500); w = await widths(); check('panes are equal again after reset', Math.abs(w['/a'] - w['/b']) <= 2);

    // focus moves between panes without ending the split
    s = await snap(main, `window.xer.switchTab(${B})`);
    check('clicking the other pane tab keeps split and moves focus', s.split && s.activeId === B);

    // swap
    s = await snap(main, 'window.xer.split.swap()');
    check('swap flips the sides', s.split.left === B && s.split.right === A);

    // switching to a tab outside the split ends it
    s = await snap(main, `window.xer.switchTab(${C})`);
    check('switching to an outside tab ends the split', s.split === null && s.activeId === C);
    await sleep(500); w = await widths();
    check('only the active tab is laid out full width again', w['/c'] > 900);

    // closing one side ends the split and leaves the survivor active
    await evalIn(main, `window.xer.switchTab(${A})`); await sleep(400);
    s = await snap(main, 'window.xer.split.toggle()');
    check('split reopened', !!s.split);
    const pair = [s.split.left, s.split.right];
    const other = pair.find(x => x !== s.activeId);
    s = await snap(main, `window.xer.closeTab(${s.activeId})`);
    check('closing one side ends the split', s.split === null);
    check('the surviving tab becomes active', s.activeId === other);

    // un-split via toggle keeps the focused tab
    s = await snap(main, `window.xer.switchTab(${s.tabs[0].id})`);
    s = await snap(main, 'window.xer.split.toggle()');
    if (s.split) { s = await snap(main, 'window.xer.split.toggle()'); check('toggle again closes the split', s.split === null); }
    else check('split needs two tabs, otherwise stays off', s.split === null);

    // un-split must keep the FOCUSED pane (not the originally active one) and show it full width
    s = await snap(main, 'window.xer.reload()');
    const ids = s.tabs.map(x => x.id);
    await evalIn(main, `window.xer.switchTab(${ids[0]})`); await sleep(400);
    s = await snap(main, 'window.xer.split.toggle()');
    const rightId = s.split.right;
    s = await snap(main, `window.xer.switchTab(${rightId})`);
    s = await snap(main, 'window.xer.split.toggle()');
    check('un-split keeps the focused pane active', s.split === null && s.activeId === rightId);
    await sleep(600); w = await widths();
    const rightPath = new URL(s.tabs.find(x => x.id === rightId).url).pathname;
    check('kept pane is full width after un-split', w[rightPath] > 900);

    // a single tab cannot be split
    await snap(main, `window.xer.closeTab(${s.tabs[s.tabs.length - 1].id})`);
    s = await snap(main, 'window.xer.reload()');
    while (s.tabs.length > 1) s = await snap(main, `window.xer.closeTab(${s.tabs[s.tabs.length - 1].id})`);
    const one = await evalIn(main, 'window.xer.split.toggle()'); check('one tab cannot be split', one === false);
  } catch (e) { check('error: ' + e.message, false); }
  killp(); site.close(); console.log(ok ? 'SPLITLIVE PASSED' : 'SPLITLIVE FAILED'); process.exit(ok ? 0 : 1);
})();
