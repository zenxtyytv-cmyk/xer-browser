const $ = (s) => document.querySelector(s);
const X = window.xerInternal;
const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function drawNet() {
  const s = await X.net.status(); $('#mode').value = s.mode; $('#doh').checked = s.dohOn;
  $('#plist').innerHTML = '';
  s.proxies.forEach(p => {
    const d = document.createElement('div'); d.className = 'px' + (s.active && s.active.id === p.id && s.mode === 'proxy' ? ' on' : '');
    d.innerHTML = '<span>' + esc(p.name) + ' <small style="display:inline">' + esc(p.url) + '</small></span><span></span>';
    const use = document.createElement('button'); use.textContent = 'Use'; use.onclick = async () => { await X.net.mode('proxy', p.id); drawNet(); };
    const del = document.createElement('button'); del.textContent = 'Delete'; del.onclick = async () => { await X.net.remove(p.id); drawNet(); };
    d.lastChild.append(use, ' ', del); $('#plist').append(d);
  });
}
$('#mode').onchange = async (e) => { try { await X.net.mode(e.target.value); $('#perr').textContent = ''; } catch (x) { $('#perr').textContent = x.message; } drawNet(); };
$('#padd').onclick = async () => {
  try { await X.net.add({ name: $('#pn').value, url: $('#pu').value, user: $('#pus').value, pass: $('#ppw').value });
    ['#pn', '#pu', '#pus', '#ppw'].forEach(i => $(i).value = ''); $('#perr').textContent = ''; drawNet(); }
  catch (x) { $('#perr').textContent = x.message.replace(/^Error invoking remote method '[^']+': Error: /, ''); }
};
$('#ipbtn').onclick = async () => { $('#ipout').textContent = 'checking...'; const r = await X.net.ip(); $('#ipout').textContent = r.ok ? 'Exit IP: ' + r.ip : 'Failed: ' + r.error; };
$('#doh').onchange = (e) => X.net.doh(e.target.checked);

async function drawAI() {
  const c = await X.ai.get(); $('#prov').value = c.provider; $('#ourl').value = c.ollamaUrl;
  $('#localbox').style.display = c.provider === 'local' ? '' : 'none';
  if (c.provider === 'local') {
    const r = await X.ai.models();
    $('#omodel').innerHTML = '';
    if (r.ok) { r.models.forEach(m => { const o = document.createElement('option'); o.value = o.textContent = m; $('#omodel').append(o); });
      if (c.model && r.models.includes(c.model)) $('#omodel').value = c.model; else if (r.models[0]) { $('#omodel').value = r.models[0]; X.ai.set({ model: r.models[0] }); }
      $('#aistatus').innerHTML = r.models.length ? '<span class="ok">Ollama connected, ' + r.models.length + ' model(s)</span>' : '<span class="bad">Ollama is running but has no models. Run: ollama pull llama3.2</span>';
    } else $('#aistatus').innerHTML = '<span class="bad">' + esc(r.error) + '</span>';
  } else $('#aistatus').textContent = 'Open the Claude sidebar (Ctrl+J) to add your API key.';
}
$('#prov').onchange = async (e) => { await X.ai.set({ provider: e.target.value }); drawAI(); };
$('#ourl').onchange = async (e) => { await X.ai.set({ ollamaUrl: e.target.value.trim() }); drawAI(); };
$('#omodel').onchange = (e) => X.ai.set({ model: e.target.value });
$('#orefresh').onclick = drawAI;
drawNet(); drawAI();
