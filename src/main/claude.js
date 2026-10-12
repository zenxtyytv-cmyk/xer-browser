// Claude integration. The API key is stored encrypted with the OS keychain.
const { safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');

const keyFile = () => path.join(app.getPath('userData'), 'claude.key');
const MODEL = 'claude-sonnet-4-5';

function saveKey(key) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption unavailable');
  fs.writeFileSync(keyFile(), safeStorage.encryptString(key));
}
function loadKey() {
  try { return safeStorage.decryptString(fs.readFileSync(keyFile())); }
  catch { return null; }
}
function hasKey() { return !!loadKey(); }

async function ask({ messages, pageContext }) {
  const key = loadKey();
  if (!key) throw new Error('No API key set. Open Claude settings and add your Anthropic key.');
  const system =
    'You are Claude, the built-in assistant of Xer Browser. Be concise and helpful.' +
    (pageContext ? `\n\nCurrent page:\nTitle: ${pageContext.title}\nURL: ${pageContext.url}\nText (truncated):\n${pageContext.text}` : '');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, messages })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data.content.map(b => b.text || '').join('');
}
module.exports = { saveKey, hasKey, ask };
