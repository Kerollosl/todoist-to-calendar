/**
 * calendarGeometry.ts — the fragile part, kept in one place.
 *
 * Maps a viewport point (the cursor) to a Google Calendar slot: a day plus a
 * time snapped to 15 minutes, or a day for all-day events. Calendar has no
 * public DOM API, so this reads its markup. If Google changes the markup, fix
 * it here and nowhere else.
 *
 * Markup relied on (inspected live on 2026-11-18 in day, week and month views):
 *
 *   div[role="gridcell"][data-datekey][data-column-index]
 *       One per visible day in day/week/N-day views. Its box spans the WHOLE day,
 *       00:00 at its top edge and 24:00 at its bottom edge, even where it is
 *       scrolled out of view (e.g. top −315px, height 961px at scrollTop 503).
 *       So minutes = (y − top) / height × 1440, and because getBoundingClientRect
 *       already includes the scroll offset, no separate scroll math is needed.
 *
 *   nearest ancestor of a gridcell with overflow-y: auto
 *       The scrolling timed grid. Its box is the visible part of the day. Only
 *       points inside it count as timed drops, and it is what we auto-scroll.
 *
 *   [role="columnheader"]  and  li[data-datekey]
 *       The date headers and the all-day row above the timed grid. The all-day
 *       row (li) is 0px tall in day view when it has no events, so instead of
 *       relying on it we treat the whole header band, from the top of the column
 *       headers down to the top of the scroller, as the all-day drop zone.
 *
 *   div[data-datekey]:not([role])
 *       Month-view day cells (h2[data-datekey] and div[role=presentation] also
 *       exist inside them; we take the outer cell). A drop makes an all-day event.
 *
 *   data-datekey encoding (verified: 29039 → 2026-11-15, 29042 → 2026-11-18):
 *       key = ((year − 1970) << 9) | (month << 5) | day
 *
 * Everything in the top half of this file is pure and unit-tested; only
 * readLayout() touches the DOM.
 */
import { DAY_MINUTES } from "../core/time";

export const SNAP_MINUTES = 15;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DayBox {
  date: string; // YYYY-MM-DD
  box: Box;
}

export interface Layout {
  view: "timed" | "month" | "none";
  /** Timed view: one per visible day; each box spans 00:00–24:00. */
  columns: DayBox[];
  /** Timed view: the visible part of the scrolling grid. */
  viewport: Box | null;
  /** Timed view: header band (dates + all-day row) above the grid. */
  allDay: Box | null;
  /** Month view: one per day cell. */
  cells: DayBox[];
}

export type DropTarget = { kind: "timed"; date: string; minutes: number } | { kind: "allday"; date: string };

export const EMPTY_LAYOUT: Layout = { view: "none", columns: [], viewport: null, allDay: null, cells: [] };

// ---------------------------------------------------------------- pure part

export function decodeDatekey(key: number): string | null {
  if (!Number.isInteger(key) || key <= 0) return null;
  const year = (key >> 9) + 1970;
  const month = (key >> 5) & 15;
  const day = key & 31;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1) return null; // e.g. Feb 30
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function encodeDatekey(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return ((y - 1970) << 9) | (m << 5) | d;
}

export function inside(box: Box, x: number, y: number): boolean {
  return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
}

/** Floor to the 15-minute slot under the cursor, kept within the day. */
export function snapMinutes(minutes: number, step = SNAP_MINUTES): number {
  const snapped = Math.floor(minutes / step) * step;
  return Math.min(Math.max(snapped, 0), DAY_MINUTES - step);
}

/** What is under (x, y)? `exclude` = our own UI (the panel), which covers part of the grid. */
export function hitTest(layout: Layout, x: number, y: number, exclude: readonly Box[] = []): DropTarget | null {
  if (exclude.some((box) => inside(box, x, y))) return null;
  if (layout.view === "month") {
    const cell = layout.cells.find((c) => inside(c.box, x, y));
    return cell ? { kind: "allday", date: cell.date } : null;
  }
  if (layout.view !== "timed" || !layout.viewport) return null;
  // Columns can extend past the scroller's edges (narrow windows hide later days).
  if (x < layout.viewport.left || x >= layout.viewport.right) return null;
  const column = layout.columns.find((c) => x >= c.box.left && x < c.box.right);
  if (!column) return null;
  if (layout.allDay && y >= layout.allDay.top && y < layout.allDay.bottom) return { kind: "allday", date: column.date };
  if (y < layout.viewport.top || y >= layout.viewport.bottom) return null;
  const { top, bottom } = column.box;
  if (y < top || y >= bottom || bottom - top <= 0) return null;
  return { kind: "timed", date: column.date, minutes: snapMinutes(((y - top) / (bottom - top)) * DAY_MINUTES) };
}

