// Tiny JSON persistence for bookmarks, history, and site permissions.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const file = (n) => path.join(app.getPath('userData'), n + '.json');
function load(name, def) { try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return def; } }
function save(name, data) { try { fs.writeFileSync(file(name), JSON.stringify(data)); } catch {} }
module.exports = { load, save };
