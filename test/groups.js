// Tab groups: unit tests for GroupState (plain node) + live app test via the real IPC path:
// create a group, rename/recolor/collapse, pin interaction, session restore across a relaunch.
// Run: xvfb-run -a node test/groups.js
const { spawn } = require('child_process'); const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path');
const WebSocket = require('ws'); const { waitReady } = require('./helpers');
const { GroupState } = require('../src/main/groups');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };

// ---------- 1. unit tests ----------
{
  const g = new GroupState();
  const a = g.create([1, 3], 'Work', 'green');
  check('create returns id and holds members', g.members(a).join() === '1,3' && g.groupOf(1) === a && g.groupOf(2) === null);
  check('order keeps group members adjacent', g.order([1, 2, 3, 4]).join() === '1,3,2,4');
  check('group sits at its first tab', g.order([2, 1, 4, 3]).join() === '2,1,3,4');
  check('order does not mutate input', (() => { const i = [1, 2, 3]; g.order(i); return i.join() === '1,2,3'; })());
  check('rename + clamp length', g.rename(a, 'x'.repeat(100)) && g.get(a).name.length === 40);
  check('setColor accepts valid, rejects invalid', g.setColor(a, 'red') && g.get(a).color === 'red' && !g.setColor(a, 'nope') && g.get(a).color === 'red');
  check('invalid color on create falls back to a palette color', ['blue','red','yellow','green','pink','purple','cyan','orange'].includes(new GroupState().groups.get(new GroupState().create([1], '', 'bad'))?.color ?? 'blue'));
  check('toggle collapsed', g.toggleCollapsed(a) === true && g.toggleCollapsed(a) === false);
  const b = g.create([2], 'Fun');
  check('assign moves tab between groups', g.assign(3, b) && g.groupOf(3) === b && g.members(a).join() === '1');
  check('assign to missing group fails', g.assign(9, 999) === false && g.groupOf(9) === null);
  g.remove(1);
  check('group disappears when last tab removed', g.get(a) === null && g.groupOf(1) === null);
  g.prune([2]);
  check('prune drops closed tabs and emptied groups', g.groupOf(3) === null && g.get(b) && g.members(b).join() === '2');
  g.ungroup(b);
  check('ungroup dissolves group', g.get(b) === null && g.groupOf(2) === null);
  check('toggle/rename on unknown group is safe', g.toggleCollapsed(42) === null && g.rename(42, 'x') === false);
  check('list returns plain copies', (() => { const x = new GroupState(); x.create([1], 'A'); const l = x.list(); l[0].name = 'changed'; return x.list()[0].name === 'A'; })());
}

