const $ = (id) => document.getElementById(id);
const history = [];
let activeTabId = null;

let lastGroups = [];
let lastSplit = null;
xer.on('tabs', ({ tabs, activeId, blocked, groups = [], split = null }) => {
  activeTabId = activeId;
  lastSplit = split;
  const sb = $('splitBtn'); if (sb) { sb.classList.toggle('on', !!split); sb.title = split ? 'Split view on: click for options (Ctrl+Shift+S)' : 'Split view (Ctrl+Shift+S)'; }
  lastGroups = groups;
  const gmap = new Map(groups.map(g => [g.id, g]));
  $('tabs').innerHTML = '';
  const frag = document.createDocumentFragment();
  let lastGroup = null;
  tabs.forEach(t => {
    const g = t.groupId != null ? gmap.get(t.groupId) : null;
    // A group chip precedes the first tab of each group; clicking it collapses or expands the group.
    if (g && g.id !== lastGroup) {
      const chip = document.createElement('div');
      chip.className = 'gchip g-' + g.color + (g.collapsed ? ' collapsed' : '');
      chip.textContent = (g.name || 'Group') + (g.collapsed ? ' \u25b8' : '');
      chip.title = (g.collapsed ? 'Expand' : 'Collapse') + ' group (right-click for options)';
      chip.onclick = () => xer.toggleGroup(g.id);
      chip.oncontextmenu = (e) => { e.preventDefault(); groupMenu(e, g); };
      frag.append(chip);
    }
    lastGroup = g ? g.id : null;
    // Collapsed groups hide their tabs, except the active one so you never lose sight of where you are.
    if (g && g.collapsed && t.id !== activeId) return;
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === activeId ? ' active' : '') + (t.pinned ? ' pinned' : '') + (t.loading ? ' loading' : '') + (split && (t.id === split.left || t.id === split.right) ? ' insplit' : '') + (g ? ' ingroup g-' + g.color : '');
    if (t.favicon) { const img = document.createElement('img'); img.className = 'fav'; img.src = t.favicon; el.append(img); }
    const s = document.createElement('span'); s.textContent = t.title;
    if (t.pinned) {
      const pin = document.createElement('b'); pin.textContent = '\u{1F4CC}'; pin.title = 'Unpin tab';
      pin.onclick = (e) => { e.stopPropagation(); xer.pinTab(t.id); };
      if (!t.favicon) el.append(pin);
      el.append(s);
      el.title = (t.title || '') + ' (pinned: right-click to unpin)';
    } else {
      const x = document.createElement('b'); x.textContent = '\u00d7'; x.title = 'Close tab';
      x.onclick = (e) => { e.stopPropagation(); xer.closeTab(t.id); };
      el.append(s, x);
      el.title = 'Double-click to pin';
    }
    el.onclick = () => xer.switchTab(t.id);
    el.ondblclick = (e) => { e.stopPropagation(); xer.pinTab(t.id); };
    el.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); xer.closeTab(t.id); } };
    el.oncontextmenu = (e) => { e.preventDefault(); tabMenu(e, t); };
    makeDraggable(el, t.id);
    frag.append(el);
    if (t.id === activeId && document.activeElement !== $('url') && !t.url.startsWith('file:')) $('url').value = t.url;
    if (t.id === activeId && t.url.startsWith('file:')) $('url').value = '';
  });
  $('tabs').append(frag);
  $('shield').textContent = blocked + ' blocked';
});

// ---- drag-and-drop tab reordering ----
// Drag a tab and drop it on the left half of another tab to go before it, or the right half to go after it.
// Dropping on a pinned tab pins it, dropping next to a grouped tab joins that group (handled in main).
let dragId = null;
function dropSide(e, el) { const r = el.getBoundingClientRect(); return e.clientX > r.left + r.width / 2; }
function clearDropMarks() { document.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after')); }
function makeDraggable(el, id) {
  el.draggable = true;
  el.ondragstart = (e) => { dragId = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); el.classList.add('dragging'); };
  el.ondragend = () => { dragId = null; el.classList.remove('dragging'); clearDropMarks(); };
  el.ondragover = (e) => {
    if (dragId == null || dragId === id) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    clearDropMarks(); el.classList.add(dropSide(e, el) ? 'drop-after' : 'drop-before');
  };
  el.ondragleave = () => el.classList.remove('drop-before', 'drop-after');
  el.ondrop = (e) => {
    e.preventDefault();
    const from = dragId; dragId = null; clearDropMarks();
    if (from != null && from !== id) xer.moveTab(from, id, dropSide(e, el));
  };
}

