const $ = (id) => document.getElementById(id);
const history = [];

xer.on('tabs', ({ tabs, activeId, blocked }) => {
  $('tabs').innerHTML = '';
  tabs.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === activeId ? ' active' : '');
    const s = document.createElement('span'); s.textContent = t.title;
    const x = document.createElement('b'); x.textContent = '\u00d7';
    x.onclick = (e) => { e.stopPropagation(); xer.closeTab(t.id); };
    el.onclick = () => xer.switchTab(t.id);
    el.append(s, x); $('tabs').append(el);
    if (t.id === activeId && document.activeElement !== $('url') && !t.url.startsWith('file:')) $('url').value = t.url;
    if (t.id === activeId && t.url.startsWith('file:')) $('url').value = '';
  });
  $('shield').textContent = blocked + ' blocked';
});

$('newtab').onclick = () => xer.newTab();
$('back').onclick = () => xer.back();
$('fwd').onclick = () => xer.forward();
$('reload').onclick = () => xer.reload();
$('url').addEventListener('keydown', e => { if (e.key === 'Enter') { xer.go($('url').value); $('url').blur(); } });
xer.on('focus-url', () => { $('url').focus(); $('url').select(); });

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

// ---- panel (bookmarks + history) ----
let panelMode = null;
async function showPanel(mode) {
  if (panelMode === mode) { $('panel').hidden = true; panelMode = null; return; }
  panelMode = mode; $('panel').hidden = false;
  const list = mode === 'history' ? await xer.history() : await xer.bookmarks();
  $('panelTitle').textContent = mode === 'history' ? 'History' : 'Bookmarks';
  $('panelClear').style.display = mode === 'history' ? '' : 'none';
  $('panelBody').innerHTML = '';
  if (!list.length) $('panelBody').innerHTML = '<div class="item"><small>Nothing here yet.</small></div>';
  list.forEach(h => {
    const d = document.createElement('div'); d.className = 'item';
    const a = document.createElement('div'); a.textContent = h.title || h.url;
    const b = document.createElement('small'); b.textContent = h.url;
    d.append(a, b); d.onclick = () => xer.go(h.url); $('panelBody').append(d);
  });
}
$('histBtn').onclick = () => showPanel('history');
$('panelClose').onclick = () => { $('panel').hidden = true; panelMode = null; };
$('panelClear').onclick = async () => { await xer.clearHistory(); panelMode = null; showPanel('history'); };

// ---- find in page ----
$('findClose').onclick = () => { $('findbar').hidden = true; xer.find(''); };
$('findInput').addEventListener('input', e => xer.find(e.target.value));
$('findInput').addEventListener('keydown', e => { if (e.key === 'Enter') xer.find(e.target.value, !e.shiftKey); if (e.key === 'Escape') $('findClose').click(); });
$('findNext').onclick = () => xer.find($('findInput').value, true);
$('findPrev').onclick = () => xer.find($('findInput').value, false);
xer.on('shortcut', (s) => {
  if (s === 'bookmark') $('star').click();
  if (s === 'history') $('histBtn').click();
  if (s === 'find') { $('findbar').hidden = false; $('findInput').focus(); $('findInput').select(); }
});

// ---- claude quick actions ----
document.querySelectorAll('#quick button').forEach(b => b.onclick = () => { $('withPage').checked = true; $('prompt').value = b.dataset.q; send(); });

// ---- reader mode ----
$('readerBtn').onclick = async () => { const r = await xer.readerOpen(); if (!r.ok) { const n = $('note'); alert(r.error); } };
