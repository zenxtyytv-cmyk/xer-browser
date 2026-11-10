const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, shell } = require('electron');
const path = require('path');
const { isBlocked } = require('./blocklist');
const claude = require('./claude');
const store = require('./store');
const gaming = require('./gaming');
const { suggest: suggestRank } = require('./suggest');
const network = require('./network');
const localai = require('./localai');
const actions = require('./actions');
const widgets = require('./widgets');
const downloads = require('./downloads');
const { PinState } = require('./pins');
const { GroupState, COLORS: GROUP_COLORS } = require('./groups');
const { SplitState } = require('./split');
const { TabOrder } = require('./taborder');
const readerSafe = require('./readersafe');
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
// Gaming profile is read from disk synchronously BEFORE app is ready (switches can't change later).
let gameCfg = gaming.normalize(null);
try {
  const fsEarly = require('fs'), pEarly = require('path');
  gameCfg = gaming.normalize(JSON.parse(fsEarly.readFileSync(pEarly.join(app.getPath('userData'), 'gaming.json'), 'utf8')));
} catch {}
{
  let feats = 'DnsOverHttps';
  for (const [k, v] of gaming.switches(gameCfg)) {
    if (k === 'enable-features') feats = gaming.mergeFeatureSwitches(feats, v);   // merge, never override
    else if (v === undefined) app.commandLine.appendSwitch(k); else app.commandLine.appendSwitch(k, v);
  }
  app.commandLine.appendSwitch('enable-features', feats);
}
let gameMode = !!gameCfg.enabled; // live state; Ctrl+Shift+G toggles overlay/prompt behavior instantly


let win;
const tabs = new Map(); // id -> BrowserView
const pins = new PinState(); // pinned tab ids
const groups = new GroupState(); // v0.7: tab groups
const split = new SplitState(); // v1.0: split view (two tabs side by side)
const order = new TabOrder(); // v0.8: user-controlled tab order (drag and drop)
// Final tab-bar order: pinned first, then tabs with group members kept adjacent.
const orderedIds = () => { const all = pins.order(order.order([...tabs.keys()])); const np = all.filter(i => !pins.is(i)); return all.filter(i => pins.is(i)).concat(groups.order(np)); };
let activeId = null;
let nextId = 1;
let sidebarOpen = false;
const TOOLBAR_H = 84;
const SIDEBAR_W = 360;
const stats = { blocked: 0 };

// v0.5: per-tab favicons and closed-tab stack (Ctrl+Shift+T). Pins live in pins.js, downloads in downloads.js.
const favicons = new Map(); // id -> favicon url
const closedStack = []; // [{url, title}] most-recent-last

// The rectangle available to web pages (below the toolbar, left of the sidebar). One definition, used by layout and divider drag.
function contentArea() {
  const [w, h] = win.getContentSize();
  return { x: 0, y: TOOLBAR_H, width: w - (sidebarOpen ? SIDEBAR_W : 0), height: h - TOOLBAR_H };
}

function layout() {
  if (!win) return;
  const area = contentArea();
  if (split.active && tabs.has(split.left) && tabs.has(split.right)) {
    const b = split.bounds(area);
    tabs.get(split.left).setBounds(b.left); tabs.get(split.right).setBounds(b.right);
  } else {
    const view = tabs.get(activeId);
    if (view) view.setBounds(area);
  }
  win.webContents.send('layout', { sidebarOpen, sidebarW: SIDEBAR_W, split: split.toJSON(), area });
}

