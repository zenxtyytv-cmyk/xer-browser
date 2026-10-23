const $ = (id) => document.getElementById(id);
const history = [];

xer.on('tabs', ({ tabs, activeId, blocked }) => {
  $('tabs').innerHTML = '';
  const frag = document.createDocumentFragment();
  tabs.filter(t => t.pinned).concat(tabs.filter(t => !t.pinned)).forEach(t => {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === activeId ? ' active' : '') + (t.pinned ? ' pinned' : '') + (t.loading ? ' loading' : '');
    if (t.favicon) { const img = document.createElement('img'); img.className = 'fav'; img.src = t.favicon; el.append(img); }
    const s = document.createElement('span'); s.textContent = t.title;
    const x = document.createElement('b'); x.textContent = '\u00d7'; x.title = 'Close tab';
    x.onclick = (e) => { e.stopPropagation(); xer.closeTab(t.id); };
    el.append(s, x);
    el.onclick = () => xer.switchTab(t.id);
    el.onauxclick = (e) => { if (e.button === 1) { e.stopPropagation(); xer.closeTab(t.id); } };
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
  $('panelTitle').textContent = mode === 'history' ? 'History' : mode === 'downloads' ? 'Downloads' : 'Bookmarks';
  $('panelClear').style.display = mode === 'bookmarks' ? 'none' : '';
  if (mode === 'downloads') { renderDownloads(); return; }
  const list = mode === 'history' ? await xer.history() : await xer.bookmarks();
  $('panelBody').innerHTML = '';
  if (!list.length) $('panelBody').innerHTML = '<div class="item"><small>Nothing here yet.</small></div>';
  list.forEach(h => {
    const d = document.createElement('div'); d.className = 'item';
    const a = document.createElement('div'); a.textContent = h.title || h.url;
    const b = document.createElement('small'); b.textContent = h.url;
    d.append(a, b); d.onclick = () => xer.go(h.url); $('panelBody').append(d);
  });
}
// ---- downloads panel ----
let dlData = { items: [] };
function fmtBytes(n) {
  if (!n && n !== 0) return '';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(1) : n) + ' ' + u[i];
}
function renderDownloads() {
  $('panelBody').innerHTML = '';
  if (!dlData.items.length) { $('panelBody').innerHTML = '<div class="item"><small>No downloads yet. Files you download appear here.</small></div>'; return; }
  dlData.items.forEach(d => {
    const el = document.createElement('div'); el.className = 'item';
    const a = document.createElement('div'); a.textContent = d.name;
    const pct = d.total ? Math.min(100, Math.round(d.received / d.total * 100)) : 0;
    const b = document.createElement('small');
    b.textContent = d.state === 'progressing'
      ? `Downloading \u2014 ${pct}% (${fmtBytes(d.received)} / ${fmtBytes(d.total)})`
      : d.state === 'completed' ? `Done \u2014 ${fmtBytes(d.total)}` : 'Cancelled / failed';
    el.append(a, b);
    if (d.state === 'progressing') {
      const bar = document.createElement('div'); bar.className = 'bar';
      const fill = document.createElement('i'); fill.style.width = pct + '%';
      bar.append(fill); el.append(bar);
    }
    if (d.path) {
      const row = document.createElement('div'); row.className = 'rowacts';
      const o = document.createElement('button'); o.textContent = 'Open'; o.onclick = (e) => { e.stopPropagation(); xer.dlOpen(d.id); };
      const s = document.createElement('button'); s.textContent = 'Show in folder'; s.onclick = (e) => { e.stopPropagation(); xer.dlShow(d.id); };
      row.append(o, s); el.append(row);
    }
    $('panelBody').append(el);
  });
}
xer.on('downloads', (d) => {
  dlData = d || { items: [] };
  if (panelMode === 'downloads') renderDownloads();
  const active = dlData.items.filter(i => i.state === 'progressing').length;
  $('dlBadge').textContent = active || '';
  $('dlBadge').style.display = active ? '' : 'none';
});
$('dlBtn').onclick = () => showPanel('downloads');
$('histBtn').onclick = () => showPanel('history');
$('panelClose').onclick = () => { $('panel').hidden = true; panelMode = null; };
$('panelClear').onclick = async () => {
  if (panelMode === 'history') { await xer.clearHistory(); panelMode = null; showPanel('history'); }
  else if (panelMode === 'downloads') { await xer.dlClear(); renderDownloads(); }
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
});

// ---- claude quick actions ----
document.querySelectorAll('#quick button').forEach(b => b.onclick = () => { $('withPage').checked = true; $('prompt').value = b.dataset.q; send(); });

// ---- reader mode ----
$('readerBtn').onclick = async () => { const r = await xer.readerOpen(); if (!r.ok) alert(r.error); };
$('gear').onclick = () => xer.openSettings();
