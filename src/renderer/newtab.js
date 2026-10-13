const $ = (s, r = document) => r.querySelector(s);
let S = null, edit = false, ticks = [];
const uid = () => 'w' + Math.random().toString(36).slice(2, 8);
const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const save = () => window.xerInternal.dash.set({ theme: S.theme, widgets: S.widgets });

function theme() {
  const t = S.theme, r = document.documentElement.style;
  r.setProperty('--accent', t.accent); r.setProperty('--bg', t.bg); r.setProperty('--card', t.card);
  r.setProperty('--text', t.text); r.setProperty('--radius', t.radius + 'px');
  document.body.style.backgroundImage = /^https:\/\//.test(t.wallpaper || '') ? `url("${t.wallpaper.replace(/"/g, '%22')}")` : 'none';
  $('#cAccent').value = t.accent; $('#cBg').value = t.bg; $('#cCard').value = t.card; $('#cRad').value = t.radius; $('#cWall').value = t.wallpaper || '';
}

const R = {
  clock(w, el) {
    el.classList.add('clock'); el.innerHTML = '<div class="time"></div><div class="date"></div>';
    const u = () => { const d = new Date(); $('.time', el).textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); $('.date', el).textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); };
    u(); ticks.push(setInterval(u, 1000));
  },
  search(w, el) {
    el.classList.add('search'); el.innerHTML = '<div class="logo">XER</div><form action="https://duckduckgo.com/" method="get"><input name="q" placeholder="Search privately..." autofocus></form>';
  },
  quicklinks(w, el) {
    el.innerHTML = '<h4>Quick links</h4><div class="links"></div>';
    (w.links || []).forEach((l, i) => { const a = document.createElement('a'); a.href = l.u; a.textContent = l.t; $('.links', el).append(a);
      if (edit) { a.oncontextmenu = (e) => { e.preventDefault(); w.links.splice(i, 1); save(); draw(); }; } });
    if (edit) { const b = document.createElement('button'); b.textContent = '+ link'; b.onclick = () => { const u = prompt('URL (https://...)'); if (!u) return; const t = prompt('Name', u); w.links = w.links || []; w.links.push({ t: t || u, u }); save(); draw(); }; $('.links', el).append(b); }
  },
  notes(w, el) {
    el.innerHTML = '<h4>Notes</h4><textarea placeholder="Jot something down..."></textarea>';
    const ta = $('textarea', el); ta.value = w.text || ''; ta.oninput = () => { w.text = ta.value; save(); };
  },
  todo(w, el) {
    el.classList.add('todo'); w.items = w.items || [];
    el.innerHTML = '<h4>To-do</h4><ul></ul><input placeholder="Add task + Enter" style="width:100%">';
    w.items.forEach((it, i) => { const li = document.createElement('li'); if (it.d) li.className = 'done';
      li.innerHTML = '<input type="checkbox"' + (it.d ? ' checked' : '') + '><span>' + esc(it.t) + '</span>';
      $('input', li).onchange = (e) => { it.d = e.target.checked; save(); draw(); };
      li.oncontextmenu = (e) => { e.preventDefault(); w.items.splice(i, 1); save(); draw(); }; $('ul', el).append(li); });
    $('input[placeholder]', el).onkeydown = (e) => { if (e.key === 'Enter' && e.target.value.trim()) { w.items.push({ t: e.target.value.trim(), d: false }); save(); draw(); } };
  },
  stats(w, el) { el.innerHTML = '<h4>Trackers blocked</h4><div class="big">' + (S.blocked || 0) + '</div>'; },
  bookmarks(w, el) {
    el.innerHTML = '<h4>Bookmarks</h4><div class="list"></div>';
    (S.bookmarks || []).slice(0, 12).forEach(b => { const a = document.createElement('a'); a.href = b.url; a.textContent = b.title || b.url; $('.list', el).append(a); });
    if (!(S.bookmarks || []).length) $('.list', el).textContent = 'Press Ctrl+D on a page to bookmark it.';
  },
  pomodoro(w, el) {
    el.innerHTML = '<h4>Pomodoro</h4><div class="big">25:00</div><button>Start / Reset</button>';
    let left = 1500, t = null; const big = $('.big', el);
    const show = () => big.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    $('button', el).onclick = () => { if (t) { clearInterval(t); t = null; left = 1500; show(); return; } t = setInterval(() => { if (--left <= 0) { clearInterval(t); t = null; left = 1500; } show(); }, 1000); ticks.push(t); };
  },
  calc(w, el) {
    el.classList.add('calc'); el.innerHTML = '<h4>Calculator</h4><input placeholder="2*(3+4)"><div class="res"></div>';
    $('input', el).oninput = (e) => { const v = e.target.value.trim();
      if (!v) { $('.res', el).textContent = ''; return; }
      try { const r = calc(v); $('.res', el).textContent = Number.isFinite(r) ? '= ' + +r.toFixed(10) : ''; } catch { $('.res', el).textContent = ''; } };
  }
};

function draw() {
  ticks.forEach(clearInterval); ticks = [];
  const g = $('#grid'); g.innerHTML = '';
  S.widgets.forEach((w, i) => {
    const el = document.createElement('section'); el.className = 'w ' + (w.size || 'm');
    (R[w.type] || (() => {}))(w, el);
    if (edit) {
      const t = document.createElement('div'); t.className = 'tools';
      const mk = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.onclick = fn; t.append(b); };
      mk('\u25C0', () => { if (i > 0) { [S.widgets[i - 1], S.widgets[i]] = [S.widgets[i], S.widgets[i - 1]]; save(); draw(); } });
      mk('\u25B6', () => { if (i < S.widgets.length - 1) { [S.widgets[i + 1], S.widgets[i]] = [S.widgets[i], S.widgets[i + 1]]; save(); draw(); } });
      mk('size', () => { const o = ['s', 'm', 'l', 'xl']; w.size = o[(o.indexOf(w.size || 'm') + 1) % 4]; save(); draw(); });
      mk('\u00d7', () => { S.widgets.splice(i, 1); save(); draw(); });
      el.append(t);
    }
    g.append(el);
  });
}

(async () => {
  S = await window.xerInternal.dash.get(); theme(); draw();
  $('#editBtn').onclick = () => { edit = !edit; document.body.classList.toggle('edit', edit); $('#addbar').hidden = !edit; $('#editBtn').textContent = edit ? 'Done' : 'Customize'; draw(); };
  $('#setBtn').onclick = () => { location.href = 'settings.html'; };
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { S.widgets.push({ id: uid(), type: b.dataset.add, size: 'm', links: [], items: [], text: '' }); save(); draw(); });
  const bind = (id, key, num) => $(id).oninput = (e) => { S.theme[key] = num ? +e.target.value : e.target.value; theme(); save(); };
  bind('#cAccent', 'accent'); bind('#cBg', 'bg'); bind('#cCard', 'card'); bind('#cRad', 'radius', true); bind('#cWall', 'wallpaper');
  $('#resetBtn').onclick = async () => { if (confirm('Reset dashboard to defaults?')) { S = { ...(await window.xerInternal.dash.reset()), blocked: S.blocked, bookmarks: S.bookmarks }; theme(); draw(); } };
})();
