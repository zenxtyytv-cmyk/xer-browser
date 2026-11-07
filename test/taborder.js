// Tab order unit tests (plain node). Run: node test/taborder.js
const { TabOrder } = require('../src/main/taborder');
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
const mk = (...ids) => { const o = new TabOrder(); ids.forEach(i => o.add(i)); return o; };

{ const o = mk(1, 2, 3); o.add(2); o.add(4); check('add appends and ignores duplicates', o.ids.join() === '1,2,3,4'); }
{ const o = mk(1, 2, 3); o.addAfter(9, 1); check('addAfter inserts right after target', o.ids.join() === '1,9,2,3');
  o.addAfter(8, 77); check('addAfter with unknown target appends', o.ids.join() === '1,9,2,3,8');
  o.addAfter(9, 3); check('addAfter ignores existing id', o.ids.join() === '1,9,2,3,8'); }
{ const o = mk(1, 2, 3, 4); check('move forward (before target)', o.move(1, 3) && o.ids.join() === '2,1,3,4'); }
{ const o = mk(1, 2, 3, 4); check('move forward (after target)', o.move(1, 3, true) && o.ids.join() === '2,3,1,4'); }
{ const o = mk(1, 2, 3, 4); check('move backward (before target)', o.move(4, 2) && o.ids.join() === '1,4,2,3'); }
{ const o = mk(1, 2, 3, 4); check('move backward (after target)', o.move(4, 1, true) && o.ids.join() === '1,4,2,3'); }
{ const o = mk(1, 2, 3); check('move to end', o.move(1, 3, true) && o.ids.join() === '2,3,1'); }
{ const o = mk(1, 2, 3); check('move to start', o.move(3, 1) && o.ids.join() === '3,1,2'); }
{ const o = mk(1, 2, 3); check('move onto itself is a no-op', o.move(2, 2) === false && o.ids.join() === '1,2,3'); }
{ const o = mk(1, 2, 3); check('move to the position it already holds reports no change', o.move(1, 2, false) === false && o.move(2, 1, true) === false && o.ids.join() === '1,2,3'); }
{ const o = mk(1, 2, 3); check('move with unknown ids is safe', o.move(9, 1) === false && o.move(1, 9) === false && o.ids.join() === '1,2,3'); }
{ const o = mk(1, 2, 3, 4); o.remove(2); o.remove(99); check('remove', o.ids.join() === '1,3,4'); }
{ const o = mk(1, 2, 3); o.sync([3, 1, 5]); check('sync drops unknown, appends new, keeps relative order', o.ids.join() === '1,3,5'); }
{ const o = mk(3, 1, 2); check('order sorts a subset by base order', o.order([1, 2, 3]).join() === '3,1,2' && o.order([2, 3]).join() === '3,2'); }
{ const o = mk(1, 2); check('order puts unknown ids last in input order', o.order([7, 2, 6, 1]).join() === '1,2,7,6'); }
{ const o = mk(1, 2, 3); const i = [3, 2, 1]; o.order(i); check('order does not mutate input', i.join() === '3,2,1'); }
console.log(ok ? 'ALL PASSED' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
