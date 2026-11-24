// Unit tests for the page context-menu builder (pure logic, no Electron).
const { build, searchLabel, webLink } = require('../src/main/contextmenu');
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } }
const ids = (items) => items.filter(i => i.id).map(i => i.id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('plain page shows navigation items', same(ids(build({})), ['back', 'forward', 'reload', 'inspect']));
check('missing params are safe', same(ids(build()), ['back', 'forward', 'reload', 'inspect']));
check('back/forward disabled without history', build({}).find(i => i.id === 'back').enabled === false && build({}).find(i => i.id === 'forward').enabled === false);
check('back/forward enabled with history', build({ canBack: true, canFwd: true }).find(i => i.id === 'back').enabled === true);
check('link menu opens with open + copy', same(ids(build({ linkURL: 'https://a.com/x' })).slice(0, 2), ['open-link', 'copy-link']));
check('link url is carried on both link items', build({ linkURL: 'https://a.com/x' })[0].link === 'https://a.com/x' && build({ linkURL: 'https://a.com/x' })[1].link === 'https://a.com/x');
check('link section is separated from navigation', build({ linkURL: 'https://a.com/x' })[2].type === 'separator');
check('javascript: link is never offered', !ids(build({ linkURL: 'javascript:alert(1)' })).includes('open-link') && !ids(build({ linkURL: 'javascript:alert(1)' })).includes('copy-link'));
check('mailto: link is not opened or copied', !ids(build({ linkURL: 'mailto:a@b.c' })).includes('open-link'));
check('selection adds copy + search', ids(build({ selectionText: 'hello world' })).includes('copy') && ids(build({ selectionText: 'hello world' })).includes('search'));
check('search item keeps the full query', build({ selectionText: 'a'.repeat(60) }).find(i => i.id === 'search').query.length === 60);
check('search label truncates long text', searchLabel('a'.repeat(60)).includes('…') && searchLabel('hi') === 'Search DuckDuckGo for “hi”');
check('whitespace-only selection is ignored', !ids(build({ selectionText: '   ' })).includes('search'));
check('image gets copy image address', ids(build({ mediaType: 'image', srcURL: 'https://a.com/i.png' })).includes('copy-image'));
check('non-web image src is dropped', !ids(build({ mediaType: 'image', srcURL: 'data:image/png;base64,xx' })).includes('copy-image'));
check('text field gets clipboard actions only', same(ids(build({ isEditable: true })), ['cut', 'copy', 'paste', 'select-all']));
check('editable wins over link and selection', same(ids(build({ isEditable: true, linkURL: 'https://a.com', selectionText: 'x' })), ['cut', 'copy', 'paste', 'select-all']));
check('link + selection + image all appear', same(ids(build({ linkURL: 'https://a.com', selectionText: 'hi', mediaType: 'image', srcURL: 'https://a.com/i.png' })), ['open-link', 'copy-link', 'copy-image', 'copy', 'search', 'back', 'forward', 'reload', 'inspect']));
check('menu always ends with inspect element', ids(build({ linkURL: 'https://a.com' })).pop() === 'inspect');
check('webLink accepts only http(s)', webLink('https://a.com') === 'https://a.com' && webLink('ftp://a.com') === null && webLink('') === null && webLink(null) === null);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
