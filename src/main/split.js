// Split view: show two tabs side by side. Pure state + geometry, no Electron deps, so it is unit-testable.
const MIN = 0.2, MAX = 0.8, GAP = 8; // GAP is the draggable divider strip between the panes

class SplitState {
  constructor() { this.left = null; this.right = null; this.ratio = 0.5; this.focus = 'left'; }
  get active() { return this.left != null && this.right != null; }
  has(id) { return this.active && (id === this.left || id === this.right); }
  partner(id) { return !this.active ? null : id === this.left ? this.right : id === this.right ? this.left : null; }
  // Start a split. Both ids must differ; ratio resets to an even split.
  open(leftId, rightId) {
    if (leftId == null || rightId == null || leftId === rightId) return false;
    this.left = leftId; this.right = rightId; this.ratio = 0.5; this.focus = 'left'; return true;
  }
  close() { const was = this.active; this.left = this.right = null; this.ratio = 0.5; this.focus = 'left'; return was; }
  // Drop the split when either side's tab is closed. Returns the surviving id (or null).
  remove(id) {
    if (!this.has(id)) return null;
    const keep = this.partner(id); this.close(); return keep;
  }
  setRatio(r) { r = Number(r); if (!Number.isFinite(r)) return false; this.ratio = Math.min(MAX, Math.max(MIN, r)); return true; }
  swap() { if (!this.active) return false; [this.left, this.right] = [this.right, this.left]; this.ratio = 1 - this.ratio; return true; }
  setFocus(id) { if (!this.has(id)) return false; this.focus = id === this.left ? 'left' : 'right'; return true; }
  focusedId() { return !this.active ? null : this.focus === 'left' ? this.left : this.right; }
  // Pick the tab to pair with `id`: the next visible tab in order, else the previous one.
  static pickPartner(id, ordered) {
    const i = ordered.indexOf(id); if (i < 0 || ordered.length < 2) return null;
    return i + 1 < ordered.length ? ordered[i + 1] : ordered[i - 1];
  }
  // Pixel rectangles for the two panes inside an area. Widths always sum to area width minus the gap.
  bounds(area) {
    const { x, y, width, height } = area;
    const usable = Math.max(0, width - GAP);
    const lw = Math.round(usable * this.ratio);
    return {
      left: { x, y, width: lw, height },
      right: { x: x + lw + GAP, y, width: usable - lw, height },
    };
  }
  // Ratio that puts the divider's centre under pointer x (window coordinates), clamped to MIN..MAX.
  // Returns null for junk input or an area too small to split.
  static ratioFromX(x, area) {
    x = Number(x); if (!Number.isFinite(x) || !area || !(area.width > GAP)) return null;
    const usable = area.width - GAP;
    return Math.min(MAX, Math.max(MIN, (x - area.x - GAP / 2) / usable));
  }
  // Divider rectangle (the gap between the panes) for hit-testing and drawing.
  divider(area) { const b = this.bounds(area); const x = b.left.x + b.left.width; return { x, y: area.y, width: GAP, height: area.height }; }
  toJSON() { return this.active ? { left: this.left, right: this.right, ratio: this.ratio } : null; }
}

module.exports = { SplitState, MIN, MAX, GAP };