// ---------- 2. live app via the real IPC path ----------
const evalIn = (url, expr) => new Promise((res, rej) => { const ws = new WebSocket(url);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result?.result?.value); } }); ws.on('error', rej); });
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'xer-grp-'));
const launch = (port) => spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`], { stdio: 'ignore', detached: true });
const killp = (p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch {} };
// Run an action in the UI and return the tab state once it settles (last 'tabs' event after 400ms of quiet).
// Unrelated events (titles, favicons) can arrive first, so the first event is not reliable.
const snap = (main, action) => evalIn(main, `new Promise(r => { let last = null, t; window.xer.on('tabs', d => { last = JSON.stringify(d); clearTimeout(t); t = setTimeout(() => r(last), 400); }); ${action}; setTimeout(() => { if (!last) r(null); }, 4000); })`).then(JSON.parse);

(async () => {
  const site = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<title>' + q.url + '</title><h1>' + q.url + '</h1>'); }).listen(9556);
  let p = launch(9343);
  try {
    let t = await waitReady(9343); const main = t.find(x => x.url.includes('renderer/index.html')).webSocketDebuggerUrl;
    for (const u of ['/a', '/b', '/c', '/d']) { await evalIn(main, `window.xer.newTab("http://127.0.0.1:9556${u}")`); await sleep(900); }
    let s = await snap(main, 'window.xer.reload()');
    const id = (u) => s.tabs.find(x => x.url.endsWith(u))?.id;
    const [A, B, C, D] = ['/a', '/b', '/c', '/d'].map(id);
    check('four tabs open', [A, B, C, D].every(x => x != null));
    check('no groups initially', s.groups.length === 0 && s.tabs.every(x => x.groupId === null));

    // group A and C: members become adjacent even though B sits between them
    s = await snap(main, `window.xer.createGroup([${A},${C}], "Work", "green")`);
    const g = s.groups[0];
    check('group created with name and color', s.groups.length === 1 && g.name === 'Work' && g.color === 'green' && g.collapsed === false);
    const order = s.tabs.map(x => x.id), ia = order.indexOf(A), ic = order.indexOf(C);
    check('grouped tabs are adjacent in the bar', Math.abs(ia - ic) === 1);
    check('tab payload carries groupId', s.tabs.find(x => x.id === A).groupId === g.id && s.tabs.find(x => x.id === B).groupId === null);

    s = await snap(main, `window.xer.renameGroup(${g.id}, "Research")`); check('rename works', s.groups[0].name === 'Research');
    s = await snap(main, `window.xer.colorGroup(${g.id}, "purple")`); check('recolor works', s.groups[0].color === 'purple');
    s = await snap(main, `window.xer.addToGroup(${B}, ${g.id})`); check('add tab to existing group', s.tabs.find(x => x.id === B).groupId === g.id);

    // pinning removes a tab from its group; pinned tabs cannot be grouped
    s = await snap(main, `window.xer.pinTab(${B})`);
    check('pinning removes tab from group', s.tabs.find(x => x.id === B).pinned && s.tabs.find(x => x.id === B).groupId === null);
    const r1 = await evalIn(main, `window.xer.addToGroup(${B}, ${g.id})`); check('pinned tab cannot join a group', r1 === false);
    await snap(main, `window.xer.pinTab(${B})`); // unpin again

    s = await snap(main, `window.xer.toggleGroup(${g.id})`); check('collapse toggles', s.groups[0].collapsed === true);

    // session restore keeps group name, color, collapsed state and membership
    await sleep(2500);
    const sess = JSON.parse(fs.readFileSync(path.join(udd, 'session.json'), 'utf8'));
    const gr = sess.filter(r => r.group);
    check('session stores group info for members', gr.length === 2 && gr.every(r => r.group.name === 'Research' && r.group.color === 'purple' && r.group.collapsed === true));
    check('session group members share one key', new Set(gr.map(r => r.group.key)).size === 1);
  } catch (e) { check('phase1 error: ' + e.message, false); }
  killp(p); await sleep(2500);

  p = launch(9344);
  try {
    const t = await waitReady(9344); const main = t.find(x => x.url.includes('renderer/index.html')).webSocketDebuggerUrl;
    const s = await snap(main, 'window.xer.reload()');
    check('group restored after relaunch', s.groups.length === 1 && s.groups[0].name === 'Research' && s.groups[0].color === 'purple' && s.groups[0].collapsed === true);
    const members = s.tabs.filter(x => x.groupId === s.groups[0].id).map(x => x.url.split('/').pop()).sort();
    check('right tabs back in the group', members.join() === 'a,c');
    check('ungrouped tab stays ungrouped', s.tabs.filter(x => x.url.endsWith('/d')).every(x => x.groupId === null));

    // duplicating a grouped tab keeps the copy in the same group
    const dupFrom = s.tabs.find(x => x.url.endsWith('/a'));
    const nBefore = s.tabs.length;
    const sd = await snap(main, `window.xer.duplicateTab(${dupFrom.id})`);
    const copies = sd.tabs.filter(x => x.url.endsWith('/a'));
    check('duplicate of a grouped tab joins the group', sd.tabs.length === nBefore + 1 && copies.length === 2 && copies.every(x => x.groupId === s.groups[0].id));
    const sc = await snap(main, `window.xer.closeTab(${copies.find(x => x.id !== dupFrom.id).id})`);
    check('closing the copy leaves the original grouped', sc.tabs.length === nBefore && sc.tabs.find(x => x.id === dupFrom.id).groupId === s.groups[0].id);
    s.tabs = sc.tabs;

    // ungroup keeps tabs; close-group closes them
    const n0 = s.tabs.length;
    let s2 = await snap(main, `window.xer.ungroup(${s.groups[0].id})`);
    check('ungroup keeps all tabs', s2.groups.length === 0 && s2.tabs.length === n0);
    const gid = await evalIn(main, `window.xer.createGroup([${s2.tabs.find(x => x.url.endsWith('/a')).id}, ${s2.tabs.find(x => x.url.endsWith('/c')).id}], "Tmp")`);
    check('createGroup returns an id', typeof gid === 'number');
    s2 = await snap(main, `window.xer.closeGroup(${gid})`);
    check('close group closes its tabs only', s2.tabs.length === n0 - 2 && !s2.tabs.some(x => x.url.endsWith('/a') || x.url.endsWith('/c')) && s2.tabs.some(x => x.url.endsWith('/d')));
    check('createGroup with no valid tabs returns null', (await evalIn(main, 'window.xer.createGroup([99999], "x")')) === null);
  } catch (e) { check('phase2 error: ' + e.message, false); }
  killp(p); site.close();
  console.log(ok ? 'ALL PASSED' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
