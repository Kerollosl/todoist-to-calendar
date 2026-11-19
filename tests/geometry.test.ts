import { describe, expect, it } from "vitest";
import {
  autoScrollDelta,
  decodeDatekey,
  encodeDatekey,
  hitTest,
  parseGmtLabel,
  slotBox,
  snapMinutes,
  type Layout,
} from "../src/content/calendarGeometry";

// Week view as measured live (2026-11-18): 7 columns, 81px wide, each spanning
// the whole day (top −315, height 961 → 40px/hour) at scrollTop 503. The
// scroller shows y 188–622 and the header band starts at y 64.
const HEIGHT = 961;
const TOP = -315;
const week: Layout = {
  view: "timed",
  columns: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-11-${String(15 + i).padStart(2, "0")}`,
    box: { left: 321 + i * 81, right: 402 + i * 81, top: TOP, bottom: TOP + HEIGHT },
  })),
  viewport: { left: 312, top: 188, right: 664, bottom: 622 },
  allDay: { left: 321, top: 64, right: 888, bottom: 188 },
  cells: [],
};
const yFor = (minutes: number) => TOP + (minutes / 1440) * HEIGHT;

describe("datekey", () => {
  it("decodes Calendar's packed date keys", () => {
    expect(decodeDatekey(29039)).toBe("2026-11-15");
    expect(decodeDatekey(29042)).toBe("2026-11-18");
  });
  it("round-trips", () => {
    for (const iso of ["1999-01-01", "2024-02-29", "2026-12-31", "2030-07-04"]) {
      expect(decodeDatekey(encodeDatekey(iso))).toBe(iso);
    }
  });
  it("rejects garbage and impossible dates", () => {
    expect(decodeDatekey(NaN)).toBeNull();
    expect(decodeDatekey(0)).toBeNull();
    expect(decodeDatekey(encodeDatekey("2026-02-30"))).toBeNull();
  });
});

describe("snapMinutes", () => {
  it("floors to the 15-minute slot under the cursor", () => {
    expect(snapMinutes(0)).toBe(0);
    expect(snapMinutes(14.9)).toBe(0);
    expect(snapMinutes(15)).toBe(15);
    expect(snapMinutes(29.99)).toBe(15);
    expect(snapMinutes(840.6)).toBe(840);
  });
  it("clamps to the day", () => {
    expect(snapMinutes(-5)).toBe(0);
    expect(snapMinutes(1439.9)).toBe(1425);
    expect(snapMinutes(5000)).toBe(1425);
  });
});

describe("hitTest (week view)", () => {
  it("maps x to the day column and y to the snapped time", () => {
    expect(hitTest(week, 330, yFor(840) + 1)).toEqual({ kind: "timed", date: "2026-11-15", minutes: 840 });
    expect(hitTest(week, 420, yFor(900) + 5)).toEqual({ kind: "timed", date: "2026-11-16", minutes: 900 });
  });
  it("stays in the same slot anywhere inside it", () => {
    const top = hitTest(week, 330, yFor(840) + 0.5);
    const bottom = hitTest(week, 330, yFor(855) - 0.5);
    expect(top).toEqual(bottom);
  });
  it("treats the header band as all-day", () => {
    expect(hitTest(week, 510, 150)).toEqual({ kind: "allday", date: "2026-11-17" });
    expect(hitTest(week, 510, 70)).toEqual({ kind: "allday", date: "2026-11-17" });
  });
  it("ignores points outside the columns or the visible grid", () => {
    expect(hitTest(week, 100, 300)).toBeNull(); // left sidebar
    expect(hitTest(week, 330, 630)).toBeNull(); // below the scroller
    expect(hitTest(week, 330, 40)).toBeNull(); // Calendar header
  });
  it("ignores columns hidden past the scroller's right edge", () => {
    expect(hitTest(week, 700, yFor(900))).toBeNull(); // Thu column, behind the side panel
    expect(hitTest(week, 700, 150)).toBeNull();
  });
  it("ignores points over our own panel", () => {
    const panel = { left: 400, top: 68, right: 720, bottom: 700 };
    expect(hitTest(week, 420, 300, [panel])).toBeNull();
    expect(hitTest(week, 330, yFor(840) + 1, [panel])).not.toBeNull();
  });
  it("only accepts times scrolled into view", () => {
    expect(hitTest(week, 330, yFor(600))).not.toEqual(expect.objectContaining({ kind: "timed" })); // 10 AM is above the viewport
  });
  it("works after scrolling (boxes move, math does not change)", () => {
    const scrolled: Layout = { ...week, columns: week.columns.map((c) => ({ ...c, box: { ...c.box, top: c.box.top + 200, bottom: c.box.bottom + 200 } })) };
    expect(hitTest(scrolled, 330, yFor(600) + 200 + 1)).toEqual({ kind: "timed", date: "2026-11-15", minutes: 600 });
  });
  it("returns null for views without targets", () => {
    expect(hitTest({ view: "none", columns: [], viewport: null, allDay: null, cells: [] }, 330, 300)).toBeNull();
  });
});

describe("hitTest (day view without an all-day band)", () => {
  const day: Layout = {
    view: "timed",
    columns: [{ date: "2026-11-18", box: { left: 313, right: 648, top: -339, bottom: 622 } }],
    viewport: { left: 312, top: 188, right: 664, bottom: 622 },
    allDay: null,
    cells: [],
  };
  it("maps times and has no all-day zone", () => {
    const y = -339 + (15 * 60 * 961) / 1440 + 2;
    expect(hitTest(day, 500, y)).toEqual({ kind: "timed", date: "2026-11-18", minutes: 900 });
    expect(hitTest(day, 500, 150)).toBeNull();
  });
});

describe("hitTest (month view)", () => {
  const month: Layout = {
    view: "month",
    columns: [],
    viewport: null,
    allDay: null,
    cells: [
      { date: "2026-11-01", box: { left: 265, top: 84, right: 322, bottom: 191 } },
      { date: "2026-11-02", box: { left: 322, top: 84, right: 379, bottom: 191 } },
    ],
  };
  it("creates all-day targets from day cells", () => {
    expect(hitTest(month, 300, 100)).toEqual({ kind: "allday", date: "2026-11-01" });
    expect(hitTest(month, 330, 190)).toEqual({ kind: "allday", date: "2026-11-02" });
    expect(hitTest(month, 500, 100)).toBeNull();
  });
  it("uses the cell as the ghost box", () => {
    expect(slotBox(month, { kind: "allday", date: "2026-11-02" }, 30)).toEqual(month.cells[1]!.box);
  });
});

describe("slotBox", () => {
  it("sizes the ghost from start and duration", () => {
    const box = slotBox(week, { kind: "timed", date: "2026-11-15", minutes: 840 }, 45)!;
    expect(box.top).toBeCloseTo(yFor(840));
    expect(box.bottom - box.top).toBeCloseTo((45 / 1440) * HEIGHT);
    expect(box.left).toBe(323);
  });
  it("stops the ghost at midnight", () => {
    const box = slotBox(week, { kind: "timed", date: "2026-11-15", minutes: 1425 }, 120)!;
    expect(box.bottom).toBeCloseTo(TOP + HEIGHT);
  });
  it("covers the column's header band for all-day targets", () => {
    expect(slotBox(week, { kind: "allday", date: "2026-11-16" }, 30)).toEqual({ left: 402, right: 483, top: 64, bottom: 188 });
  });
});

describe("parseGmtLabel", () => {
  it("parses the hour-gutter zone label", () => {
    expect(parseGmtLabel("GMT-05")).toBe(-300);
    expect(parseGmtLabel("GMT-5")).toBe(-300);
    expect(parseGmtLabel("GMT+05:30")).toBe(330);
    expect(parseGmtLabel("GMT−04")).toBe(-240);
    expect(parseGmtLabel("GMT")).toBe(0);
    expect(parseGmtLabel("Tuesday")).toBeNull();
  });
});

describe("autoScrollDelta", () => {
  it("scrolls up near the top edge and down near the bottom edge", () => {
    expect(autoScrollDelta(week, 330, 190)).toBeLessThan(0);
    expect(autoScrollDelta(week, 330, 620)).toBeGreaterThan(0);
    expect(autoScrollDelta(week, 330, 660)).toBe(18); // just below the grid: full speed
  });
  it("is faster closer to the edge", () => {
    expect(Math.abs(autoScrollDelta(week, 330, 189))).toBeGreaterThan(Math.abs(autoScrollDelta(week, 330, 220)));
  });
  it("does not scroll in the middle, over the all-day band, or outside the columns", () => {
    expect(autoScrollDelta(week, 330, 400)).toBe(0);
    expect(autoScrollDelta(week, 330, 150)).toBe(0);
    expect(autoScrollDelta(week, 100, 190)).toBe(0);
  });
});
