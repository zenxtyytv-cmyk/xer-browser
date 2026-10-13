const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, shell } = require('electron');
const path = require('path');
const { isBlocked } = require('./blocklist');
const claude = require('./claude');
const store = require('./store');
const network = require('./network');
const localai = require('./localai');
const widgets = require('./widgets');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fsx = require('fs');
const READABILITY_SRC = fsx.readFileSync(require.resolve('@mozilla/readability/Readability.js'), 'utf8');
const pathx = require('path');

let bookmarks = [], history = [], sitePerms = {};

// ---- Disable Chromium/Google telemetry & background services ----
[
  ['disable-background-networking'], ['disable-sync'], ['disable-breakpad'],
  ['disable-component-update'], ['disable-domain-reliability'],
  ['no-pings'], ['metrics-recording-only'], ['no-default-browser-check'],
  ['disable-features', 'InterestFeedContentSuggestions,OptimizationHints,Translate,MediaRouter,FederatedLearningOfCohortsAPI,InterestCohortAPI,AttributionReportingCrossAppWeb'],
].forEach(([k, v]) => app.commandLine.appendSwitch(k, v));
app.commandLine.appendSwitch('enable-features', 'DnsOverHttps');

let win;
const tabs = new Map(); // id -> BrowserView
let activeId = null;
let nextId = 1;
let sidebarOpen = false;
const TOOLBAR_H = 84;
const SIDEBAR_W = 360;
const stats = { blocked: 0 };

function layout() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  const view = tabs.get(activeId);
  if (view) view.setBounds({ x: 0, y: TOOLBAR_H, width: w - (sidebarOpen ? SIDEBAR_W : 0), height: h - TOOLBAR_H });
  win.webContents.send('layout', { sidebarOpen, sidebarW: SIDEBAR_W });
}

function pushTabs() {
  win.webContents.send('tabs', {
    activeId,
    tabs: [...tabs.entries()].map(([id, v]) => ({
      id, title: v.webContents.getTitle() || 'New Tab', url: v.webContents.getURL()
    })),
    blocked: stats.blocked
  });
}

function normalize(input) {
  input = input.trim();
  if (/^http:\/\//i.test(input) && !/^http:\/\/(localhost|127\.)/.test(input)) return input.replace(/^http:/i, 'https:');
  if (/^[a-z]+:\/\//i.test(input) || input.startsWith('file:')) return input;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(input) || input.startsWith('localhost')) return 'https://' + input;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(input);
}

function newTab(url) {
  const id = nextId++;
  const view = new BrowserView({
    webPreferences: { partition: 'persist:xer', contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'preload-internal.js') }
  });
  tabs.set(id, view);
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' }; });
  ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading']
    .forEach(e => wc.on(e, pushTabs));
  // Auto-upgrade http -> https
  wc.on('did-navigate', (_, u) => {
    if (u.startsWith('file:')) return;
    history.unshift({ url: u, title: wc.getTitle(), t: Date.now() });
    history = history.slice(0, 2000); store.save('history', history);
  });
  wc.on('did-fail-load', (_, code, desc, u, isMain) => {
    if (isMain && code !== -3) wc.loadURL('data:text/html,' + encodeURIComponent(
      `<body style="background:#0b0b10;color:#e8e8f0;font-family:system-ui;display:grid;place-items:center;height:100vh"><div><h2>Can't reach this page</h2><p style="color:#9a9ab0">${String(desc).replace(/</g,'&lt;')}</p><p style="color:#9a9ab0">${String(u).replace(/</g,'&lt;')}</p></div>`));
  });
  wc.on('will-navigate', (e, u) => {
    if (u.startsWith('http://') && !/^http:\/\/(localhost|127\.)/.test(u)) {
      e.preventDefault(); wc.loadURL(u.replace('http://', 'https://'));
    }
  });
  switchTab(id);
  wc.loadURL(url ? normalize(url) : 'file://' + path.join(__dirname, '../renderer/newtab.html'));
  return id;
}

function switchTab(id) {
  if (!tabs.has(id)) return;
  if (activeId && tabs.get(activeId)) win.removeBrowserView(tabs.get(activeId));
  activeId = id;
  win.addBrowserView(tabs.get(id));
  layout(); pushTabs();
}

function closeTab(id) {
  const v = tabs.get(id); if (!v) return;
  win.removeBrowserView(v); v.webContents.destroy(); tabs.delete(id);
  if (activeId === id) {
    activeId = null;
    const next = [...tabs.keys()].pop();
    next ? switchTab(next) : newTab();
  } else pushTabs();
}

async function setupAdblock(ses) {
  try {
    const cache = pathx.join(app.getPath('userData'), 'adblock-engine.bin');
    const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: cache,
      read: async (p) => fsx.promises.readFile(p),
      write: async (p, buf) => fsx.promises.writeFile(p, buf)
    });
    blocker.enableBlockingInSession(ses);
    blocker.on('request-blocked', () => { stats.blocked++; });
    console.log('[xer] adblock engine ready');
  } catch (e) { console.log('[xer] adblock engine unavailable, using built-in list:', e.message); }
}