// ---- tab context menu ----
const menu = $('tabmenu');
function tabMenu(e, t) {
  menu.innerHTML = '';
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onmousedown = (ev) => { ev.preventDefault(); hideMenu(); fn(); }; menu.append(b); };
  mk('Reload', () => { xer.switchTab(t.id); setTimeout(() => xer.reload(), 50); });
  mk('Duplicate', () => xer.duplicateTab(t.id));
  mk(t.pinned ? 'Unpin tab' : 'Pin tab', () => xer.pinTab(t.id));
  if (!t.pinned) {
    if (t.groupId == null) {
      mk('Add to new group', () => xer.createGroup([t.id], '', undefined));
      lastGroups.forEach(g => mk('Add to group: ' + (g.name || 'Group ' + g.id), () => xer.addToGroup(t.id, g.id)));
    } else {
      mk('Remove from group', () => xer.removeFromGroup(t.id));
      lastGroups.filter(g => g.id !== t.groupId).forEach(g => mk('Move to group: ' + (g.name || 'Group ' + g.id), () => xer.addToGroup(t.id, g.id)));
    }
  }
  mk(lastSplit ? 'Close split view' : 'Split view with next tab', () => { xer.split.toggle(); });
  mk('Close tab', () => xer.closeTab(t.id));
  mk('Reopen closed tab (Ctrl+Shift+T)', () => xer.reopenTab());
  menu.hidden = false;
  menu.style.left = Math.min(e.clientX, innerWidth - 240) + 'px';
  menu.style.top = e.clientY + 'px';
}
// Right-click a group chip: rename, recolor, ungroup, close all its tabs.
const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
function groupMenu(e, g) {
  menu.innerHTML = '';
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onmousedown = (ev) => { ev.preventDefault(); hideMenu(); fn(); }; menu.append(b); };
  mk(g.collapsed ? 'Expand group' : 'Collapse group', () => xer.toggleGroup(g.id));
  // Inline rename input (Electron has no window.prompt).
  const inp = document.createElement('input'); inp.className = 'gname'; inp.placeholder = 'Group name'; inp.value = g.name || ''; inp.maxLength = 40;
  inp.onkeydown = (ev) => { if (ev.key === 'Enter') { hideMenu(); xer.renameGroup(g.id, inp.value.trim()); } else if (ev.key === 'Escape') hideMenu(); };
  menu.append(inp);
  const row = document.createElement('div'); row.className = 'colorrow';
  GROUP_COLORS.forEach(c => { const d = document.createElement('i'); d.className = 'swatch g-' + c + (c === g.color ? ' on' : ''); d.title = c; d.onmousedown = (ev) => { ev.preventDefault(); hideMenu(); xer.colorGroup(g.id, c); }; row.append(d); });
  menu.append(row);
  mk('Ungroup (keep tabs)', () => xer.ungroup(g.id));
  mk('Close group', () => xer.closeGroup(g.id));
  menu.hidden = false;
  menu.style.left = Math.min(e.clientX, innerWidth - 240) + 'px';
  menu.style.top = e.clientY + 'px';
}
function hideMenu() { menu.hidden = true; }
window.addEventListener('mousedown', (e) => { if (!menu.hidden && !menu.contains(e.target)) hideMenu(); });
window.addEventListener('blur', hideMenu);

$('newtab').onclick = () => xer.newTab();
$('back').onclick = () => xer.back();
$('fwd').onclick = () => xer.forward();
$('reload').onclick = () => xer.reload();
xer.on('focus-url', () => { $('url').focus(); $('url').select(); });

