const { suggest } = require('../src/main/suggest');
let f = 0; const ck = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) f++; };
const hist = [
  { title: 'Random blog about github tips', url: 'https://blog.example.com/github-tips' },
  { title: 'GitHub', url: 'https://github.com/' },
  { title: 'Old page', url: 'https://example.org/old' },
  { title: 'Evil <script>alert(1)</script>', url: 'https://x.test/<b>' },
  { title: 'Nope', url: 'javascript:alert(1)' },
  { title: 'File', url: 'file:///etc/passwd' },
];
const bms = [{ title: 'My GH notes', url: 'https://github.com/me/notes' }];
let r = suggest('git', hist, bms);
ck('host-prefix beats title-contains', r[0].url.includes('github.com'));
ck('bookmark on same host is boosted above plain history', r.findIndex(x => x.src === 'bookmark') < r.findIndex(x => x.url.includes('blog.example')));
ck('blog result still returned but last', r[r.length - 1].url.includes('blog.example'));
ck('no javascript: / file: urls ever suggested', !suggest('a', hist, bms).concat(suggest('passwd', hist, bms), suggest('alert', hist, bms)).some(x => !/^https?:/.test(x.url)));
ck('empty query returns nothing', suggest('', hist, bms).length === 0 && suggest('   ', hist, bms).length === 0);
ck('no match returns nothing', suggest('zzzzqq', hist, bms).length === 0);
ck('dedupes same url', suggest('github.com', [{ title: 'a', url: 'https://github.com/' }, { title: 'b', url: 'https://github.com/' }], []).length === 1);
ck('case-insensitive', suggest('GITHUB', hist, bms).length >= 2);
ck('limit respected', suggest('e', Array.from({ length: 50 }, (_, i) => ({ title: 'e' + i, url: 'https://e' + i + '.com' })), [], 8).length === 8);
ck('handles null/undefined lists', suggest('x', null, undefined).length === 0);
ck('www. stripped for host match', suggest('example', [{ title: 't', url: 'https://www.example.com/' }], [])[0].url === 'https://www.example.com/');
console.log(f ? f + ' FAILED' : 'ALL PASSED'); process.exit(f ? 1 : 0);
