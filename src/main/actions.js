// Claude page actions with user approval.
// The assistant may PROPOSE actions inside a ```xer-actions JSON block. Nothing runs until the
// user approves each action in the sidebar. This module parses/validates proposals (pure, no
// Electron needed) and builds the page-side script for an approved action.
const MAX_ACTIONS = 8;
const TYPES = ['click', 'type', 'navigate', 'scroll'];
const SENSITIVE_RE = /pass(word|wd)?|card|cvv|cvc|ccnum|cc-number|iban|ssn|social.?security|otp|2fa|pin\b/i;

const SYSTEM_ADDENDUM =
  '\n\nPAGE ACTIONS: If (and only if) the user asks you to DO something on the page, you may propose actions. ' +
  'Reply with a short plain explanation, then ONE fenced block:\n```xer-actions\n[{"type":"click","selector":"css","label":"what this does"},' +
  '{"type":"type","selector":"css","text":"value","label":"..."},{"type":"navigate","url":"https://...","label":"..."},' +
  '{"type":"scroll","direction":"down","label":"..."}]\n```\n' +
  'Max 8 actions. The user must approve each one. Never type into password, payment or identity fields. Never propose purchases or sending messages without saying so in the label.';

function parse(text) {
  if (typeof text !== 'string') return { text: '', actions: [] };
  const m = text.match(/```xer-actions\s*([\s\S]*?)```/);
  const clean = text.replace(/```xer-actions[\s\S]*?```/g, '').trim();
  if (!m) return { text: clean, actions: [] };
  let raw; try { raw = JSON.parse(m[1]); } catch { return { text: clean, actions: [] }; }
  if (!Array.isArray(raw)) return { text: clean, actions: [] };
  const actions = [];
  for (const a of raw.slice(0, MAX_ACTIONS)) { const v = validate(a); if (v.ok) actions.push(v.action); }
  return { text: clean, actions };
}

function validate(a) {
  if (!a || typeof a !== 'object' || !TYPES.includes(a.type)) return { ok: false, error: 'unknown action type' };
  const label = String(a.label || '').slice(0, 140);
  if (a.type === 'navigate') {
    let u; try { u = new URL(String(a.url)); } catch { return { ok: false, error: 'bad url' }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'only http(s) allowed' };
    return { ok: true, action: { type: 'navigate', url: u.href, label: label || 'Go to ' + u.host } };
  }
  if (a.type === 'scroll') {
    const d = a.direction === 'up' ? 'up' : a.direction === 'top' ? 'top' : a.direction === 'bottom' ? 'bottom' : 'down';
    return { ok: true, action: { type: 'scroll', direction: d, label: label || 'Scroll ' + d } };
  }
  const sel = String(a.selector || '').trim();
  if (!sel || sel.length > 300) return { ok: false, error: 'bad selector' };
  if (a.type === 'type') {
    const text = String(a.text ?? '').slice(0, 2000);
    if (SENSITIVE_RE.test(sel) || SENSITIVE_RE.test(label)) return { ok: false, error: 'sensitive field blocked' };
    return { ok: true, action: { type: 'type', selector: sel, text, label: label || 'Type into ' + sel } };
  }
  return { ok: true, action: { type: 'click', selector: sel, label: label || 'Click ' + sel } };
}

// Script run inside the page for an approved click/type/scroll. Returns {ok, error?} via JSON.
function pageScript(a) {
  const S = JSON.stringify;
  if (a.type === 'scroll') {
    const body = { up: 'window.scrollBy(0,-innerHeight*0.8)', down: 'window.scrollBy(0,innerHeight*0.8)', top: 'window.scrollTo(0,0)', bottom: 'window.scrollTo(0,document.body.scrollHeight)' }[a.direction];
    return `(()=>{${body};return {ok:true}})()`;
  }
  const guardSensitive = `const sens=/${SENSITIVE_RE.source}/i; const t=(el.type||'').toLowerCase();
    if(t==='password'||sens.test(el.name||'')||sens.test(el.id||'')||sens.test(el.autocomplete||''))return {ok:false,error:'sensitive field blocked'};`;
  if (a.type === 'type') return `(()=>{const el=document.querySelector(${S(a.selector)});if(!el)return {ok:false,error:'element not found'};
    if(!('value' in el))return {ok:false,error:'not a text field'};${guardSensitive}
    el.focus();const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const set=Object.getOwnPropertyDescriptor(proto,'value').set;set.call(el,${S(a.text)});
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return {ok:true}})()`;
  return `(()=>{const el=document.querySelector(${S(a.selector)});if(!el)return {ok:false,error:'element not found'};
    el.scrollIntoView({block:'center'});el.click();return {ok:true}})()`;
}
module.exports = { parse, validate, pageScript, SYSTEM_ADDENDUM, MAX_ACTIONS };
