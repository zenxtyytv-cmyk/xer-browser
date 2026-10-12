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
