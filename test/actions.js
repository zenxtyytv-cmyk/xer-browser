// Page-actions tests: electron test/actions.js --no-sandbox --disable-gpu
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu');
const actions = require('../src/main/actions');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

// --- parsing / validation (pure) ---
const reply = 'Sure, filling it in.\n```xer-actions\n[{"type":"type","selector":"#q","text":"hello","label":"Fill search"},{"type":"click","selector":"#go","label":"Submit"}]\n```';
let p = actions.parse(reply);
check('parse extracts 2 actions', p.actions.length === 2);
check('parse strips block from text', p.text === 'Sure, filling it in.');
check('no block means no actions', actions.parse('just text').actions.length === 0);
check('bad JSON ignored', actions.parse('```xer-actions\n{nope\n```').actions.length === 0);
check('non-array ignored', actions.parse('```xer-actions\n{"type":"click"}\n```').actions.length === 0);
check('unknown type rejected', !actions.validate({ type: 'eval', code: 'x' }).ok);
check('javascript: url rejected', !actions.validate({ type: 'navigate', url: 'javascript:alert(1)' }).ok);
check('file: url rejected', !actions.validate({ type: 'navigate', url: 'file:///etc/passwd' }).ok);
check('https url accepted', actions.validate({ type: 'navigate', url: 'https://example.com/a' }).ok);
check('password selector blocked', !actions.validate({ type: 'type', selector: 'input[type=password]', text: 'x' }).ok);
check('card label blocked', !actions.validate({ type: 'type', selector: '#f1', text: '4111', label: 'Enter card number' }).ok);
check('empty selector rejected', !actions.validate({ type: 'click', selector: '  ' }).ok);
const many = JSON.stringify(Array.from({ length: 20 }, () => ({ type: 'scroll', direction: 'down' })));
check('capped at ' + actions.MAX_ACTIONS + ' actions', actions.parse('```xer-actions\n' + many + '\n```').actions.length === actions.MAX_ACTIONS);
check('system addendum mentions approval', /approve/i.test(actions.SYSTEM_ADDENDUM));

// --- real execution inside a page ---
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 800, height: 600 });
  const html = '<body style="height:3000px"><input id="q"><input id="pw" type="password"><input name="cardnumber" id="cc"><button id="go" onclick="window.clicked=(window.clicked||0)+1">Go</button></body>';
  await w.loadURL('data:text/html,' + encodeURIComponent(html));
  const run = (a) => w.webContents.executeJavaScript(actions.pageScript(actions.validate(a).action || a));
  let r = await run({ type: 'type', selector: '#q', text: 'hello world' });
  check('type action succeeds', r.ok && await w.webContents.executeJavaScript('document.querySelector("#q").value') === 'hello world');
  r = await run({ type: 'click', selector: '#go' });
  check('click action fires handler', r.ok && await w.webContents.executeJavaScript('window.clicked') === 1);
  r = await w.webContents.executeJavaScript(actions.pageScript({ type: 'type', selector: '#pw', text: 'secret' }));
  check('page refuses password field', !r.ok && await w.webContents.executeJavaScript('document.querySelector("#pw").value') === '');
  r = await w.webContents.executeJavaScript(actions.pageScript({ type: 'type', selector: '#cc', text: '4111' }));
  check('page refuses card field by name', !r.ok && await w.webContents.executeJavaScript('document.querySelector("#cc").value') === '');
  r = await run({ type: 'click', selector: '#nope' });
  check('missing element reports error', !r.ok && /not found/.test(r.error));
  r = await run({ type: 'scroll', direction: 'bottom' });
  check('scroll to bottom', r.ok && await w.webContents.executeJavaScript('window.scrollY') > 500);
  const evil = '#q"); window.pwned=1; ("';
  await w.webContents.executeJavaScript(actions.pageScript({ type: 'click', selector: evil })).catch(() => {});
  check('selector injection cannot run code', await w.webContents.executeJavaScript('window.pwned') === undefined);
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); app.exit(fails ? 1 : 0);
});
