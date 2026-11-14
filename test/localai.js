// Tests for local AI (Ollama) streaming + hardening. Pure parser tests plus a live fake Ollama server.
// Run: xvfb-run -a npx electron test/localai.js --no-sandbox --disable-gpu
const http = require('http');
const Module = require('module');
let ok = true; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
const line = (o) => JSON.stringify(o) + '\n';

// localai.js requires ./store which needs electron; stub it so this runs under plain node.
const origLoad = Module._load;
Module._load = function (req, parent, ...r) { return /(^|\/)store$/.test(req) ? { load: () => ({}), save() {} } : origLoad.call(this, req, parent, ...r); };
const L = require('../src/main/localai');

// ---- parser ----
let p = L.createStreamParser();
check('whole lines parse', p.feed(line({ message: { content: 'Hel' } }) + line({ message: { content: 'lo' } })) === 'Hello');
p = L.createStreamParser();
const full = line({ message: { content: 'abc' } }) + line({ message: { content: 'def' }, done: true });
let got = ''; for (const ch of full) got += p.feed(ch);   // one character at a time
check('lines split across chunks reassemble', got === 'abcdef' && p.done);
p = L.createStreamParser();
check('last line without newline is read by end()', p.feed(JSON.stringify({ message: { content: 'x' } })) === '' && p.end() === 'x');
p = L.createStreamParser();
check('garbage lines are skipped', p.feed('not json\n' + line({ message: { content: 'ok' } })) === 'ok');
p = L.createStreamParser(); p.feed(line({ error: 'model not found' }));
check('error lines are reported', p.error === 'model not found');
p = L.createStreamParser();
check('non-string content ignored', p.feed(line({ message: { content: 5 } }) + line({ message: {} })) === '');

// ---- history trimming ----
const many = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i }));
check('history capped to last 20', L.trimMessages(many).length === 20 && L.trimMessages(many).pop().content === 'm49');
check('bad turns dropped, extra keys stripped', JSON.stringify(L.trimMessages([null, { role: 'system', content: 'x' }, { role: 'user', content: 5 }, { role: 'user', content: 'hi', evil: 1 }])) === '[{"role":"user","content":"hi"}]');
check('non-array history is empty', L.trimMessages(undefined).length === 0 && L.trimMessages('x').length === 0);

// ---- live fake Ollama ----
(async () => {
  let lastBody = null, mode = 'stream';
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      if (req.url === '/api/tags') { res.writeHead(mode === 'tags500' ? 500 : 200); return res.end(mode === 'tags500' ? 'oops' : JSON.stringify({ models: [{ name: 'llama3.2' }] })); }
      lastBody = JSON.parse(b || '{}');
      if (mode === 'err') { res.writeHead(404, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'model "nope" not found' })); }
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      const s = line({ message: { content: 'Hi ' } }) + line({ message: { content: 'there' } }) + line({ message: { content: '' }, done: true });
      const cut = s.indexOf('\n') + 1 + 15;   // first line whole, second line split mid-way
      res.write(s.slice(0, cut)); setTimeout(() => { res.end(s.slice(cut)); }, 60);
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  L.set({ provider: 'local', ollamaUrl: 'http://127.0.0.1:' + srv.address().port, model: 'llama3.2' });
  const toks = [];
  const text = await L.ask({ messages: many, system: 'sys', onToken: t => toks.push(t) });
  check('streamed reply is assembled', text === 'Hi there');
  check('onToken receives pieces (more than one)', toks.length >= 2 && toks.join('') === 'Hi there');
  check('request asks for streaming with system + capped history', lastBody.stream === true && lastBody.messages.length === 21 && lastBody.messages[0].role === 'system');
  mode = 'err';
  let msg = ''; try { await L.ask({ messages: [{ role: 'user', content: 'x' }], system: '' }); } catch (e) { msg = e.message; }
  check('server error message is surfaced', msg === 'model "nope" not found');
  mode = 'tags500';
  let tmsg = ''; try { await L.models(); } catch (e) { tmsg = e.message; }
  check('models() rejects on HTTP errors', /500/.test(tmsg));
  mode = 'stream';
  check('models() lists models', (await L.models())[0] === 'llama3.2');
  srv.close();
  L.set({ ollamaUrl: 'http://127.0.0.1:1' });
  let cmsg = ''; try { await L.ask({ messages: [], system: '' }); } catch (e) { cmsg = e.message; }
  check('unreachable Ollama gives a clear error (no hang)', /Cannot reach Ollama/.test(cmsg));
  L.set({ model: '' });
  let nmsg = ''; try { await L.ask({ messages: [], system: '' }); } catch (e) { nmsg = e.message; }
  check('no model chosen gives a clear error', /Pick a local model/.test(nmsg));
  console.log(ok ? 'LOCALAI PASSED' : 'LOCALAI FAILED'); process.exit(ok ? 0 : 1);
})();