function setupPrivacy() {
  const ses = session.fromPartition('persist:xer');
  setupAdblock(ses);
  ses.webRequest.onBeforeRequest((d, cb) => {
    if (isBlocked(d.url)) { stats.blocked++; return cb({ cancel: true }); }
    cb({});
  });
  ses.webRequest.onBeforeSendHeaders((d, cb) => {
    const h = d.requestHeaders;
    h['DNT'] = '1'; h['Sec-GPC'] = '1';
    delete h['X-Client-Data']; // Chrome variations tracking header
    // Strip cross-origin referrers down to origin
    if (h['Referer']) { try { const r = new URL(h['Referer']); if (r.origin !== new URL(d.url).origin) h['Referer'] = r.origin + '/'; } catch {} }
    cb({ requestHeaders: h });
  });
  ses.setPermissionRequestHandler((wc, perm, cb) => {
    let host = ''; try { host = new URL(wc.getURL()).hostname; } catch {}
    const key = host + '|' + perm;
    if (key in sitePerms) return cb(sitePerms[key]);
    const { dialog } = require('electron');
    dialog.showMessageBox(win, { type: 'question', buttons: ['Allow', 'Block'], defaultId: 1, cancelId: 1,
      message: `${host} wants permission: ${perm}`, checkboxLabel: 'Remember my choice', checkboxChecked: true })
      .then(r => { const ok = r.response === 0; if (r.checkboxChecked) { sitePerms[key] = ok; store.save('perms', sitePerms); } cb(ok); });
  });
  ses.setSpellCheckerEnabled(false);
}

async function pageContext() {
  const v = tabs.get(activeId); if (!v) return null;
  const wc = v.webContents;
  let text = '';
  try { text = await wc.executeJavaScript('document.body ? document.body.innerText : ""'); } catch {}
  return { title: wc.getTitle(), url: wc.getURL(), text: text.slice(0, 12000) };
}

