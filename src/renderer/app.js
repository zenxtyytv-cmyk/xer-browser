const $ = (id) => document.getElementById(id);
const history = [];
let activeTabId = null;

xer.on('tabs', ({ tabs, activeId, blocked }) => {
  activeTabId = activeId;
  $('tabs').innerHTML = '';
  const frag = document.createDocumentFragment();
  tabs.filter(t => t.pinned).concat(tabs.filter(t => !t.pinned)).forEach(t => {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === activeId ? ' active' : '') + (t.pinned ? ' pinned' : '') + (t.loading ? ' loading' : '');
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
    frag.append(el);
    if (t.id === activeId && document.activeElement !== $('url') && !t.url.startsWith('file:')) $('url').value = t.url;
    if (t.id === activeId && t.url.startsWith('file:')) $('url').value = '';
  });
  $('tabs').append(frag);
  $('shield').textContent = blocked + ' blocked';
});

// ---- tab context menu ----
const menu = $('tabmenu');
function tabMenu(e, t) {
  menu.innerHTML = '';
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onmousedown = (ev) => { ev.preventDefault(); hideMenu(); fn(); }; menu.append(b); };
  mk('Reload', () => { xer.switchTab(t.id); setTimeout(() => xer.reload(), 50); });
  mk('Duplicate', () => xer.duplicateTab(t.id));
  mk(t.pinned ? 'Unpin tab' : 'Pin tab', () => xer.pinTab(t.id));
  mk('Close tab', () => xer.closeTab(t.id));
  mk('Reopen closed tab (Ctrl+Shift+T)', () => xer.reopenTab());
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
  await xer.setKey(k); $('keyInput').value = ''; $('keyBox').hidden = true;
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
  const r = await xer.ask({ messages: history, withPage: $('withPage').checked });
  wait.remove();
  if (r.ok) { add('ai', r.text); history.push({ role: 'assistant', content: r.text }); }
  else { add('err', r.error); history.pop(); }
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
