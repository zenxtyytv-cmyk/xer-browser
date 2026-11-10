// Live multi-step plan test against the REAL app: the plan card appears, nothing runs until Approve, steps run in order,
// a failing step halts the plan, Stop works, and a plan that leaves the site shows a warning.
const { spawn } = require('child_process'); const http = require('http');
const WebSocket = require('ws'); const { waitReady, freshProfile, get, sleep } = require('./helpers');
const evalIn = (u, expr) => new Promise((res, rej) => { const ws = new WebSocket(u);
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })));
  ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { ws.close(); res(d.result?.result?.value ?? d.result?.exceptionDetails?.exception?.description); } }); ws.on('error', rej); });
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
const PAGE = '<title>plan page</title><input id="q"><button id="go" onclick="document.getElementById(\'out\').textContent=\'sent:\'+document.getElementById(\'q\').value">Go</button><div id="out"></div>';
const prof = freshProfile(); const killp = (p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch {} };
(async () => {
  const site = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); }).listen(9668);
  const p = spawn('npx', ['electron', '.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${prof}`, '--remote-debugging-port=9362'], { stdio: 'ignore', detached: true });
  try {
    let t = await waitReady(9362); const main = t.find(x => x.url.includes('renderer/index.html')); const M = main.webSocketDebuggerUrl;
    const aid = await evalIn(M, 'window.xer.newTab("http://127.0.0.1:9668/")'); await sleep(3500); // newTab returns the id; the new tab is active
    t = await get('http://127.0.0.1:9362/json'); const page = t.find(x => x.url.includes('9668')); const P = page.webSocketDebuggerUrl;

    // 1) A good 3-step plan: nothing runs before Approve.
    await evalIn(M, `actionCard([{type:"type",selector:"#q",text:"hello",label:"Type hello"},{type:"click",selector:"#go",label:"Press Go"},{type:"scroll",direction:"down",label:"Scroll"}], ${aid}, "http://127.0.0.1:9668/")`);
    check('plan card shown for 3 steps', await evalIn(M, '!!document.querySelector(".m.act.plan")'));
    check('plan header counts steps', /3 steps/.test(await evalIn(M, 'document.querySelector(".m.act.plan b").textContent')));
    check('three numbered rows, all waiting', (await evalIn(M, 'document.querySelectorAll(".m.act.plan .planstep").length')) === 3 && (await evalIn(M, '[...document.querySelectorAll(".m.act.plan .planstep i")].every(i => i.textContent === "waiting")')));
    check('nothing ran before approval', (await evalIn(P, 'document.getElementById("out").textContent')) === '');
    check('same-site plan shows no warning', !(await evalIn(M, '!!document.querySelector(".m.act.plan .planwarn")')));
    await evalIn(M, 'document.querySelector(".m.act.plan button.approve").click()'); await sleep(2500);
    check('one Approve ran every step in order (typed then clicked)', (await evalIn(P, 'document.getElementById("out").textContent')) === 'sent:hello');
    check('rows show done', (await evalIn(M, '[...document.querySelectorAll(".m.act.plan .planstep i")].map(i => i.textContent).join()')) === 'done,done,done');
    check('summary says plan finished', /all 3 steps done/.test(await evalIn(M, 'document.querySelector(".m.act.plan .actrow:last-child i").textContent')));

    // 2) A plan whose middle step fails halts and skips the rest.
    await evalIn(P, 'document.getElementById("out").textContent=""; document.getElementById("q").value=""');
    await evalIn(M, 'document.querySelectorAll(".m.act").forEach(e => e.remove())');
    await evalIn(M, `actionCard([{type:"type",selector:"#q",text:"first",label:"Type first"},{type:"click",selector:"#nope",label:"Click missing"},{type:"click",selector:"#go",label:"Press Go"}], ${aid}, "http://127.0.0.1:9668/")`);
    await evalIn(M, 'document.querySelector(".m.act.plan button.approve").click()'); await sleep(2500);
    const rows = await evalIn(M, '[...document.querySelectorAll(".m.act.plan .planstep i")].map(i => i.textContent).join("|")');
    check('failing step marked failed with reason', /^done\|failed: element not found\|skipped$/.test(rows));
    check('step after the failure never ran', (await evalIn(P, 'document.getElementById("out").textContent')) === '');
    check('summary names the failing step', /stopped at step 2/.test(await evalIn(M, 'document.querySelector(".m.act.plan .actrow:last-child i").textContent')));

    // 3) Deny runs nothing. (Step 2 legitimately typed "first" before its failure, so reset the page first.)
    await evalIn(P, 'document.getElementById("out").textContent=""; document.getElementById("q").value=""');
    await evalIn(M, 'document.querySelectorAll(".m.act").forEach(e => e.remove())');
    await evalIn(M, `actionCard([{type:"type",selector:"#q",text:"nope",label:"a"},{type:"click",selector:"#go",label:"b"}], ${aid}, "http://127.0.0.1:9668/")`);
    await evalIn(M, '[...document.querySelectorAll(".m.act.plan .actrow button")].find(b => b.textContent === "Deny").click()'); await sleep(500);
    check('Deny leaves the page untouched', (await evalIn(P, 'document.getElementById("q").value')) === '' && (await evalIn(P, 'document.getElementById("out").textContent')) === '');

    // 4) A plan that leaves the site warns before approval.
    await evalIn(M, 'document.querySelectorAll(".m.act").forEach(e => e.remove())');
    await evalIn(M, `actionCard([{type:"navigate",url:"https://other.example/x",label:"Go"},{type:"click",selector:"#go",label:"b"}], ${aid}, "http://127.0.0.1:9668/")`);
    check('cross-site plan shows a warning', /leaves the current site/.test(await evalIn(M, '(document.querySelector(".m.act.plan .planwarn")||{}).textContent || ""')));

    // 5) Stop halts a running plan. Use slow settle (navigate) so there is time to press Stop.
    await evalIn(M, 'document.querySelectorAll(".m.act").forEach(e => e.remove())');
    await evalIn(P, 'document.getElementById("out").textContent=""');
    await evalIn(M, `actionCard([{type:"navigate",url:"http://127.0.0.1:9668/?a",label:"reload"},{type:"scroll",direction:"down",label:"s1"},{type:"scroll",direction:"down",label:"s2"}], ${aid}, "http://127.0.0.1:9668/")`);
    await evalIn(M, 'document.querySelector(".m.act.plan button.approve").click()'); await sleep(300);
    await evalIn(M, '[...document.querySelectorAll(".m.act.plan .actrow button")].find(b => b.textContent === "Stop").click()'); await sleep(3000);
    check('Stop ends the plan early', /Stopped after \d of 3/.test(await evalIn(M, 'document.querySelector(".m.act.plan .actrow:last-child i").textContent')));

    // 6) A single action still uses the simple card, not a plan.
    await evalIn(M, 'document.querySelectorAll(".m.act").forEach(e => e.remove())');
    await evalIn(M, `actionCard([{type:"scroll",direction:"down",label:"one"}], ${aid}, "")`);
    check('single action keeps the simple card', (await evalIn(M, '!!document.querySelector(".m.act") && !document.querySelector(".m.act.plan")')));
  } catch (e) { console.log('FAIL exception: ' + e.message); ok = false; }
  killp(p); site.close(); setTimeout(() => process.exit(ok ? 0 : 1), 500);
})();
