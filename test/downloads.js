// Downloads manager test: electron test/downloads.js --no-sandbox --disable-gpu
const { app, session, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const downloads = require('../src/main/downloads');

function serve(port, handler) {
  const srv = http.createServer(handler);
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
function waitUntil(fn, ms = 8000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      let v = false; try { v = fn(); } catch {}
      if (v) { clearInterval(iv); res(); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout')); }
    }, 100);
  });
}

app.whenReady().then(async () => {
  const ses = session.fromPartition('persist:xer');
  let pushes = 0;
  downloads.attach(ses, () => pushes++, () => {});
  const w = new BrowserWindow({ show: false, webPreferences: { partition: 'persist:xer', contextIsolation: true } });
  await w.webContents.loadURL('about:blank');

  // --- 1. a normal download completes and is recorded ---
  const buf = Buffer.alloc(512 * 1024);
  for (let i = 0; i < buf.length; i++) buf[i] = i & 255;
  const srv = await serve(0, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="xer-test.bin"',
      'Content-Length': String(buf.length)
    });
    res.end(buf);
  });
  const port = srv.address().port;
  w.webContents.downloadURL(`http://127.0.0.1:${port}/file`);
  await waitUntil(() => downloads.list().some(d => d.state === 'completed'));
  const rec = downloads.list()[0];
  check('download recorded', !!rec);
  check('filename kept', rec.filename === 'xer-test.bin');
  check('saved to disk', fs.existsSync(rec.path) && fs.statSync(rec.path).size === buf.length);
  check('bytes accounted', rec.received === buf.length && rec.total === buf.length);
  check('update events pushed', pushes > 0);

  // --- 2. same-name downloads do not overwrite: "xer-test (1).bin" ---
  w.webContents.downloadURL(`http://127.0.0.1:${port}/file`);
  await waitUntil(() => downloads.list().length >= 2 && downloads.list()[0].state === 'completed');
  const rec2 = downloads.list()[0];
  check('duplicate name uniquified', rec2.filename === 'xer-test (1).bin' && rec2.path !== rec.path);
  check('both files on disk', fs.existsSync(rec2.path));

  // --- 3. cancel an in-flight download ---
  const big = 64 * 1024 * 1024;
  const slow = await serve(0, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="xer-slow.bin"',
      'Content-Length': String(big)
    });
    let sent = 0;
    const iv = setInterval(() => {
      if (sent >= big) { clearInterval(iv); res.end(); return; }
      res.write(Buffer.alloc(16 * 1024)); sent += 16 * 1024;
    }, 80);
    req.on('close', () => clearInterval(iv));
  });
  w.webContents.downloadURL(`http://127.0.0.1:${slow.address().port}/slow`);
  await waitUntil(() => downloads.list().length >= 3 && downloads.list()[0].state === 'progressing' && downloads.list()[0].received > 0);
  const inFlight = downloads.list()[0];
  check('in-flight download visible', inFlight.filename === 'xer-slow.bin' && inFlight.received > 0);
  check('cancel works', downloads.cancel(inFlight.id) === true);
  await waitUntil(() => downloads.list().find(d => d.id === inFlight.id)?.state === 'cancelled');
  check('cancelled state recorded', downloads.list().find(d => d.id === inFlight.id).state === 'cancelled');
  check('cancel of unknown id is safe', downloads.cancel('nope') === false);

  // --- 4. open/show guards ---
  check('open only when completed', downloads.openFile(inFlight.id) === false);
  check('open completed returns true', downloads.openFile(rec.id) === true);

  // --- 5. clear ---
  const paths = downloads.list().map(d => d.path);
  downloads.clear();
  check('clear empties list', downloads.list().length === 0);

  // cleanup: remove test files written to the real Downloads folder
  paths.filter(p => p && p.includes('xer-test') || p && p.includes('xer-slow')).forEach(p => { try { fs.rmSync(p); } catch {} });
  srv.close(); slow.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); app.exit(fails ? 1 : 0);
}).catch(e => { console.log('FAIL test crashed: ' + e.message); app.exit(1); });
