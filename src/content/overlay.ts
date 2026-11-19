// Visual feedback while dragging: a chip that follows the cursor and, over a
// valid drop target, a ghost block on the calendar slot. Both are drawn in our
// own fixed-position layer; Calendar's DOM is never modified.
import { h } from "./dom";

export interface GhostBox {
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  /** Clip the ghost to this vertical band (the visible timed grid). */
  clipTop?: number;
  clipBottom?: number;
}

export class DragOverlay {
  readonly el: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly chipTitle: HTMLElement;
  private readonly chipHint: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly ghostLabel: HTMLElement;
  private readonly live: HTMLElement;

  constructor() {
    this.chipTitle = h("span", { class: "chip-title" });
    this.chipHint = h("span", { class: "chip-hint" });
    this.chip = h("div", { class: "chip", hidden: true, "aria-hidden": "true" }, this.chipTitle, this.chipHint);
    this.ghostLabel = h("span", { class: "ghost-label" });
    this.ghost = h("div", { class: "ghost", hidden: true, "aria-hidden": "true" }, this.ghostLabel);
    this.live = h("div", { class: "sr-only", role: "status", "aria-live": "assertive" });
    this.el = h("div", { class: "drag-layer" }, this.ghost, this.chip, this.live);
  }

  start(count: number): void {
    this.chipTitle.textContent = `Todoist · ${count} task${count === 1 ? "" : "s"}`;
    this.chipHint.textContent = "";
    this.chip.hidden = false;
    this.announce(`Dragging ${count} task${count === 1 ? "" : "s"}. Drop on the calendar, or press Escape to cancel.`);
  }

  moveChip(x: number, y: number, hint: string): void {
    this.chip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 12)}px)`;
    if (this.chipHint.textContent !== hint) this.chipHint.textContent = hint;
  }

  showGhost(box: GhostBox | null): void {
    if (!box) {
      this.ghost.hidden = true;
      return;
    }
    let top = box.top;
    let bottom = box.top + box.height;
    if (box.clipTop !== undefined) top = Math.max(top, box.clipTop);
    if (box.clipBottom !== undefined) bottom = Math.min(bottom, box.clipBottom);
    if (bottom - top < 4) {
      this.ghost.hidden = true;
      return;
    }
    Object.assign(this.ghost.style, {
      left: `${Math.round(box.left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(box.width)}px`,
      height: `${Math.round(bottom - top)}px`,
    });
    this.ghostLabel.textContent = box.label;
    this.ghost.hidden = false;
  }

  end(message?: string): void {
    this.chip.hidden = true;
    this.ghost.hidden = true;
    if (message) this.announce(message);
  }

  announce(message: string): void {
    this.live.textContent = "";
    // Re-set on the next frame so repeated messages are still announced.
    requestAnimationFrame(() => (this.live.textContent = message));
  }
}
