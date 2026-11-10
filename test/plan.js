// Multi-step plan runner tests (pure, no Electron).
const { runPlan, describe, leavesSite, MAX_STEPS, SETTLE_MS } = require('../src/renderer/plan');
let bad = 0; const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) { bad++; process.exitCode = 1; } };
const noSleep = () => Promise.resolve();
const steps = (...t) => t.map((type, i) => ({ type, label: 's' + i, url: 'https://a.com/' + i, selector: '#x' }));
(async () => {
  let log = [];
  let r = await runPlan(steps('click', 'type', 'scroll'), async s => { log.push(s.label); return { ok: true }; }, { sleep: noSleep });
  check('all steps run in order', r.ok && r.completed === 3 && log.join() === 's0,s1,s2');

  log = []; const prog = [];
  r = await runPlan(steps('click', 'type', 'scroll'), async s => { log.push(s.label); return s.label === 's1' ? { ok: false, error: 'element not found' } : { ok: true }; }, { sleep: noSleep, onProgress: (i, st, info) => prog.push(i + ':' + st + (info ? ':' + info : '')) });
  check('stops at first failure', !r.ok && r.failedAt === 1 && r.completed === 1 && log.join() === 's0,s1');
  check('failure carries the reason', r.error === 'element not found');
  check('later steps reported as skipped', prog.includes('2:skipped') && !prog.includes('2:running'));
  check('progress order is running then done/failed', prog.join('|') === '0:running|0:done|1:running|1:failed:element not found|2:skipped');

  log = []; let n = 0;
  r = await runPlan(steps('click', 'click', 'click', 'click'), async s => { log.push(s.label); n++; return { ok: true }; }, { sleep: noSleep, shouldStop: () => n >= 2 });
  check('Stop halts before the next step', r.stopped === true && r.completed === 2 && log.length === 2);

  r = await runPlan(steps('click'), async () => { throw new Error('boom'); }, { sleep: noSleep });
  check('a throwing step becomes a failure, not a crash', !r.ok && r.error === 'boom' && r.failedAt === 0);

  r = await runPlan(steps('click'), async () => undefined, { sleep: noSleep });
  check('an empty result counts as failure', !r.ok && r.error === 'unknown error');

  r = await runPlan(Array.from({ length: 20 }, (_, i) => ({ type: 'scroll', label: 'x' + i })), async () => ({ ok: true }), { sleep: noSleep });
  check('plan capped at ' + MAX_STEPS + ' steps', r.completed === MAX_STEPS);

  r = await runPlan([], async () => ({ ok: true }), { sleep: noSleep });
  check('empty plan succeeds with zero steps', r.ok && r.completed === 0);
  r = await runPlan(null, async () => ({ ok: true }), { sleep: noSleep });
  check('non-array plan is safe', r.ok && r.completed === 0);

  const waits = []; await runPlan(steps('navigate', 'click', 'type'), async () => ({ ok: true }), { sleep: ms => { waits.push(ms); return Promise.resolve(); } });
  check('waits after navigate and click, not after the last step', waits.length === 2 && waits[0] === SETTLE_MS.navigate && waits[1] === SETTLE_MS.click);

  check('describe: step count', describe(steps('click', 'type')) === '2 steps' && describe(steps('click')) === '1 step' && describe([]) === 'No steps');
  check('describe: lists destination hosts', /opens a\.com/.test(describe(steps('navigate', 'click'))));
  check('leavesSite: different host is flagged', leavesSite([{ type: 'navigate', url: 'https://evil.com/x' }], 'https://shop.com/cart') === true);
  check('leavesSite: same host is not flagged', leavesSite([{ type: 'navigate', url: 'https://shop.com/pay' }, { type: 'click' }], 'https://shop.com/cart') === false);
  check('leavesSite: no navigate means no warning', leavesSite(steps('click', 'type'), 'https://shop.com') === false);
  check('leavesSite: bad current URL is treated as leaving', leavesSite([{ type: 'navigate', url: 'https://a.com' }], 'not a url') === true);
  process.exit(bad ? 1 : 0);
})();
