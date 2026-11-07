// Tab order: the user-controlled base order of tabs (drag-and-drop reordering).
// Pure logic with no Electron dependency so it can be unit tested.
// Pins and groups are layered on top of this order by main.js (pinned first, group
// members adjacent), so this class only decides relative position.
class TabOrder {
  constructor() { this.ids = []; }

  // Append a new tab at the end (no-op if already present).
  add(id) { if (!this.ids.includes(id)) this.ids.push(id); }

  // Insert right after another tab (used for duplicates and links opened from a tab).
  addAfter(id, afterId) {
    if (this.ids.includes(id)) return;
    const i = this.ids.indexOf(afterId);
    if (i < 0) this.ids.push(id); else this.ids.splice(i + 1, 0, id);
  }

  remove(id) { const i = this.ids.indexOf(id); if (i >= 0) this.ids.splice(i, 1); }

  // Keep only known ids, and append any known id not yet tracked.
  sync(knownIds) {
    const known = new Set(knownIds);
    this.ids = this.ids.filter(i => known.has(i));
    for (const k of knownIds) if (!this.ids.includes(k)) this.ids.push(k);
  }

  // Move `id` so it sits immediately before (`after=false`) or after (`after=true`) `targetId`.
  // Returns true if the order changed.
  move(id, targetId, after = false) {
    if (id === targetId) return false;
    const from = this.ids.indexOf(id);
    if (from < 0 || !this.ids.includes(targetId)) return false;
    const before = this.ids.join();
    this.ids.splice(from, 1);
    const t = this.ids.indexOf(targetId);
    this.ids.splice(after ? t + 1 : t, 0, id);
    return this.ids.join() !== before;
  }

  // Order an arbitrary list of ids by this base order. Unknown ids go last, in input order.
  order(ids) {
    const rank = new Map(this.ids.map((id, i) => [id, i]));
    return [...ids].map((id, i) => [id, i]).sort((a, b) => {
      const ra = rank.has(a[0]) ? rank.get(a[0]) : Infinity, rb = rank.has(b[0]) ? rank.get(b[0]) : Infinity;
      return ra === rb ? a[1] - b[1] : ra - rb;
    }).map(x => x[0]);
  }
}
module.exports = { TabOrder };