function pushTabs() {
  scheduleSessionSave();
  win.webContents.send('tabs', {
    activeId,
    groups: groups.list(),
    split: split.toJSON(),
    tabs: orderedIds().map(id => {
      const v = tabs.get(id);
      return { id, title: v.webContents.getTitle() || 'New Tab', url: v.webContents.getURL(),
        pinned: pins.is(id), groupId: groups.groupOf(id), favicon: favicons.get(id) || '', loading: v.webContents.isLoading() };
    }),
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

function newTab(url, opts = {}) {
  const id = nextId++;
  const view = new BrowserView({
    webPreferences: { partition: 'persist:xer', contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'preload-internal.js'), backgroundThrottling: !gameCfg.keepAlive }
  });
  tabs.set(id, view);
  if (opts.after != null && tabs.has(opts.after)) order.addAfter(id, opts.after); else order.add(id);
  const wc = view.webContents;
  // A link that opens a new tab joins the opener's group (like Chrome/Edge); pinned openers don't group.
  wc.setWindowOpenHandler(({ url }) => { const nid = newTab(url, { after: id }); const g = groups.groupOf(id); if (g != null) { groups.assign(nid, g); pushTabs(); } return { action: 'deny' }; });
  ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading']
    .forEach(e => wc.on(e, pushTabs));
  // v0.5: favicon capture
  wc.on('page-favicon-updated', (_, urls) => {
    if (urls && urls.length) { favicons.set(id, urls[0]); pushTabs(); }
  });
  // Auto-upgrade http -> https
  wc.on('did-finish-load', () => { if (gameMode && !gameCfg.hideOverlayDefault && id === activeId && /^https?:/.test(wc.getURL())) { wc.executeJavaScript(gaming.overlayScript()).catch(() => {}); } });
  wc.on('did-navigate', (_, u) => {
    if (!/^https?:/i.test(u)) return; // only real web pages, not reader/error/data pages
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

function leaveSplit() {
  if (!split.active) return;
  const other = [split.left, split.right].filter(i => i !== activeId);
  split.close();
  other.forEach(i => { const v = tabs.get(i); if (v) try { win.removeBrowserView(v); } catch {} });
}

function switchTab(id) {
  if (!tabs.has(id)) return;
  // Clicking a tab that is part of the split just moves focus between the panes.
  if (split.has(id) && split.has(activeId)) {
    split.setFocus(id); activeId = id; layout(); pushTabs(); return;
  }
  if (split.active && !split.has(id)) leaveSplit();
  if (activeId && tabs.get(activeId)) win.removeBrowserView(tabs.get(activeId));
  activeId = id;
  if (gameMode && !gameCfg.hideOverlayDefault) { const w2 = tabs.get(id)?.webContents; if (w2 && /^https?:/.test(w2.getURL())) w2.executeJavaScript(gaming.overlayScript()).catch(() => {}); }
  win.addBrowserView(tabs.get(id));
  layout(); pushTabs();
}

function closeTab(id) {
  const v = tabs.get(id); if (!v) return;
  // v0.5: remember closed tab for Ctrl+Shift+T (skip internal pages)
  try {
    const u = v.webContents.getURL();
    if (/^https?:/.test(u)) {
      closedStack.push({ url: u, title: v.webContents.getTitle() });
      if (closedStack.length > 25) closedStack.shift();
    }
  } catch {}
  // Remember where the tab sat so focus lands on its neighbor (like every other browser), not the last tab.
  const before = orderedIds(); const pos = before.indexOf(id);
  const survivor = split.remove(id);
  win.removeBrowserView(v); v.webContents.destroy(); tabs.delete(id);
  if (survivor != null && tabs.has(survivor)) { activeId = survivor; layout(); }
  order.remove(id); pins.prune(tabs.keys()); groups.prune(tabs.keys()); favicons.delete(id);
  if (activeId === id) {
    activeId = null;
    const after = orderedIds();
    const next = after.length ? after[Math.min(pos, after.length - 1)] : null;
    next ? switchTab(next) : newTab();
  } else pushTabs();
}

function toggleSplit(id = activeId) {
  if (split.active) { // un-split: keep the focused pane, hide the other
    const keep = split.focusedId() ?? activeId;
    [split.left, split.right].forEach(i => { const v = tabs.get(i); if (v) try { win.removeBrowserView(v); } catch {} });
    split.close(); activeId = keep;
    if (tabs.has(keep)) win.addBrowserView(tabs.get(keep));
    layout(); pushTabs(); return false;
  }
  const partner = SplitState.pickPartner(id, orderedIds());
  if (partner == null) return false; // need a second tab to split with
  split.open(id, partner);
  win.addBrowserView(tabs.get(id)); win.addBrowserView(tabs.get(partner));
  activeId = id; layout(); pushTabs(); return true;
}

function reopenClosedTab() {
  while (closedStack.length) {
    const t = closedStack.pop();
    if (t.url && /^https?:/.test(t.url)) { newTab(t.url); return true; }
  }
  return false;
}

function duplicateTab(id) {
  const v = tabs.get(id); if (!v) return;
  try { const nid = newTab(v.webContents.getURL(), { after: id }); const g = groups.groupOf(id); if (g != null) { groups.assign(nid, g); pushTabs(); } } catch {}
}

// v0.5: session restore (Firefox-style) — save open web tabs on quit, reopen on start
// Session format v3: [{url, pinned, group?: {key, name, color, collapsed}}]. Older sessions (plain URL strings) still load.
let sessionTimer = null;
let sessionAllowEmpty = false; // set true only when the user deliberately closes every tab
let quitting = false;
function saveSession() {
  const rows = orderedIds().map(id => {
    let url = ''; try { url = tabs.get(id).webContents.getURL(); } catch {}
    const g = groups.get(groups.groupOf(id));
    return g ? { url, pinned: pins.is(id), group: { key: g.id, name: g.name, color: g.color, collapsed: g.collapsed } } : { url, pinned: pins.is(id) };
  }).filter(r => /^https?:/.test(r.url));
  // During shutdown the tabs may already be torn down. Never replace a good session with an empty one.
  if (!rows.length && !sessionAllowEmpty) return;
  store.save('session', rows.slice(0, 40));
}
// Debounced autosave so a crash or kill does not lose your tabs.
function scheduleSessionSave() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => { if (!quitting) { try { saveSession(); } catch {} } }, 1500);
}

function restoreSession() {
  const rows = store.load('session', []);
  if (!Array.isArray(rows)) return false;
  const norm = rows.map(r => typeof r === 'string' ? { url: r, pinned: false } : r)
    .filter(r => r && /^https?:/.test(r.url)).slice(0, 40);
  if (!norm.length) return false;
  const gmap = new Map(); // saved group key -> live group id
  norm.forEach(r => {
    const id = newTab(r.url);
    if (r.pinned) { pins.toggle(id); return; }
    const g = r.group;
    if (g && typeof g === 'object') {
      if (!gmap.has(g.key)) { const gid = groups.create([id], g.name, g.color); if (g.collapsed) groups.toggleCollapsed(gid); gmap.set(g.key, gid); }
      else groups.assign(id, gmap.get(g.key));
    }
  });
  pushTabs();
  return true;
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
  downloads.attach(ses,
    list => { if (win && !win.isDestroyed()) win.webContents.send('downloads', list); },
    list => store.save('downloads', list));
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
    // Game Mode: a modal dialog would steal focus mid-game. Deny unknown requests quietly (never auto-grant).
    if (gameMode && gameCfg.blockPrompts) { try { win.webContents.send('game:denied', { host, perm }); } catch {} return cb(false); }
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

// v0.5: awesomebar. Ranking lives in suggest.js (pure, tested); data stays on-device.
const suggest = (q) => suggestRank(q, history, bookmarks);

function setupIpc() {
  ipcMain.handle('tab:new', (_, url) => newTab(url));
  ipcMain.handle('tab:switch', (_, id) => switchTab(id));
  ipcMain.handle('tab:close', (_, id) => closeTab(id));
  ipcMain.handle('tab:reopen', () => reopenClosedTab());
  ipcMain.handle('split:toggle', () => toggleSplit());
  ipcMain.handle('split:ratio', (_, r) => { if (!split.active || !split.setRatio(r)) return false; layout(); return split.ratio; });
  ipcMain.handle('split:swap', () => { if (!split.swap()) return false; layout(); pushTabs(); return true; });
  ipcMain.handle('split:get', () => split.toJSON());
  // Draggable divider: the renderer reports the pointer x while dragging; we turn it into a ratio.
  ipcMain.handle('split:drag', (_, x) => {
    if (!split.active) return false;
    const r = SplitState.ratioFromX(x, contentArea());
    if (r == null || !split.setRatio(r)) return false;
    layout(); return split.ratio;
  });
  ipcMain.handle('tab:duplicate', (_, id) => duplicateTab(id));
  // v0.8 drag-and-drop reordering. Drop `id` before/after `targetId`.
  // Crossing the pinned boundary pins/unpins; dropping next to a grouped tab joins that group; dropping next to an ungrouped tab leaves any group.
  ipcMain.handle('tab:move', (_, id, targetId, after) => {
    if (!tabs.has(id) || !tabs.has(targetId) || id === targetId) return false;
    after = !!after;
    if (pins.is(targetId) && !pins.is(id)) { pins.toggle(id); groups.remove(id); }
    else if (!pins.is(targetId) && pins.is(id)) pins.unpin(id);
    if (!pins.is(id)) {
      const tg = groups.groupOf(targetId);
      if (tg != null) groups.assign(id, tg); else groups.remove(id);
    }
    order.move(id, targetId, after);
    pushTabs(); return true;
  });
  ipcMain.handle('tab:pin', (_, id) => { if (!tabs.has(id)) return false; pins.toggle(id); if (pins.is(id)) groups.remove(id); pushTabs(); return pins.is(id); });
  // v0.7 tab groups. Pinned tabs cannot be grouped.
  ipcMain.handle('group:create', (_, ids, name, color) => {
    const valid = (Array.isArray(ids) ? ids : [ids]).filter(i => tabs.has(i) && !pins.is(i));
    if (!valid.length) return null;
    const gid = groups.create(valid, typeof name === 'string' ? name : '', color); pushTabs(); return gid;
  });
  ipcMain.handle('group:add', (_, tabId, gid) => { if (!tabs.has(tabId) || pins.is(tabId)) return false; const ok = groups.assign(tabId, gid); pushTabs(); return ok; });
  ipcMain.handle('group:remove', (_, tabId) => { groups.remove(tabId); pushTabs(); return true; });
  ipcMain.handle('group:rename', (_, gid, name) => { const ok = groups.rename(gid, typeof name === 'string' ? name : ''); pushTabs(); return ok; });
  ipcMain.handle('group:color', (_, gid, color) => { const ok = groups.setColor(gid, color); pushTabs(); return ok; });
  ipcMain.handle('group:toggle', (_, gid) => { const r = groups.toggleCollapsed(gid); pushTabs(); return r; });
  ipcMain.handle('group:ungroup', (_, gid) => { groups.ungroup(gid); pushTabs(); return true; });
  ipcMain.handle('group:close', (_, gid) => { for (const t of groups.members(gid)) closeTab(t); return true; });
  ipcMain.handle('nav:go', (_, url) => tabs.get(activeId)?.webContents.loadURL(normalize(url)));
  ipcMain.handle('nav:back', () => tabs.get(activeId)?.webContents.goBack());
  ipcMain.handle('nav:forward', () => tabs.get(activeId)?.webContents.goForward());
  ipcMain.handle('nav:reload', () => tabs.get(activeId)?.webContents.reload());
  ipcMain.handle('nav:suggest', (_, q) => suggest(q));
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
  ipcMain.handle('dl:list', () => downloads.list());
  ipcMain.handle('dl:clear', () => { downloads.clear(); return true; });
  ipcMain.handle('dl:open', (_, id) => downloads.openFile(id));
  ipcMain.handle('dl:show', (_, id) => downloads.showInFolder(id));
  ipcMain.handle('dl:cancel', (_, id) => downloads.cancel(id));
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
      const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${readerSafe.READER_CSP}"><title>${esc(art.title)}</title>
<style>body{background:#0b0b10;color:#e8e8f0;font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:48px 24px;line-height:1.7}
h1{font-family:system-ui;line-height:1.2}p.byline{color:#9a9ab0;font-style:italic}
a{color:#7aa2f7}img{max-width:100%;height:auto}figure{margin:24px 0}
blockquote{border-left:3px solid #34344d;margin:24px 0;padding-left:16px;color:#c0c0d0}</style>
<h1>${esc(art.title)}</h1>${art.byline ? `<p class="byline">${esc(art.byline)}</p>` : ''}${readerSafe.sanitize(art.content)}
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
  // ---- Gaming / Game Mode ----
  const gamingFile = () => path.join(app.getPath('userData'), 'gaming.json');
  const overlayOn = new Set(); // tab ids with the FPS overlay running
  async function setOverlay(on) {
    const wc = tabs.get(activeId)?.webContents; if (!wc) return false;
    try {
      await wc.executeJavaScript(on ? gaming.overlayScript() : gaming.overlayOffScript());
      on ? overlayOn.add(activeId) : overlayOn.delete(activeId);
      return on;
    } catch { return false; }
  }
  function gameState() { return { cfg: gameCfg, active: gameMode, overlay: overlayOn.has(activeId), restartNeeded: gameRestartNeeded }; }
  let gameRestartNeeded = false;
  ipcMain.handle('game:get', guard(() => gameState()));
  ipcMain.handle('game:set', guard((patch) => {
    const before = gameCfg;
    const next = gaming.normalize({ ...gameCfg, ...(patch || {}) });
    if (gaming.needsRestart(before, next)) gameRestartNeeded = true;
    gameCfg = next; store.save('gaming', gameCfg);
    try { require('fs').writeFileSync(gamingFile(), JSON.stringify(gameCfg)); } catch {}   // read synchronously at next startup
    if ('enabled' in (patch || {})) gameMode = gameCfg.enabled;
    win.webContents.send('game:state', gameState());
    return gameState();
  }));
  ipcMain.handle('game:toggle', guard(async () => {
    gameMode = !gameMode;
    const next = gaming.normalize({ ...gameCfg, enabled: gameMode });
    if (gaming.needsRestart(gameCfg, next)) gameRestartNeeded = true;
    gameCfg = next; try { require('fs').writeFileSync(gamingFile(), JSON.stringify(gameCfg)); } catch {}
    store.save('gaming', gameCfg);
    await setOverlay(gameMode && !gameCfg.hideOverlayDefault);
    win.webContents.send('game:state', gameState());
    return gameState();
  }));
  ipcMain.handle('game:overlay', guard(async () => { await setOverlay(!overlayOn.has(activeId)); win.webContents.send('game:state', gameState()); return gameState(); }));
  ipcMain.handle('game:restart', guard(() => { app.relaunch(); app.exit(0); }));
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
  ipcMain.handle('claude:setKey', (_, k) => { try { claude.saveKey(String(k || '').trim()); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('claude:ask', async (_, { messages, withPage, allowActions }) => {
    try {
      const pc = withPage ? await pageContext() : null;
      const add = allowActions && pc ? actions.SYSTEM_ADDENDUM : '';
      let text;
      if (localai.get().provider === 'local') {
        const system = 'You are the assistant of Xer Browser. Be concise.' + (pc ? `\n\nPage: ${pc.title} (${pc.url})\n${pc.text}` : '') + add;
        text = await localai.ask({ messages, system });
      } else {
        text = await claude.ask({ messages, pageContext: pc, extraSystem: add });
      }
      // Proposed actions are only parsed here; nothing runs until the user approves each one.
      const parsed = add ? actions.parse(text) : { text, actions: [] };
      return { ok: true, text: parsed.text || text, actions: parsed.actions, tabId: activeId, pageUrl: pc ? pc.url : '' };
    }
    catch (e) { return { ok: false, error: e.message }; }
  });
  // Runs ONE user-approved action on the tab it was proposed for. Re-validated here in main.
  ipcMain.handle('claude:runAction', async (_, { action, tabId }) => {
    try {
      const v = actions.validate(action); if (!v.ok) return { ok: false, error: v.error };
      const a = v.action, view = tabs.get(tabId);
      if (!view) return { ok: false, error: 'That tab was closed.' };
      if (tabId !== activeId) return { ok: false, error: 'Switch back to the tab this action was proposed for.' };
      if (a.type === 'navigate') { await view.webContents.loadURL(a.url); return { ok: true }; }
      return await view.webContents.executeJavaScript(actions.pageScript(a));
    } catch (e) { return { ok: false, error: e.message }; }
  });
}

app.whenReady().then(() => {
  bookmarks = store.load('bookmarks', []); history = store.load('history', []); sitePerms = store.load('perms', {}); downloads.hydrate(store.load('downloads', []));
  widgets.init(); localai.init();
  setupPrivacy(); setupIpc();
  network.init().catch(e => console.log('[xer] network init', e.message));
  win = new BrowserWindow({
    width: 1280, height: 820, title: 'Xer Browser', backgroundColor: '#0b0b10',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, backgroundThrottling: !gameCfg.keepAlive }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.on('resize', layout);
  // v0.5: restore last session's tabs (if any), else open a fresh new-tab page
  win.webContents.once('did-finish-load', () => { if (!restoreSession()) newTab(); });
  win.webContents.on('before-input-event', (e, i) => {
    if (i.key === 'F12' && i.type === 'keyDown') tabs.get(activeId)?.webContents.toggleDevTools();
    if (i.control && i.type === 'keyDown') {
      if (i.key === 't' && !i.shift) { newTab(); e.preventDefault(); }
      if (i.key === 'w' && !i.shift) { closeTab(activeId); e.preventDefault(); }
      if (i.key === 'l') { win.webContents.send('focus-url'); e.preventDefault(); }
      if (i.key === 'r') { tabs.get(activeId)?.webContents.reload(); e.preventDefault(); }
      if (i.key === 'd') { win.webContents.send('shortcut', 'bookmark'); e.preventDefault(); }
      if (i.key === 'f') { win.webContents.send('shortcut', 'find'); e.preventDefault(); }
      if (i.key === 'h') { win.webContents.send('shortcut', 'history'); e.preventDefault(); }
      if (i.key === '=' || i.key === '+') { tabs.get(activeId)?.webContents.setZoomLevel(tabs.get(activeId).webContents.getZoomLevel() + 0.5); e.preventDefault(); }
      if (i.key === '-') { tabs.get(activeId)?.webContents.setZoomLevel(tabs.get(activeId).webContents.getZoomLevel() - 0.5); e.preventDefault(); }
      if (i.key === '0') { tabs.get(activeId)?.webContents.setZoomLevel(0); e.preventDefault(); }
      if (i.key === 'Tab') { const ids = orderedIds(); switchTab(ids[(ids.indexOf(activeId) + 1) % ids.length]); e.preventDefault(); }
      if (i.shift && i.key.toLowerCase() === 's') { toggleSplit(); e.preventDefault(); } // Ctrl+Shift+S
      if (i.shift && i.key.toLowerCase() === 'g') { win.webContents.send('shortcut', 'game'); e.preventDefault(); }
      if (i.key === 'j' && !i.shift) { win.webContents.send('toggle-sidebar'); e.preventDefault(); }
      if (i.shift && i.key.toLowerCase() === 'p') { win.webContents.send('shortcut', 'pin'); e.preventDefault(); }
      if (i.shift && i.key.toLowerCase() === 't') { reopenClosedTab(); e.preventDefault(); } // Ctrl+Shift+T
      if (i.shift && i.key.toLowerCase() === 'j') { win.webContents.send('shortcut', 'downloads'); e.preventDefault(); } // Ctrl+Shift+J
    }
  });
});
app.on('login', (e, wc, req, authInfo, cb) => {
  const c = network.credsFor(authInfo);
  if (c) { e.preventDefault(); cb(c.username, c.password); }
});
// v0.5: persist session before quit
app.on('before-quit', () => { if (!quitting) { try { saveSession(); } catch {} } quitting = true; clearTimeout(sessionTimer); });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { if (!quitting) saveSession(); } catch {} quitting = true; app.quit(); });
app.on('window-all-closed', () => { if (!quitting) { try { saveSession(); } catch {} } quitting = true; app.quit(); });