// ---- awesomebar: on-device suggestions from history + bookmarks ----
const sug = $('suggest');
let sugItems = [], sugIndex = -1, sugTimer = null;
function renderSug() {
  sug.innerHTML = '';
  if (!sugItems.length) { sug.hidden = true; return; }
  sug.hidden = false;
  sugItems.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'sug' + (i === sugIndex ? ' sel' : '');
    const t = document.createElement('span'); t.textContent = s.title;
    const u = document.createElement('small'); u.textContent = s.url;
    const tag = document.createElement('b'); tag.textContent = s.src;
    d.append(t, u, tag);
    d.onmousedown = (e) => { e.preventDefault(); pickSug(s); };
    sug.append(d);
  });
}
function pickSug(s) { sugItems = []; sugIndex = -1; renderSug(); xer.go(s.url); $('url').blur(); }
$('url').addEventListener('input', () => {
  clearTimeout(sugTimer);
  sugTimer = setTimeout(async () => {
    sugItems = await xer.suggest($('url').value);
    sugIndex = -1; renderSug();
  }, 150);
});
$('url').addEventListener('keydown', (e) => {
  if (!sugItems.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); sugIndex = (sugIndex + 1) % sugItems.length; renderSug(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); sugIndex = (sugIndex - 1 + sugItems.length) % sugItems.length; renderSug(); }
  if (e.key === 'Enter' && sugIndex >= 0) { e.preventDefault(); pickSug(sugItems[sugIndex]); }
  if (e.key === 'Escape') { sugItems = []; sugIndex = -1; renderSug(); }
});
$('url').addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 150));
$('url').addEventListener('focus', () => { if (sugItems.length) sug.hidden = false; });
$('url').addEventListener('keydown', e => { if (e.key === 'Enter' && sugIndex < 0) { xer.go($('url').value); $('url').blur(); } });

async function toggleSidebar() {
  const open = await xer.toggleSidebar();
  $('sidebar').hidden = !open;
  if (open) $('keyBox').hidden = await xer.hasKey();
}
$('claudeBtn').onclick = toggleSidebar;
xer.on('toggle-sidebar', toggleSidebar);

$('keySave').onclick = async () => {
  const k = $('keyInput').value.trim(); if (!k) return;
  const r = await xer.setKey(k);
  if (r && r.ok === false) { $('keyErr').textContent = 'Could not save key: ' + r.error; $('keyErr').hidden = false; return; }
  $('keyErr').hidden = true; $('keyInput').value = ''; $('keyBox').hidden = true;
};

