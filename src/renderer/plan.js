// Multi-step action plans. Pure logic (no Electron, works in Node and in the sidebar page): runs approved actions in order, stops at the first
// failure or when the user presses Stop, and reports progress after every step. Safety rules stay in actions.js:
// every action is re-validated in the main process, and the plan only ever starts from an explicit click.
const MAX_STEPS = 8;
const SETTLE_MS = { navigate: 1200, click: 600, type: 150, scroll: 150 }; // pause after a step so the page can react

// Run `steps` with `exec(step) -> {ok, error?}`. Options: shouldStop(), onProgress(i, state, info), sleep(ms).
// States: running, done, failed, skipped (never reached). Returns {ok, completed, failedAt?, stopped?, error?}.
async function runPlan(steps, exec, { shouldStop = () => false, onProgress = () => {}, sleep = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
  const list = Array.isArray(steps) ? steps.slice(0, MAX_STEPS) : [];
  let completed = 0;
  for (let i = 0; i < list.length; i++) {
    if (shouldStop()) { for (let j = i; j < list.length; j++) onProgress(j, 'skipped'); return { ok: false, stopped: true, completed }; }
    onProgress(i, 'running');
    let r;
    try { r = await exec(list[i]); } catch (e) { r = { ok: false, error: e && e.message ? e.message : 'step crashed' }; }
    if (!r || !r.ok) {
      onProgress(i, 'failed', (r && r.error) || 'unknown error');
      for (let j = i + 1; j < list.length; j++) onProgress(j, 'skipped');
      return { ok: false, completed, failedAt: i, error: (r && r.error) || 'unknown error' };
    }
    completed++; onProgress(i, 'done');
    if (i < list.length - 1) await sleep(SETTLE_MS[list[i].type] || 200);
  }
  return { ok: true, completed };
}

// Short plain-English summary of a plan for the approval card header.
function describe(steps) {
  const n = Array.isArray(steps) ? steps.length : 0;
  if (!n) return 'No steps';
  const hosts = new Set(); let types = new Set();
  for (const s of steps) { types.add(s.type); if (s.type === 'navigate') { try { hosts.add(new URL(s.url).host); } catch {} } }
  return n + (n === 1 ? ' step' : ' steps') + (hosts.size ? ' (opens ' + [...hosts].slice(0, 3).join(', ') + ')' : '');
}

// A plan that leaves the current site deserves an extra warning, so the user sees it before approving.
function leavesSite(steps, currentUrl) {
  let cur = ''; try { cur = new URL(currentUrl).host; } catch {}
  return (Array.isArray(steps) ? steps : []).some(s => { if (s.type !== 'navigate') return false; try { return new URL(s.url).host !== cur; } catch { return true; } });
}

const Plan = { runPlan, describe, leavesSite, MAX_STEPS, SETTLE_MS }; // global in the sidebar page
if (typeof module !== 'undefined') module.exports = Plan;
