// Downloads manager: capture every download into the OS Downloads folder,
// track progress, and persist the list. No save dialogs, no prompts.
const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let items = []; // recently downloaded, newest first
const live = new Map(); // id -> active DownloadItem
let push = () => {};
let persist = () => {};

function uniquePath(dir, name) {
  let p = path.join(dir, name);
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  for (let i = 1; i < 1000; i++) {
    p = path.join(dir, `${base} (${i})${ext}`);
    if (!fs.existsSync(p)) return p;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

// Attach to the browser session. onPush(list) is called (throttled) on
// progress updates; onPersist(list) must store the list.
function attach(ses, onPush, onPersist) {
  if (onPush) push = onPush;
  if (onPersist) persist = onPersist;
  ses.on('will-download', (_e, item) => {
    let dir;
    try { dir = app.getPath('downloads'); fs.mkdirSync(dir, { recursive: true }); }
    catch { item.cancel(); return; }
    const savePath = uniquePath(dir, item.getFilename() || 'download');
    item.setSavePath(savePath);
    const id = 'dl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const rec = {
      id, filename: path.basename(savePath), url: item.getURL(),
      path: savePath, state: 'progressing',
      received: 0, total: item.getTotalBytes(), started: Date.now()
    };
    items.unshift(rec); items = items.slice(0, 100);
    live.set(id, item); persist(items); push(items);
    let last = Date.now();
    item.on('updated', (_ev, state) => {
      rec.state = state === 'interrupted' ? 'interrupted' : 'progressing';
      rec.received = item.getReceivedBytes(); rec.total = item.getTotalBytes();
      if (Date.now() - last > 400) { last = Date.now(); push(items); }
    });
    item.once('done', (_ev, state) => {
      rec.state = state; // 'completed' | 'cancelled' | 'interrupted'
      rec.received = item.getReceivedBytes();
      live.delete(id); persist(items); push(items);
    });
  });
}

function hydrate(saved) { if (Array.isArray(saved)) items = saved.filter(x => x && x.id); }
function list() { return items; }
function clear() { items = []; persist(items); push(items); }
// Drops finished entries (not running downloads). since > 0 keeps entries started before it.
function clearFinished(since = 0) {
  items = items.filter(x => x.state === 'progressing' || (since && !(Number(x.started) >= since)));
  persist(items); push(items);
}
function find(id) { return items.find(x => x.id === id); }
function openFile(id) { const r = find(id); if (!r || r.state !== 'completed') return false; shell.openPath(r.path); return true; }
function showInFolder(id) { const r = find(id); if (!r || r.state !== 'completed') return false; shell.showItemInFolder(r.path); return true; }
function cancel(id) { const it = live.get(id); if (!it) return false; it.cancel(); return true; }

module.exports = { attach, hydrate, list, clear, clearFinished, openFile, showInFolder, cancel };