function setupIpc() {
  ipcMain.handle('tab:new', (_, url) => newTab(url));
  ipcMain.handle('tab:switch', (_, id) => switchTab(id));
  ipcMain.handle('tab:close', (_, id) => closeTab(id));
  ipcMain.handle('nav:go', (_, url) => tabs.get(activeId)?.webContents.loadURL(normalize(url)));
  ipcMain.handle('nav:back', () => tabs.get(activeId)?.webContents.goBack());
  ipcMain.handle('nav:forward', () => tabs.get(activeId)?.webContents.goForward());
  ipcMain.handle('nav:reload', () => tabs.get(activeId)?.webContents.reload());
  ipcMain.handle('sidebar:toggle', () => { sidebarOpen = !sidebarOpen; layout(); return sidebarOpen; });
  ipcMain.handle('bm:list', () => bookmarks);
  ipcMain.handle('bm:toggle', () => {
    const wc = tabs.get(activeId)?.webContents; if (!wc) return false;
    const url = wc.getURL(); if (url.startsWith('file:') || url.startsWith('data:')) return false;
    const i = bookmarks.findIndex(b => b.url === url);
    if (i >= 0) bookmarks.splice(i, 1); else bookmarks.push({ url, title: wc.getTitle() });
    store.save('bookmarks', bookmarks); return i < 0;
  });
  ipcMain.handle('hist:list', () => history.slice(0, 200));
  ipcMain.handle('hist:clear', () => { history = []; store.save('history', history); return true; });
  ipcMain.handle('find', (_, text, fwd = true) => {
    const wc = tabs.get(activeId)?.webContents; if (!wc) return;
    text ? wc.findInPage(text, { forward: fwd, findNext: true }) : wc.stopFindInPage('clearSelection');
  });
  ipcMain.handle('zoom', (_, d) => { const wc = tabs.get(activeId)?.webContents; if (!wc) return;
    wc.setZoomLevel(d === 0 ? 0 : wc.getZoomLevel() + d); });
  ipcMain.handle('devtools', () => tabs.get(activeId)?.webContents.toggleDevTools());
  ipcMain.handle('perms:reset', () => { sitePerms = {}; store.save('perms', sitePerms); return true; });
  ipcMain.handle('reader:open', async () => {
    const wc = tabs.get(activeId)?.webContents; if (!wc) return { ok: false, error: 'No active tab' };
    try {
      const art = await wc.executeJavaScript(`(() => {
        ${READABILITY_SRC}
        const doc = document.cloneNode(true);
        const a = new Readability(doc).parse();
        return a ? { title: a.title, byline: a.byline, content: a.content } : null;
      })()`);
      if (!art) return { ok: false, error: 'No article found on this page' };
      const esc = (x) => String(x).replace(/</g, '&lt;');
      const html = `<!doctype html><meta charset="utf-8"><title>${esc(art.title)}</title>
<style>body{background:#0b0b10;color:#e8e8f0;font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:48px 24px;line-height:1.7}
h1{font-family:system-ui;line-height:1.2}p.byline{color:#9a9ab0;font-style:italic}
a{color:#7aa2f7}img{max-width:100%;height:auto}figure{margin:24px 0}
blockquote{border-left:3px solid #34344d;margin:24px 0;padding-left:16px;color:#c0c0d0}</style>
<h1>${esc(art.title)}</h1>${art.byline ? `<p class="byline">${esc(art.byline)}</p>` : ''}${art.content}
<div style="border-top:1px solid #34344d;margin-top:48px;padding-top:16px;color:#9a9ab0;font-family:system-ui">Xer Reader — press the back button to return to the original page.</div>`;
      wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  // Internal-page APIs: only callable from OUR bundled pages (exact file:// path inside src/renderer).
  // Web pages (including ones with a lookalike URL) are rejected.
  const RENDERER_DIR = path.resolve(__dirname, '../renderer');
  const internal = (e) => {
    try {
      const u = new URL(e.senderFrame.url);
      if (u.protocol !== 'file:') return false;
      const p = path.resolve(decodeURIComponent(u.pathname.replace(/^\/([A-Za-z]:)/, '$1')));
      return p.startsWith(RENDERER_DIR + path.sep);
    } catch { return false; }
  };
  const guard = (fn) => (e, ...a) => { if (!internal(e)) throw new Error('forbidden'); return fn(...a); };
  ipcMain.handle('net:status', guard(() => network.status()));
  ipcMain.handle('net:add', guard((p) => network.addProxy(p)));
  ipcMain.handle('net:remove', guard((id) => network.removeProxy(id)));
  ipcMain.handle('net:mode', guard((m, id) => network.setMode(m, id)));
  ipcMain.handle('net:doh', guard((on) => network.setDoh(on)));
  ipcMain.handle('net:ip', guard(async () => { try { return { ok: true, ip: await network.exitIp() }; } catch (e) { return { ok: false, error: e.message }; } }));
  ipcMain.handle('dash:get', guard(() => ({ ...widgets.get(), blocked: stats.blocked, bookmarks })));
  ipcMain.handle('dash:set', guard((d) => widgets.set(d)));
  ipcMain.handle('dash:reset', guard(() => widgets.reset()));
  ipcMain.handle('ai:get', guard(() => localai.get()));
  ipcMain.handle('ai:set', guard((p) => localai.set(p)));
  ipcMain.handle('ai:models', guard(async () => { try { return { ok: true, models: await localai.models() }; } catch (e) { return { ok: false, error: 'Ollama not reachable at ' + localai.get().ollamaUrl }; } }));
  ipcMain.handle('open:settings', () => newTab('file://' + path.join(__dirname, '../renderer/settings.html')));
  ipcMain.handle('claude:hasKey', () => claude.hasKey());
  ipcMain.handle('claude:setKey', (_, k) => { claude.saveKey(k); return true; });
  ipcMain.handle('claude:ask', async (_, { messages, withPage }) => {
    try {
      const pc = withPage ? await pageContext() : null;
      if (localai.get().provider === 'local') {
        const system = 'You are the assistant of Xer Browser. Be concise.' + (pc ? `\n\nPage: ${pc.title} (${pc.url})\n${pc.text}` : '');
        return { ok: true, text: await localai.ask({ messages, system }) };
      }
      return { ok: true, text: await claude.ask({ messages, pageContext: pc }) };
    }
    catch (e) { return { ok: false, error: e.message }; }
  });
}

app.whenReady().then(() => {
  bookmarks = store.load('bookmarks', []); history = store.load('history', []); sitePerms = store.load('perms', {});
  widgets.init(); localai.init();
  setupPrivacy(); setupIpc();
  network.init().catch(e => console.log('[xer] network init', e.message));
  win = new BrowserWindow({
    width: 1280, height: 820, title: 'Xer Browser', backgroundColor: '#0b0b10',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.on('resize', layout);
  win.webContents.once('did-finish-load', () => newTab());
  win.webContents.on('before-input-event', (e, i) => {
    if (i.key === 'F12' && i.type === 'keyDown') tabs.get(activeId)?.webContents.toggleDevTools();
    if (i.control && i.type === 'keyDown') {
      if (i.key === 't') { newTab(); e.preventDefault(); }
      if (i.key === 'w') { closeTab(activeId); e.preventDefault(); }
      if (i.key === 'l') { win.webContents.send('focus-url'); e.preventDefault(); }
      if (i.key === 'r') { tabs.get(activeId)?.webContents.reload(); e.preventDefault(); }
      if (i.key === 'd') { win.webContents.send('shortcut', 'bookmark'); e.preventDefault(); }
      if (i.key === 'f') { win.webContents.send('shortcut', 'find'); e.preventDefault(); }
      if (i.key === 'h') { win.webContents.send('shortcut', 'history'); e.preventDefault(); }
      if (i.key === '=' || i.key === '+') { tabs.get(activeId)?.webContents.setZoomLevel(tabs.get(activeId).webContents.getZoomLevel() + 0.5); e.preventDefault(); }
      if (i.key === '-') { tabs.get(activeId)?.webContents.setZoomLevel(tabs.get(activeId).webContents.getZoomLevel() - 0.5); e.preventDefault(); }
      if (i.key === '0') { tabs.get(activeId)?.webContents.setZoomLevel(0); e.preventDefault(); }
      if (i.key === 'Tab') { const ids = [...tabs.keys()]; switchTab(ids[(ids.indexOf(activeId) + 1) % ids.length]); e.preventDefault(); }
      if (i.key === 'j') { win.webContents.send('toggle-sidebar'); e.preventDefault(); }
    }
  });
});
app.on('login', (e, wc, req, authInfo, cb) => {
  const c = network.credsFor(authInfo);
  if (c) { e.preventDefault(); cb(c.username, c.password); }
});
app.on('window-all-closed', () => app.quit());
