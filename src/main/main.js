const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, shell } = require('electron');
const path = require('path');
const { isBlocked } = require('./blocklist');
const claude = require('./claude');

// ---- Disable Chromium/Google telemetry & background services ----
[
  ['disable-background-networking'], ['disable-sync'], ['disable-breakpad'],
  ['disable-component-update'], ['disable-domain-reliability'],
  ['no-pings'], ['metrics-recording-only'], ['no-default-browser-check'],
  ['disable-features', 'InterestFeedContentSuggestions,OptimizationHints,Translate,MediaRouter,FederatedLearningOfCohortsAPI,InterestCohortAPI,AttributionReportingCrossAppWeb'],
].forEach(([k, v]) => app.commandLine.appendSwitch(k, v));

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
  if (/^[a-z]+:\/\//i.test(input) || input.startsWith('file:')) return input;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(input) || input.startsWith('localhost')) return 'https://' + input;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(input);
}

function newTab(url) {
  const id = nextId++;
  const view = new BrowserView({
    webPreferences: { partition: 'persist:xer', contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  tabs.set(id, view);
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' }; });
  ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading']
    .forEach(e => wc.on(e, pushTabs));
  // Auto-upgrade http -> https
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

function setupPrivacy() {
  const ses = session.fromPartition('persist:xer');
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
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(false)); // deny by default
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
  ipcMain.handle('claude:hasKey', () => claude.hasKey());
  ipcMain.handle('claude:setKey', (_, k) => { claude.saveKey(k); return true; });
  ipcMain.handle('claude:ask', async (_, { messages, withPage }) => {
    try { return { ok: true, text: await claude.ask({ messages, pageContext: withPage ? await pageContext() : null }) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
}

app.whenReady().then(() => {
  setupPrivacy(); setupIpc();
  win = new BrowserWindow({
    width: 1280, height: 820, title: 'Xer Browser', backgroundColor: '#0b0b10',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.on('resize', layout);
  win.webContents.once('did-finish-load', () => newTab());
  win.webContents.on('before-input-event', (e, i) => {
    if (i.control && i.type === 'keyDown') {
      if (i.key === 't') { newTab(); e.preventDefault(); }
      if (i.key === 'w') { closeTab(activeId); e.preventDefault(); }
      if (i.key === 'l') { win.webContents.send('focus-url'); e.preventDefault(); }
      if (i.key === 'j') { win.webContents.send('toggle-sidebar'); e.preventDefault(); }
    }
  });
});
app.on('window-all-closed', () => app.quit());
