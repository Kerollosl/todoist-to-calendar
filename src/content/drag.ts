// Custom pointer-event dragging from the task list. Native HTML5 drag and drop
// is not used because Calendar swallows native drops on its grid.
//
// pointerdown on a row → (moved ≥ 4px) begin → move… → pointerup = drop
//                       (no movement)       → normal click (selection)
// Escape or pointercancel cancels. Pointer capture keeps every move/up event
// on our row, so Calendar's own grid handlers never see the gesture.
import { pushKeyHandler } from "./keys";

const THRESHOLD_PX = 4;

export interface DragHandlers {
  /** The pointer passed the threshold on the row for task `id`. Return how many tasks are dragged. */
  begin(id: string): number;
  move(x: number, y: number): void;
  drop(x: number, y: number): void;
  cancel(): void;
}

export function attachDrag(list: HTMLElement, handlers: DragHandlers): void {
  let suppressClick = false;

  // A drag ends with pointerup on the captured row, which also fires a click.
  // Swallow that click so the drag doesn't toggle the row's selection.
  list.addEventListener(
    "click",
    (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  list.addEventListener("pointerdown", (down) => {
    if (down.button !== 0 || !down.isPrimary) return;
    const row = (down.target as Element).closest<HTMLElement>(".row");
    const id = row?.dataset.id;
    if (!row || !id) return;
    down.preventDefault(); // no text selection, no native drag, no compat mousedown for Calendar
    list.focus({ preventScroll: true });

    const pointerId = down.pointerId;
    const startX = down.clientX;
    const startY = down.clientY;
    let dragging = false;
    let finished = false;
    row.setPointerCapture(pointerId);

    const finish = () => {
      if (finished) return;
      finished = true;
      row.removeEventListener("pointermove", onMove);
      row.removeEventListener("pointerup", onUp);
      row.removeEventListener("pointercancel", onCancel);
      row.removeEventListener("lostpointercapture", onCancel);
      removeKey();
      if (row.hasPointerCapture(pointerId)) row.releasePointerCapture(pointerId);
      list.classList.remove("dragging");
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) < THRESHOLD_PX) return;
        dragging = true;
        list.classList.add("dragging");
        handlers.begin(id);
      }
      handlers.move(event.clientX, event.clientY);
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const wasDragging = dragging;
      finish();
      if (wasDragging) {
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
        handlers.drop(event.clientX, event.clientY);
      }
    };
    const onCancel = () => {
      const wasDragging = dragging;
      finish();
      if (wasDragging) handlers.cancel();
    };
    const removeKey = pushKeyHandler((event) => {
      if (!dragging || event.key !== "Escape") return false;
      finish();
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      handlers.cancel();
      return true;
    });

    row.addEventListener("pointermove", onMove);
    row.addEventListener("pointerup", onUp);
    row.addEventListener("pointercancel", onCancel);
    row.addEventListener("lostpointercapture", onCancel);
  });
}
