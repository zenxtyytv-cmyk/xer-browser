// Live Save-as-PDF test against the REAL app: saves a real page to a real PDF file.
const { spawn } = require('child_process'); const http = require('http'); const fs = require('fs'), os = require('os'), path = require('path');
const WebSocket = require('ws'); const { waitReady, freshProfile, sleep } = require('./helpers');
const { looksLikePdf } = require('../src/main/pdfexport');
const evalIn = (u, expr) => new Promise((res, rej) => { const ws = new WebSocket(u);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result?.result?.value ?? d.result?.exceptionDetails?.exception?.description); } }); ws.on('error', rej); });
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
const PAGE = '<html><head><title>Quarterly: Report/2026</title></head><body style="background:#eef"><h1>Quarterly Report</h1>' + '<p>Revenue grew steadily across every region this quarter, driven by strong demand.</p>'.repeat(120) + '</body></html>';
const prof = freshProfile(); const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xer-pdf-'));
const killp = (p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch {} };
(async () => {
  const site = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); }).listen(9668);
  const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${prof}`, '--remote-debugging-port=9362'], { stdio: 'ignore', detached: true, env: { ...process.env, XER_TEST_PDF_DIR: outDir } });
  try {
    const t = await waitReady(9362); const main = t.find(x => x.url.includes('renderer/index.html')); const W = main.webSocketDebuggerUrl;
    check('PDF toolbar button exists', (await evalIn(W, '!!document.getElementById("pdfBtn")')) === true);
    check('app exposes savePdf', (await evalIn(W, 'typeof window.xer.savePdf')) === 'function');
    // the first tab is the new-tab page, which must be refused
    const refused = await evalIn(W, 'window.xer.savePdf()');
    check('new-tab page is refused with a message', refused && refused.ok === false && /cannot be saved/i.test(refused.error || ''));
    check('refusal wrote no file', fs.readdirSync(outDir).length === 0);

    await evalIn(W, 'window.xer.newTab("http://127.0.0.1:9668/")'); await sleep(3500);
    const r = await evalIn(W, 'window.xer.savePdf()');
    check('save reports success', r && r.ok === true);
    check('file name comes from the title, made safe', r && path.basename(r.path) === 'Quarterly Report 2026.pdf');
    const buf = r && r.ok ? fs.readFileSync(r.path) : Buffer.alloc(0);
    check('file is a real PDF', looksLikePdf(buf));
    check('PDF is non-trivial in size', buf.length > 3000);
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    check('long page produced more than one PDF page', pages > 1);

    const r2 = await evalIn(W, 'window.xer.savePdf()');
    check('second save does not overwrite the first', r2 && r2.ok && r2.path !== r.path && /\(1\)\.pdf$/.test(r2.path) && fs.existsSync(r.path));
    check('exactly two files saved', fs.readdirSync(outDir).length === 2);
    global.__keep = outDir; console.log('OUTDIR ' + outDir);

    // reader-mode pages (data: URLs) can be printed too
    const rd = await evalIn(W, 'window.xer.readerOpen()'); await sleep(1800);
    check('reader mode opened', rd && rd.ok === true);
    const r3 = await evalIn(W, 'window.xer.savePdf()');
    check('reader page can be saved', r3 && r3.ok === true && looksLikePdf(fs.readFileSync(r3.path)));
  } catch (e) { console.log('FAIL exception: ' + e.message); ok = false; }
  killp(p); site.close(); setTimeout(() => process.exit(ok ? 0 : 1), 500);
})();
