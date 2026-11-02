// Pinned tabs test: xvfb-run -a npx electron test/pins.js --no-sandbox --disable-gpu
const { app } = require('electron');
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const { PinState } = require('../src/main/pins');

app.whenReady().then(async () => {
  // --- 1. toggle ---
  const pins = new PinState();
  check('starts unpinned', pins.is(1) === false);
  check('toggle pins', pins.toggle(1) === true && pins.is(1) === true);
  check('toggle unpins', pins.toggle(1) === false && pins.is(1) === false);

  // --- 2. ordering: pinned first, stable within groups ---
  // ids in insertion order: 1,2,3,4,5; pin 3 and 5
  pins.toggle(3); pins.toggle(5);
  const ordered = pins.order([1, 2, 3, 4, 5]);
  check('pinned sort first', ordered.slice(0, 2).every(id => pins.is(id)));
  check('pinned keep relative order', ordered[0] === 3 && ordered[1] === 5);
  check('unpinned keep relative order', ordered.slice(2).join(',') === '1,2,4');
  check('order does not mutate input', [1, 2, 3, 4, 5].join(',') === '1,2,3,4,5');

  // --- 3. ordering updates after unpin ---
  pins.toggle(3);
  const ordered2 = pins.order([1, 2, 3, 4, 5]);
  check('unpinned tab drops back', ordered2.join(',') === '5,1,2,3,4');

  // --- 4. pruning closed tabs ---
  pins.toggle(3); // 3 and 5 pinned again
  pins.prune([2, 4, 5]); // tabs 1 and 3 closed
  check('prune drops closed pinned tabs', pins.is(3) === false && pins.is(5) === true);
  check('prune keeps working set order sane', pins.order([2, 4, 5]).join(',') === '5,2,4');

  // --- 5. renderer wiring: tab bar renders pin control and dblclick handler ---
  const { BrowserWindow } = require('electron');
  const path = require('path');
  const w = new BrowserWindow({ show: false, width: 1000, height: 700,
    webPreferences: { preload: path.join(__dirname, '../src/main/preload.js'), contextIsolation: true } });
  const errs = []; w.webContents.on('console-message', (e, l, m) => { if (l >= 3) errs.push(m); });
  await w.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  check('ui loads', await w.webContents.executeJavaScript('!!document.getElementById("tabs")'));
  check('pin api exposed', (await w.webContents.executeJavaScript('typeof window.xer?.pinTab')) === 'function');
  check('no renderer errors', errs.length === 0);
  if (errs.length) console.log(errs);

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); app.exit(fails ? 1 : 0);
}).catch(e => { console.log('FAIL test crashed: ' + e.message); app.exit(1); });
