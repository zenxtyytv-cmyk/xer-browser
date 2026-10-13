// Customizable new-tab dashboard: widgets, theme, layout. Stored locally.
const store = require('./store');
const DEFAULT = {
  theme: { accent: '#7c5cff', bg: '#0b0b10', card: '#14141c', text: '#e8e8f0', radius: 14, wallpaper: '' },
  widgets: [
    { id: 'w1', type: 'clock', size: 'm' },
    { id: 'w2', type: 'search', size: 'l' },
    { id: 'w3', type: 'quicklinks', size: 'l', links: [
      { t: 'GitHub', u: 'https://github.com' }, { t: 'Wikipedia', u: 'https://wikipedia.org' },
      { t: 'Hacker News', u: 'https://news.ycombinator.com' }, { t: 'Reddit', u: 'https://reddit.com' } ] },
    { id: 'w4', type: 'notes', size: 'm', text: '' },
    { id: 'w5', type: 'todo', size: 'm', items: [] },
    { id: 'w6', type: 'stats', size: 's' }
  ]
};
let state = DEFAULT;
const init = () => { const s = store.load('dashboard', null); if (s) state = s; };
const get = () => state;
function set(s) { state = s; store.save('dashboard', state); return state; }
const reset = () => set(JSON.parse(JSON.stringify(DEFAULT)));
module.exports = { init, get, set, reset, DEFAULT };
