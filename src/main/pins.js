// Pinned-tab state and ordering. Pinned tabs always sort first in the tab bar,
// keeping their relative (insertion) order within each group.
class PinState {
  constructor() { this.pinned = new Set(); }

  is(id) { return this.pinned.has(id); }

  // Toggle pin state for a tab id. Returns the new state.
  toggle(id) {
    if (this.pinned.has(id)) { this.pinned.delete(id); return false; }
    this.pinned.add(id); return true;
  }

  unpin(id) { this.pinned.delete(id); }

  // Stable ordering: pinned ids first, then the rest, both preserving input order.
  order(ids) {
    return [...ids].sort((a, b) => Number(this.is(b)) - Number(this.is(a)));
  }

  // Drop ids that no longer exist (e.g. closed tabs) from the pin set.
  prune(knownIds) {
    const known = new Set(knownIds);
    for (const id of this.pinned) if (!known.has(id)) this.pinned.delete(id);
  }
}
module.exports = { PinState };
