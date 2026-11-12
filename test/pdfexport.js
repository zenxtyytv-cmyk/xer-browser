// Unit tests for Save-as-PDF helpers (pure logic). Run: node test/pdfexport.js
const { safeName, canPrint, pdfOptions, looksLikePdf, uniquePath } = require('../src/main/pdfexport');
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };

check('title becomes file name', safeName('My Article', 'https://a.com/') === 'My Article.pdf');
check('unsafe characters removed', safeName('a/b\\c:d*e?f"g<h>i|j', 'https://a.com') === 'a b c d e f g h i j.pdf');
check('control chars and newlines removed', safeName('Hello\nWorld\t!\u0000', '') === 'Hello World !.pdf');
check('empty title falls back to host', safeName('', 'https://news.example.com/x') === 'news.example.com.pdf');
check('no title and no url falls back to page', safeName('', '') === 'page.pdf' && safeName(null, undefined) === 'page.pdf');
check('leading dots cannot make hidden files', safeName('...secret', '') === 'secret.pdf' && safeName('..', '') === 'page.pdf');
check('trailing dots and spaces trimmed', safeName('Report.  ', '') === 'Report.pdf');
check('path traversal is neutralised', !/[\\/]/.test(safeName('../../etc/passwd', '')) && safeName('../../etc/passwd', '').endsWith('.pdf'));
check('Windows reserved names avoided', safeName('CON', '') === 'page.pdf' && safeName('lpt1', '') === 'page.pdf' && safeName('console', '') === 'console.pdf');
check('long titles are cut', safeName('x'.repeat(500), '').length <= 84);
check('unicode titles kept', safeName('日本語 ページ', '') === '日本語 ページ.pdf');

check('http and https pages can be printed', canPrint('https://a.com') && canPrint('http://localhost:3000'));
check('reader pages can be printed', canPrint('data:text/html;charset=utf-8,%3Ch1%3E'));
check('internal and odd pages cannot', !canPrint('file:///app/newtab.html') && !canPrint('about:blank') && !canPrint('') && !canPrint(null) && !canPrint('javascript:1') && !canPrint('data:image/png;base64,AA'));

const o = pdfOptions();
check('backgrounds are printed', o.printBackground === true && o.preferCSSPageSize === true);
check('options are a fresh object each time', pdfOptions() !== pdfOptions());

const good = Buffer.from('%PDF-1.4\n' + 'x'.repeat(100) + '\n%%EOF\n');
check('real PDF bytes recognised', looksLikePdf(good));
check('html is not a PDF', !looksLikePdf(Buffer.from('<html>' + 'x'.repeat(100) + '</html>')));
check('truncated PDF rejected', !looksLikePdf(Buffer.from('%PDF-1.4\n' + 'x'.repeat(100))));
check('empty or null rejected', !looksLikePdf(Buffer.alloc(0)) && !looksLikePdf(null) && !looksLikePdf(undefined));

const taken = new Set(['/d/a.pdf', '/d/a (1).pdf']);
check('unused name kept', uniquePath('/d', 'b.pdf', p => taken.has(p)) === '/d/b.pdf');
check('existing file gets a number', uniquePath('/d', 'a.pdf', p => taken.has(p)) === '/d/a (2).pdf');
check('never loops forever', uniquePath('/d', 'z.pdf', () => true).endsWith('.pdf'));
process.exit(ok ? 0 : 1);
