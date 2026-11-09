// Split view unit tests (plain node): state transitions and pane geometry.
// Run: node test/split.js
const { SplitState, MIN, MAX, GAP } = require('../src/main/split');
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };

const s = new SplitState();
check('starts inactive', !s.active && s.partner(1) === null && s.focusedId() === null);
check('cannot split a tab with itself', s.open(1, 1) === false && !s.active);
check('cannot split with a missing tab', s.open(1, null) === false && s.open(undefined, 2) === false && !s.active);
check('open activates and defaults', s.open(1, 2) && s.active && s.ratio === 0.5 && s.focusedId() === 1);
check('has / partner', s.has(1) && s.has(2) && !s.has(3) && s.partner(1) === 2 && s.partner(2) === 1 && s.partner(3) === null);
check('setFocus switches pane', s.setFocus(2) && s.focusedId() === 2 && s.setFocus(1) && s.focusedId() === 1 && !s.setFocus(9));
check('ratio is clamped', s.setRatio(0.01) && s.ratio === MIN && s.setRatio(5) && s.ratio === MAX && s.setRatio(0.6) && s.ratio === 0.6);
check('ratio rejects junk', !s.setRatio('abc') && !s.setRatio(NaN) && !s.setRatio(undefined) && s.ratio === 0.6);
check('swap flips panes and ratio', s.swap() && s.left === 2 && s.right === 1 && Math.abs(s.ratio - 0.4) < 1e-9);

const b = new SplitState(); b.open(1, 2);
const r = b.bounds({ x: 0, y: 84, width: 1004, height: 600 });
check('panes fill the area', r.left.width + r.right.width + GAP === 1004 && r.left.x === 0 && r.right.x === r.left.width + GAP);
check('panes share y and height', r.left.y === 84 && r.right.y === 84 && r.left.height === 600 && r.right.height === 600);
check('even split is even', r.left.width === r.right.width);
b.setRatio(0.25); const r2 = b.bounds({ x: 10, y: 0, width: 808, height: 100 });
check('ratio drives widths, x offset respected', r2.left.x === 10 && r2.left.width === 200 && r2.right.width === 600 && r2.right.x === 10 + 200 + GAP);
check('tiny area never yields negative width', (() => { const t = new SplitState(); t.open(1, 2); const q = t.bounds({ x: 0, y: 0, width: 2, height: 10 }); return q.left.width >= 0 && q.right.width >= 0; })());

const c = new SplitState(); c.open(5, 6);
check('closing one side ends split and returns survivor', c.remove(5) === 6 && !c.active && c.left === null);
check('removing an unrelated tab keeps split', (() => { const d = new SplitState(); d.open(1, 2); return d.remove(9) === null && d.active; })());
check('close() reports whether a split existed', (() => { const d = new SplitState(); const a = d.close(); d.open(1, 2); return a === false && d.close() === true && !d.active; })());
check('pickPartner prefers next, falls back to previous', SplitState.pickPartner(2, [1, 2, 3]) === 3 && SplitState.pickPartner(3, [1, 2, 3]) === 2 && SplitState.pickPartner(1, [1]) === null && SplitState.pickPartner(9, [1, 2]) === null);
check('toJSON only when active', new SplitState().toJSON() === null && (() => { const d = new SplitState(); d.open(1, 2); return JSON.stringify(d) === '{"left":1,"right":2,"ratio":0.5}'; })());

// v1.1: draggable divider math
const A = { x: 0, y: 84, width: 1008, height: 500 };
check('ratioFromX: pointer at the middle gives 0.5', Math.abs(SplitState.ratioFromX(504, A) - 0.5) < 1e-9);
check('ratioFromX: result is clamped to MIN and MAX', SplitState.ratioFromX(-50, A) === MIN && SplitState.ratioFromX(99999, A) === MAX);
check('ratioFromX: area x offset is respected', Math.abs(SplitState.ratioFromX(100 + 4 + 500, { ...A, x: 100, width: 1008 }) - 0.5) < 1e-9);
check('ratioFromX: junk input and tiny areas return null', SplitState.ratioFromX('abc', A) === null && SplitState.ratioFromX(NaN, A) === null && SplitState.ratioFromX(10, null) === null && SplitState.ratioFromX(10, { x: 0, width: GAP }) === null);
check('dragging to x puts the divider under the pointer', (() => { const d = new SplitState(); d.open(1, 2); d.setRatio(SplitState.ratioFromX(300, A)); const v = d.divider(A); return Math.abs((v.x + GAP / 2) - 300) <= 1; })());
check('divider rect sits exactly between the panes', (() => { const d = new SplitState(); d.open(1, 2); const b = d.bounds(A), v = d.divider(A); return v.x === b.left.x + b.left.width && v.x + v.width === b.right.x && v.height === A.height && v.y === A.y; })());

console.log(ok ? 'SPLIT PASSED' : 'SPLIT FAILED'); process.exit(ok ? 0 : 1);
