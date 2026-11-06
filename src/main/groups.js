// Tab groups: named, colored, collapsible sets of tabs (like Chrome/Edge/Zen groups).
// Pure logic with no Electron dependency so it can be unit tested.
// Rules: pinned tabs are never in a group; a group's tabs are kept adjacent in the
// tab bar; the group sits where its first tab sits; empty groups disappear.
const COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

class GroupState {
  constructor() { this.groups = new Map(); this.byTab = new Map(); this.nextId = 1; }

  // Create a group containing the given tab ids. Returns the group id.
  create(tabIds, name = '', color) {
    const gid = this.nextId++;
    this.groups.set(gid, { id: gid, name: String(name).slice(0, 40), color: COLORS.includes(color) ? color : COLORS[(gid - 1) % COLORS.length], collapsed: false });
    for (const t of tabIds) this.assign(t, gid);
    this._gc();
    return gid;
  }

  groupOf(tabId) { return this.byTab.get(tabId) ?? null; }
  get(gid) { return this.groups.get(gid) || null; }

  // Move a tab into an existing group. Returns false if the group does not exist.
  assign(tabId, gid) {
    if (!this.groups.has(gid)) return false;
    this.byTab.set(tabId, gid); this._gc(); return true;
  }

  // Remove a tab from its group (if any).
  remove(tabId) { this.byTab.delete(tabId); this._gc(); }

  rename(gid, name) { const g = this.groups.get(gid); if (!g) return false; g.name = String(name).slice(0, 40); return true; }
  setColor(gid, color) { const g = this.groups.get(gid); if (!g || !COLORS.includes(color)) return false; g.color = color; return true; }
  toggleCollapsed(gid) { const g = this.groups.get(gid); if (!g) return null; g.collapsed = !g.collapsed; return g.collapsed; }

  // Dissolve a group, keeping its tabs open.
  ungroup(gid) {
    for (const [t, g] of [...this.byTab]) if (g === gid) this.byTab.delete(t);
    this.groups.delete(gid);
  }

  members(gid) { return [...this.byTab].filter(([, g]) => g === gid).map(([t]) => t); }

  // Order tab ids so members of a group are adjacent, positioned at the group's first tab.
  // Input order is otherwise preserved. Returns a new array.
  order(ids) {
    const out = [], placed = new Set();
    for (const id of ids) {
      const g = this.groupOf(id);
      if (g == null) { out.push(id); continue; }
      if (placed.has(g)) continue;
      placed.add(g);
      for (const m of ids) if (this.groupOf(m) === g) out.push(m);
    }
    return out;
  }

  // Drop tabs that no longer exist and groups left empty.
  prune(knownIds) {
    const known = new Set(knownIds);
    for (const t of [...this.byTab.keys()]) if (!known.has(t)) this.byTab.delete(t);
    this._gc();
  }

  _gc() {
    const used = new Set(this.byTab.values());
    for (const gid of [...this.groups.keys()]) if (!used.has(gid)) this.groups.delete(gid);
  }

  // Plain snapshot of group metadata for the renderer.
  list() { return [...this.groups.values()].map(g => ({ ...g })); }
}
module.exports = { GroupState, COLORS };