function add(cls, text) {
  const d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = text;
  $('msgs').append(d); $('msgs').scrollTop = 1e9; return d;
}
async function send() {
  const text = $('prompt').value.trim(); if (!text) return;
  $('prompt').value = ''; add('user', text);
  history.push({ role: 'user', content: text });
  const wait = add('ai', '...');
  const allow = $('allowAct').checked; if (allow) $('withPage').checked = true;
  const r = await xer.ask({ messages: history, withPage: $('withPage').checked, allowActions: allow });
  wait.remove();
  if (r.ok) { add('ai', r.text); history.push({ role: 'assistant', content: r.text }); if (r.actions && r.actions.length) actionCard(r.actions, r.tabId); }
  else { add('err', r.error); history.pop(); }
}
// ---- Claude page actions: every action needs an explicit click on Approve ----
function actionCard(list, tabId) {
  const card = document.createElement('div'); card.className = 'm act';
  const h = document.createElement('b'); h.textContent = 'Claude wants to do ' + list.length + (list.length === 1 ? ' thing' : ' things') + ':'; card.append(h);
  list.forEach(a => {
    const row = document.createElement('div'); row.className = 'actrow';
    const lbl = document.createElement('span'); lbl.textContent = a.label + (a.type === 'type' ? ' \u2192 "' + a.text.slice(0, 60) + '"' : a.type === 'navigate' ? ' (' + a.url + ')' : '');
    const ok = document.createElement('button'); ok.textContent = 'Approve'; ok.className = 'approve';
    const no = document.createElement('button'); no.textContent = 'Deny';
    const done = (msg, bad) => { ok.remove(); no.remove(); const st = document.createElement('i'); st.textContent = msg; if (bad) st.className = 'bad'; row.append(st); };
    ok.onclick = async () => { ok.disabled = no.disabled = true; const r = await xer.runAction({ action: a, tabId }); done(r && r.ok ? 'Done' : 'Failed: ' + ((r && r.error) || 'unknown'), !(r && r.ok)); };
    no.onclick = () => done('Denied');
    row.append(lbl, ok, no); card.append(row);
  });
  $('msgs').append(card); $('msgs').scrollTop = 1e9;
}
$('send').onclick = send;
$('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

// ---- bookmarks ----
$('star').onclick = async () => { const on = await xer.toggleBookmark(); $('star').textContent = on ? '\u2605' : '\u2606'; };
xer.on('tabs', async ({ tabs, activeId }) => {
  const t = tabs.find(t => t.id === activeId); if (!t) return;
  const bms = await xer.bookmarks(); $('star').textContent = bms.some(b => b.url === t.url) ? '\u2605' : '\u2606';
});

// ---- panel (bookmarks + history + downloads) ----
let panelMode = null;
async function showPanel(mode) {
  if (panelMode === mode) { $('panel').hidden = true; panelMode = null; return; }
  panelMode = mode; $('panel').hidden = false;
  $('panelTitle').textContent = { history: 'History', bookmarks: 'Bookmarks', downloads: 'Downloads' }[mode];
  $('panelClear').style.display = 'none';
  if (mode === 'downloads') { $('panelClear').style.display = ''; renderDownloads(await xer.downloads()); return; }
  const list = mode === 'history' ? await xer.history() : await xer.bookmarks();
  if (mode === 'history') $('panelClear').style.display = '';
  $('panelBody').innerHTML = '';
  if (!list.length) $('panelBody').innerHTML = '<div class="item"><small>Nothing here yet.</small></div>';
  list.forEach(h => {
    const d = document.createElement('div'); d.className = 'item';
    const a = document.createElement('div'); a.textContent = h.title || h.url;
    const b = document.createElement('small'); b.textContent = h.url;
    d.append(a, b); d.onclick = () => xer.go(h.url); $('panelBody').append(d);
  });
}
function renderDownloads(list) {
  $('panelBody').innerHTML = '';
  if (!list.length) $('panelBody').innerHTML = '<div class="item"><small>No downloads yet.</small></div>';
  list.forEach(dl => {
    const d = document.createElement('div'); d.className = 'item';
    const a = document.createElement('div'); a.textContent = dl.filename;
    const b = document.createElement('small'); b.style.display = 'block';
    const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
    let host = ''; try { host = new URL(dl.url).hostname; } catch {}
    if (dl.state === 'progressing') {
      const pct = dl.total ? Math.round(100 * dl.received / dl.total) : 0;
      b.textContent = `${pct}% of ${dl.total ? mb(dl.total) : 'unknown size'} from ${host}`;
      const bar = document.createElement('progress'); bar.max = 100; bar.value = pct; bar.style.width = '100%';
      const c = document.createElement('button'); c.textContent = 'Cancel';
      c.onclick = (e) => { e.stopPropagation(); xer.cancelDownload(dl.id); };
      const row = document.createElement('div'); row.append(c); row.style.marginTop = '4px';
      d.append(a, b, bar, row);
    } else {
      b.textContent = dl.state === 'completed' ? `${mb(dl.received)} from ${host}` : dl.state;
      const o = document.createElement('button'); o.textContent = 'Open'; o.style.marginRight = '6px';
      const s = document.createElement('button'); s.textContent = 'Show in folder';
      o.onclick = (e) => { e.stopPropagation(); xer.openDownload(dl.id); };
      s.onclick = (e) => { e.stopPropagation(); xer.showDownload(dl.id); };
      const row = document.createElement('div'); row.append(o, s); row.style.marginTop = '4px';
      d.append(a, b, row);
    }
    $('panelBody').append(d);
  });
}
xer.on('downloads', (list) => {
  if (panelMode === 'downloads' && !$('panel').hidden) renderDownloads(list);
  const active = (list || []).filter(i => i.state === 'progressing').length;
  $('dlBadge').textContent = active || '';
  $('dlBadge').style.display = active ? '' : 'none';
});
$('histBtn').onclick = () => showPanel('history');
$('dlBtn').onclick = () => showPanel('downloads');
$('panelClose').onclick = () => { $('panel').hidden = true; panelMode = null; };
$('panelClear').onclick = async () => {
  if (panelMode === 'history') { await xer.clearHistory(); panelMode = null; showPanel('history'); }
  else if (panelMode === 'downloads') { await xer.clearDownloads(); panelMode = null; showPanel('downloads'); }
};

// ---- find in page ----
$('findClose').onclick = () => { $('findbar').hidden = true; xer.find(''); };
$('findInput').addEventListener('input', e => xer.find(e.target.value));
$('findInput').addEventListener('keydown', e => { if (e.key === 'Enter') xer.find(e.target.value, !e.shiftKey); if (e.key === 'Escape') $('findClose').click(); });
$('findNext').onclick = () => xer.find($('findInput').value, true);
$('findPrev').onclick = () => xer.find($('findInput').value, false);
xer.on('shortcut', (s) => {
  if (s === 'bookmark') $('star').click();
  if (s === 'history') $('histBtn').click();
  if (s === 'downloads') $('dlBtn').click();
  if (s === 'find') { $('findbar').hidden = false; $('findInput').focus(); $('findInput').select(); }
  if (s === 'pin' && activeTabId != null) xer.pinTab(activeTabId);
});

// ---- claude quick actions ----
document.querySelectorAll('#quick button').forEach(b => b.onclick = () => { $('withPage').checked = true; $('prompt').value = b.dataset.q; send(); });

// ---- reader mode ----
$('readerBtn').onclick = async () => { const r = await xer.readerOpen(); if (!r.ok) alert(r.error); };
$('gear').onclick = () => xer.openSettings();

// ---- Game Mode ----
let toastT = null;
function toast(msg) { const t = $('gameToast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => t.style.display = 'none', 3500); }
function paintGame(st) {
  $('gameBtn').classList.toggle('on', !!st.active);
  $('gameBtn').title = 'Game Mode: ' + (st.active ? 'ON' : 'off') + ' (Ctrl+Shift+G)';
}
xer.game.get().then(paintGame).catch(() => {}); // Game Mode state is optional; never break page load
xer.on('game:state', (st) => {
  paintGame(st);
  if (st.restartNeeded) toast('Restart Xer to apply frame-rate and GPU changes (Settings > Gaming).');
  else toast(st.active ? 'Game Mode ON' : 'Game Mode off');
});
xer.on('game:denied', ({ host, perm }) => toast('Blocked ' + perm + ' request from ' + host + ' (Game Mode)'));
$('gameBtn').onclick = () => xer.game.toggle().catch(() => toast('Game Mode is unavailable right now.'));
xer.on('shortcut', (s) => { if (s === 'game') xer.game.toggle().catch(() => {}); });

// Split view: the toolbar button toggles it; when it is on, the button opens a small menu of layouts.
function splitMenu(e) {
  menu.innerHTML = '';
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onmousedown = (ev) => { ev.preventDefault(); hideMenu(); fn(); }; menu.append(b); };
  mk('50 / 50', () => xer.split.ratio(0.5));
  mk('70 / 30', () => xer.split.ratio(0.7));
  mk('30 / 70', () => xer.split.ratio(0.3));
  mk('Swap sides', () => xer.split.swap());
  mk('Close split view', () => xer.split.toggle());
  menu.hidden = false;
  const r = e.currentTarget.getBoundingClientRect();
  menu.style.left = Math.min(r.left, innerWidth - 240) + 'px';
  menu.style.top = (r.bottom + 4) + 'px';
}
if ($('splitBtn')) $('splitBtn').onclick = (e) => { if (lastSplit) splitMenu(e); else xer.split.toggle().catch(() => {}); };
xer.on('shortcut', (s) => { if (s === 'split') xer.split.toggle().catch(() => {}); });

// Draggable split divider: a strip in the gap between the two panes. Pointer capture keeps the drag alive even
// when the cursor crosses a page view. Double-click resets to 50/50.
const GAP_PX = 8;
const divider = $('splitDivider');
xer.on('layout', ({ split, area }) => {
  if (!divider) return;
  if (!split || !area) { divider.hidden = true; return; }
  const usable = Math.max(0, area.width - GAP_PX), lw = Math.round(usable * split.ratio);
  Object.assign(divider.style, { left: (area.x + lw) + 'px', top: area.y + 'px', width: GAP_PX + 'px', height: area.height + 'px' });
  divider.hidden = false;
});
if (divider) {
  let busy = false;
  divider.addEventListener('pointerdown', (e) => { try { divider.setPointerCapture(e.pointerId); } catch {} divider.classList.add('drag'); e.preventDefault(); }); // capture is best-effort
  divider.addEventListener('pointermove', (e) => {
    if (!divider.classList.contains('drag') || busy) return;
    busy = true; xer.split.drag(e.clientX).catch(() => {}).finally(() => { busy = false; });
  });
  const end = (e) => { if (divider.classList.contains('drag') && e.type === 'pointerup') xer.split.drag(e.clientX).catch(() => {}); divider.classList.remove('drag'); try { divider.releasePointerCapture(e.pointerId); } catch {} };
  divider.addEventListener('pointerup', end); divider.addEventListener('pointercancel', end);
  divider.addEventListener('dblclick', () => xer.split.ratio(0.5).catch(() => {}));
}
