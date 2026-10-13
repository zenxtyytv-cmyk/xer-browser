// Safe arithmetic parser (shunting-yard style recursive descent). No eval/Function.
function calc(src) {
  const t = src.replace(/\s+/g, '').replace(/\*\*/g, '^').match(/\d+\.?\d*|\.\d+|[-+*/%^()]/g);
  if (!t || t.join('') !== src.replace(/\s+/g, '').replace(/\*\*/g, '^')) throw new Error('bad');
  let i = 0;
  const peek = () => t[i], next = () => t[i++];
  function prim() {
    const x = next();
    if (x === '(') { const v = add(); if (next() !== ')') throw new Error('paren'); return v; }
    if (x === '-') return -prim();
    if (x === '+') return prim();
    const n = parseFloat(x); if (Number.isNaN(n)) throw new Error('num'); return n;
  }
  function pow() { let b = prim(); if (peek() === '^') { next(); b = Math.pow(b, pow()); } return b; }
  function mul() { let v = pow(); while (['*', '/', '%'].includes(peek())) { const o = next(), r = pow(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
  function add() { let v = mul(); while (['+', '-'].includes(peek())) { const o = next(), r = mul(); v = o === '+' ? v + r : v - r; } return v; }
  const out = add(); if (i < t.length) throw new Error('trail'); return out;
}
if (typeof module !== 'undefined') module.exports = { calc };
