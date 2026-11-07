// Drag-and-drop tab reordering: live test through the real IPC path plus the real DOM drag handlers.
// Run: xvfb-run -a node test/reorder.js
const { spawn } = require('child_process'); const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path');
const WebSocket = require('ws'); const { waitReady } = require('./helpers');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
const evalIn = (url, expr) => new Promise((res, rej) => { const ws = new WebSocket(url);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result?.result?.value); } }); ws.on('error', rej); });
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'xer-reorder-'));
const launch = (port) => spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`], { stdio: 'ignore', detached: true });
const killp = (p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch {} };
const snap = (main, action) => evalIn(main, `new Promise(r => { let last = null, t; window.xer.on('tabs', d => { last = JSON.stringify(d); clearTimeout(t); t = setTimeout(() => r(last), 400); }); ${action}; setTimeout(() => { if (!last) r(null); }, 4000); })`).then(JSON.parse);
const names = (s) => s.tabs.filter(x => /^http:\/\/127/.test(x.url)).map(x => x.url.split('/').pop()).join('');

(async () => {
  const site = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<title>' + q.url + '</title><h1>' + q.url + '</h1>'); }).listen(9557);
  let p = launch(9345);
  try {
    let t = await waitReady(9345); const main = t.find(x => x.url.includes('renderer/index.html')).webSocketDebuggerUrl;
    for (const u of ['/a', '/b', '/c', '/d']) { await evalIn(main, `window.xer.newTab("http://127.0.0.1:9557${u}")`); await sleep(900); }
    let s = await snap(main, 'window.xer.reload()');
    const id = (u) => s.tabs.find(x => x.url.endsWith(u))?.id;
    const [A, B, C, D] = ['/a', '/b', '/c', '/d'].map(id);
    check('four tabs open in creation order', names(s) === 'abcd');

    s = await snap(main, `window.xer.moveTab(${A}, ${C}, false)`);
    check('move a before c', names(s) === 'bacd');
    s = await snap(main, `window.xer.moveTab(${A}, ${D}, true)`);
    check('move a after d (to the end)', names(s) === 'bcda');
    s = await snap(main, `window.xer.moveTab(${D}, ${B}, false)`);
    check('move d before b (backward)', names(s) === 'dbca');
    check('move onto itself is rejected', (await evalIn(main, `window.xer.moveTab(${A}, ${A}, false)`)) === false);
    check('move with an unknown tab is rejected', (await evalIn(main, `window.xer.moveTab(99999, ${A}, false)`)) === false && (await evalIn(main, `window.xer.moveTab(${A}, 99999, false)`)) === false);

    // pin boundary: dropping onto a pinned tab pins; dropping a pinned tab among normal tabs unpins
    s = await snap(main, `window.xer.pinTab(${B})`);
    check('pinned tab sorts first', s.tabs[0].id === B && s.tabs[0].pinned);
    s = await snap(main, `window.xer.moveTab(${C}, ${B}, true)`);
    check('dropping onto a pinned tab pins the dragged tab', s.tabs.find(x => x.id === C).pinned && s.tabs[0].id === B && s.tabs[1].id === C);
    s = await snap(main, `window.xer.moveTab(${C}, ${A}, true)`);
    check('dropping a pinned tab among normal tabs unpins it', !s.tabs.find(x => x.id === C).pinned && names(s).indexOf('a') < names(s).indexOf('c'));
    await snap(main, `window.xer.pinTab(${B})`); // unpin b again
    s = await snap(main, 'window.xer.reload()');

    // groups: dropping next to a grouped tab joins; dropping next to an ungrouped tab leaves
    const base = names(s);
    s = await snap(main, `window.xer.createGroup([${A}], "G", "green")`);
    const gid = s.groups[0].id;
    s = await snap(main, `window.xer.moveTab(${D}, ${A}, true)`);
    check('dropping next to a grouped tab joins that group', s.tabs.find(x => x.id === D).groupId === gid);
    s = await snap(main, `window.xer.moveTab(${D}, ${B}, false)`);
    check('dropping next to an ungrouped tab leaves the group', s.tabs.find(x => x.id === D).groupId === null);
    check('group still holds its remaining tab', s.groups.length === 1 && s.tabs.find(x => x.id === A).groupId === gid);
    s = await snap(main, `window.xer.ungroup(${gid})`);

    // closing the active tab focuses its neighbor, not the last tab
    s = await snap(main, 'window.xer.reload()');
    const ord = s.tabs.map(x => x.id); const web = ord.filter(i => s.tabs.find(x => x.id === i).url.startsWith('http://127'));
    const mid = web[1];
    await evalIn(main, `window.xer.switchTab(${mid})`); await sleep(300);
    s = await snap(main, `window.xer.closeTab(${mid})`);
    check('closing the active tab focuses the tab that took its place', s.activeId === web[2]);
    const lastWeb = web[web.length - 1];
    await evalIn(main, `window.xer.switchTab(${lastWeb})`); await sleep(300);
    s = await snap(main, `window.xer.closeTab(${lastWeb})`);
    check('closing the last tab focuses the previous one', s.activeId === s.tabs[s.tabs.length - 1].id);

    // new tabs from duplicate land right after the original
    s = await snap(main, 'window.xer.reload()');
    const first = s.tabs.find(x => x.url.startsWith('http://127'));
    s = await snap(main, `window.xer.duplicateTab(${first.id})`);
    const fi = s.tabs.findIndex(x => x.id === first.id);
    check('duplicate lands right after the original', s.tabs[fi + 1].url === first.url && s.tabs[fi + 1].id !== first.id);

    // real DOM drag handlers: synthesize dragstart/dragover/drop on actual tab elements
    s = await snap(main, 'window.xer.reload()');
    const before = names(s);
    const drag = await evalIn(main, `(async () => {
      const els = [...document.querySelectorAll('#tabs .tab')];
      const web = els.filter(e => !e.classList.contains('pinned'));
      if (web.length < 3) return 'too few tabs: ' + web.length;
      const src = els[els.length - 1], dst = els[0];
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      const r = dst.getBoundingClientRect();
      dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 2, clientY: r.top + 5 }));
      const marked = dst.classList.contains('drop-before');
      dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 2, clientY: r.top + 5 }));
      src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      return JSON.stringify({ marked, leftover: document.querySelectorAll('.drop-before,.drop-after').length });
    })()`);
    await sleep(700);
    s = await snap(main, 'window.xer.reload()');
    check('DOM drag shows a drop marker on the left half', JSON.parse(drag).marked === true);
    check('DOM drop leaves no stale drop markers', JSON.parse(drag).leftover === 0);
    check('DOM drag-and-drop moves the last tab to the front', names(s) !== before && names(s)[0] === before[before.length - 1] && names(s).slice(1) === before.slice(0, -1));
    const wantOrder = s.tabs.map(x => x.url); // remember for restart check
    await sleep(2500);
    const sess = JSON.parse(fs.readFileSync(path.join(udd, 'session.json'), 'utf8'));
    check('session file follows the new order', sess.map(r => r.url).join() === wantOrder.filter(u => /^https?:/.test(u)).join());
    fs.writeFileSync(path.join(udd, 'expected-order.json'), JSON.stringify(wantOrder.filter(u => /^https?:/.test(u))));
  } catch (e) { check('phase1 error: ' + e.message, false); }
  killp(p); await sleep(2500);

  p = launch(9346);
  try {
    const t = await waitReady(9346); const main = t.find(x => x.url.includes('renderer/index.html')).webSocketDebuggerUrl;
    const s = await snap(main, 'window.xer.reload()');
    const want = JSON.parse(fs.readFileSync(path.join(udd, 'expected-order.json'), 'utf8'));
    check('custom order survives a restart', s.tabs.map(x => x.url).filter(u => /^https?:/.test(u)).join() === want.join());
  } catch (e) { check('phase2 error: ' + e.message, false); }
  killp(p); site.close();
  console.log(ok ? 'ALL PASSED' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
