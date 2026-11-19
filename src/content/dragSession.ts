// One drag gesture over the calendar: re-reads Calendar's layout as the cursor
// moves (and as we auto-scroll), hit-tests it, and drives the chip and ghost.
import { formatDayLabel, formatSlotLabel } from "../core/time";
import { EMPTY_LAYOUT, autoScrollDelta, hitTest, readLayout, slotBox, type Box, type DropTarget, type Layout } from "./calendarGeometry";
import type { DragOverlay } from "./overlay";

export function targetLabel(target: DropTarget, durationMinutes: number): string {
  return target.kind === "allday"
    ? `All day · ${formatDayLabel(target.date)}`
    : formatSlotLabel(target.date, target.minutes, durationMinutes);
}

export class DragSession {
  private layout: Layout = EMPTY_LAYOUT;
  private scroller: HTMLElement | null = null;
  private target: DropTarget | null = null;
  private x = 0;
  private y = 0;
  private frame = 0;
  private active = false;
  private duration = 30;

  constructor(
    private readonly overlay: DragOverlay,
    private readonly exclude: () => Box[],
  ) {}

  start(count: number, durationMinutes: number): void {
    this.duration = durationMinutes;
    this.active = true;
    this.overlay.start(count);
    this.frame = requestAnimationFrame(this.tick);
  }

  move(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.update();
  }

  /** Ends the gesture and returns the final target (null = no valid slot). */
  finish(): DropTarget | null {
    if (!this.active) return null;
    this.update();
    this.stop();
    return this.target;
  }

  cancel(): void {
    this.stop();
    this.target = null;
  }

  private stop(): void {
    this.active = false;
    cancelAnimationFrame(this.frame);
    this.overlay.end();
  }

  private update(): void {
    const { layout, scroller } = readLayout();
    this.layout = layout;
    this.scroller = scroller;
    this.target = hitTest(layout, this.x, this.y, this.exclude());
    let hint: string;
    if (this.target) hint = targetLabel(this.target, this.duration);
    else if (layout.view === "none") hint = "Switch Calendar to day, week or month view";
    else hint = "Drop on a day or time slot";
    this.overlay.moveChip(this.x, this.y, hint);
    const box = this.target ? slotBox(layout, this.target, this.duration) : null;
    this.overlay.showGhost(
      box && this.target
        ? {
            left: box.left,
            top: box.top,
            width: box.right - box.left,
            height: box.bottom - box.top,
            label: this.target.kind === "allday" ? "All day" : hint.split(" · ").pop() ?? hint,
            clipTop: this.target.kind === "timed" ? layout.viewport?.top : undefined,
            clipBottom: this.target.kind === "timed" ? layout.viewport?.bottom : undefined,
          }
        : null,
    );
  }

  private readonly tick = () => {
    if (!this.active) return;
    const delta = autoScrollDelta(this.layout, this.x, this.y);
    if (delta !== 0 && this.scroller) {
      const before = this.scroller.scrollTop;
      this.scroller.scrollTop = before + delta;
      if (this.scroller.scrollTop !== before) this.update();
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}