/** Where to draw the ghost event for a target (before clipping to the viewport). */
export function slotBox(layout: Layout, target: DropTarget, durationMinutes: number): Box | null {
  if (target.kind === "allday") {
    if (layout.view === "month") return layout.cells.find((c) => c.date === target.date)?.box ?? null;
    const column = layout.columns.find((c) => c.date === target.date);
    if (!column || !layout.allDay) return null;
    return { left: column.box.left, right: column.box.right, top: layout.allDay.top, bottom: layout.allDay.bottom };
  }
  const column = layout.columns.find((c) => c.date === target.date);
  if (!column) return null;
  const perMinute = (column.box.bottom - column.box.top) / DAY_MINUTES;
  const visibleMinutes = Math.max(SNAP_MINUTES, Math.min(durationMinutes, DAY_MINUTES - target.minutes));
  const top = column.box.top + target.minutes * perMinute;
  return { left: column.box.left + 2, right: column.box.right - 6, top, bottom: top + visibleMinutes * perMinute };
}

/**
 * Auto-scroll speed (px per frame) while dragging near the top or bottom edge
 * of the timed grid. Negative scrolls up. Zero over the all-day band, so
 * hovering there does not scroll the grid.
 */
export function autoScrollDelta(layout: Layout, x: number, y: number, edge = 48, maxSpeed = 18): number {
  const vp = layout.viewport;
  if (layout.view !== "timed" || !vp || x < vp.left || x >= vp.right) return 0;
  if (!layout.columns.some((c) => x >= c.box.left && x < c.box.right)) return 0;
  if (y >= vp.top && y < vp.top + edge) return -Math.ceil(maxSpeed * (1 - (y - vp.top) / edge));
  if (y > vp.bottom - edge && y <= vp.bottom + edge) return Math.ceil(maxSpeed * Math.min(1, (y - (vp.bottom - edge)) / edge));
  return 0;
}

/** "GMT-05", "GMT+05:30", "GMT-5" (the label in the grid's hour gutter) → minutes. */
export function parseGmtLabel(text: string): number | null {
  const match = /^GMT([+-−])(\d{1,2})(?::?(\d{2}))?$/.exec(text.trim());
  if (!match) return text.trim() === "GMT" ? 0 : null;
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

// ----------------------------------------------------------------- DOM part

const COLUMN_SELECTOR = 'div[role="gridcell"][data-datekey]';
const HEADER_SELECTORS = ['[role="columnheader"]', "li[data-datekey]"];
const MONTH_CELL_SELECTOR = "div[data-datekey]:not([role])";
const MIN_DAY_HEIGHT = 240; // a 24h column is at least ~10px/hour tall

function toBox(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function intersect(a: Box, b: Box): Box | null {
  const box = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return box.right > box.left && box.bottom > box.top ? box : null;
}

function findScroller(el: Element): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

export function readLayout(doc: Document = document): { layout: Layout; scroller: HTMLElement | null } {
  const win = doc.defaultView ?? window;
  const screen: Box = { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight };

  const columnEls: Element[] = [];
  const columns: DayBox[] = [];
  for (const el of doc.querySelectorAll(COLUMN_SELECTOR)) {
    const rect = el.getBoundingClientRect();
    const date = decodeDatekey(Number(el.getAttribute("data-datekey")));
    if (!date || rect.width < 10 || rect.height < MIN_DAY_HEIGHT) continue;
    columns.push({ date, box: toBox(rect) });
    columnEls.push(el);
  }

  if (columns.length > 0) {
    const scroller = findScroller(columnEls[0]!);
    const left = Math.min(...columns.map((c) => c.box.left));
    const right = Math.max(...columns.map((c) => c.box.right));
    const span: Box = { left, right, top: Math.min(...columns.map((c) => c.box.top)), bottom: Math.max(...columns.map((c) => c.box.bottom)) };
    const viewport = intersect(scroller ? toBox(scroller.getBoundingClientRect()) : span, screen);

    let headerTop = Infinity;
    if (viewport) {
      for (const el of doc.querySelectorAll(HEADER_SELECTORS.join(","))) {
        const r = el.getBoundingClientRect();
        const overlapsColumns = r.right > left && r.left < right;
        if (overlapsColumns && r.bottom <= viewport.top + 1 && r.height >= 0 && r.top >= 0) headerTop = Math.min(headerTop, r.top);
      }
    }
    const allDay =
      viewport && headerTop < viewport.top - 8
        ? { left: Math.max(left, viewport.left), right: Math.min(right, viewport.right), top: headerTop, bottom: viewport.top }
        : null;
    return { layout: { view: "timed", columns, viewport, allDay, cells: [] }, scroller };
  }

  const cells: DayBox[] = [];
  for (const el of doc.querySelectorAll(MONTH_CELL_SELECTOR)) {
    const rect = el.getBoundingClientRect();
    const date = decodeDatekey(Number(el.getAttribute("data-datekey")));
    if (date && rect.width > 20 && rect.height > 40) cells.push({ date, box: toBox(rect) });
  }
  return { layout: cells.length ? { ...EMPTY_LAYOUT, view: "month", cells } : EMPTY_LAYOUT, scroller: null };
}

/** UTC offset the grid says it is drawn in (from the "GMT-05" gutter label), or null. */
export function readGridOffset(doc: Document = document): number | null {
  for (const el of doc.querySelectorAll("div, span")) {
    if (el.childElementCount !== 0) continue;
    const text = el.textContent?.trim() ?? "";
    if (text.startsWith("GMT")) {
      const offset = parseGmtLabel(text);
      if (offset !== null) return offset;
    }
  }
  return null;
}
