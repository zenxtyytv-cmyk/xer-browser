// Reader mode test: same injection path as the real handler.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const SRC = fs.readFileSync(require.resolve('@mozilla/readability/Readability.js'), 'utf8');
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu');
const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) process.exitCode = 1; };
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false });
  await w.loadFile(path.join(__dirname, 'fixtures/article.html'));
  const art = await w.webContents.executeJavaScript(`(() => {
    ${SRC}
    const a = new Readability(document.cloneNode(true)).parse();
    return a ? { title: a.title, byline: a.byline, content: a.content } : null;
  })()`);
  check('article parsed', !!art);
  if (art) {
    check('title from document', art.title === 'Test News Article - Xer Fixtures');
    check('byline extracted', /Jane Reporter/.test(art.byline || ''));
    check('body text extracted', /Marta Vela/.test(art.content) && /Riverton Ravens/.test(art.content));
    check('nav junk removed', !/Privacy<\/a>/.test(art.content) && !/>Weather</.test(art.content));
  }
  app.exit();
});
