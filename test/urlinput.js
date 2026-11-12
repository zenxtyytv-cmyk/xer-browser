// Unit tests for address-bar input handling (pure logic, no Electron).
const { normalize, SEARCH } = require('../src/main/urlinput');
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } }
const q = s => SEARCH + encodeURIComponent(s);

check('empty input does nothing', normalize('') === null && normalize('   ') === null && normalize(null) === null && normalize(undefined) === null);
check('plain domain gets https', normalize('example.com') === 'https://example.com');
check('domain with path and query', normalize('example.com/a/b?x=1#y') === 'https://example.com/a/b?x=1#y');
check('domain with port', normalize('example.com:8443/x') === 'https://example.com:8443/x');
check('http is upgraded to https', normalize('http://example.com/x') === 'https://example.com/x');
check('HTTP in capitals is upgraded', normalize('HTTP://example.com') === 'https://example.com');
check('https is left alone', normalize('https://example.com/a b'.replace(' ', '%20')) === 'https://example.com/a%20b');
check('localhost http is kept', normalize('http://localhost:3000/x') === 'http://localhost:3000/x');
check('bare localhost:port uses http', normalize('localhost:3000') === 'http://localhost:3000');
check('bare 127.0.0.1 uses http', normalize('127.0.0.1:8080/x') === 'http://127.0.0.1:8080/x');
check('LAN IP gets https', normalize('192.168.1.1:8080') === 'https://192.168.1.1:8080');
check('word starting with localhost is a search', normalize('localhostfoo') === q('localhostfoo'));
check('text with a space is a search', normalize('localhost bar') === q('localhost bar'));
check('domain-looking text with a space is a search', normalize('example.com/a b') === q('example.com/a b'));
check('plain words are a search', normalize('best pizza near me') === q('best pizza near me'));
check('single word is a search', normalize('pizza') === q('pizza'));
check('search text is encoded', normalize('a&b=c d') === q('a&b=c d'));
check('javascript: never navigates', normalize('javascript:alert(1)') === q('javascript:alert(1)'));
check('JaVaScRiPt: with caps never navigates', normalize('JaVaScRiPt:alert(1)').startsWith(SEARCH));
check('data: never navigates', normalize('data:text/html,<h1>x</h1>').startsWith(SEARCH));
check('vbscript: and blob: never navigate', normalize('vbscript:x').startsWith(SEARCH) && normalize('blob:https://a/b').startsWith(SEARCH));
check('about:blank is allowed', normalize('about:blank') === 'about:blank');
check('other about: pages are a search', normalize('about:config').startsWith(SEARCH));
check('file: URLs still work', normalize('file:///tmp/a.html') === 'file:///tmp/a.html');
check('surrounding spaces are trimmed', normalize('  example.com  ') === 'https://example.com');
check('result is never an http URL except local', ['a.com', 'http://a.com', 'x y'].every(s => !/^http:/.test(normalize(s))));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
