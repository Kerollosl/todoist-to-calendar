import { describe, expect, it } from "vitest";
import {
  addDays,
  addMinutes,
  formatDayLabel,
  formatOffset,
  formatSlotLabel,
  isValidZone,
  parseWall,
  toRfc3339,
  toWall,
  wallDiffMinutes,
  zoneOffsetMinutes,
} from "../src/core/time";

const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("wall-time arithmetic", () => {
  it("builds wall times from a date and minutes, rolling over midnight", () => {
    expect(toWall("2026-11-19", 840)).toBe("2026-11-19T14:00");
    expect(toWall("2026-11-19", 1440 + 30)).toBe("2026-11-20T00:30");
  });
  it("adds minutes and days across month and year ends", () => {
    expect(addMinutes("2026-11-19T23:30", 45)).toBe("2026-11-20T00:15");
    expect(addMinutes("2026-12-31T23:45", 30)).toBe("2027-01-01T00:15");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("ignores DST because wall time has no zone", () => {
    expect(addMinutes("2026-03-08T01:30", 60)).toBe("2026-03-08T02:30");
    expect(wallDiffMinutes("2026-11-19T14:00", "2026-11-19T14:45")).toBe(45);
  });
  it("validates wall times", () => {
    expect(parseWall("2026-11-19T14:00")).toEqual({ y: 2026, m: 11, d: 19, h: 14, mi: 0 });
    expect(parseWall("2026-02-30T10:00")).toBeNull();
    expect(parseWall("2026-11-19T24:00")).toBeNull();
    expect(parseWall("nope")).toBeNull();
  });
});

describe("toRfc3339", () => {
  it("adds the zone's offset (New York, winter and summer)", () => {
    expect(toRfc3339("2026-11-19T14:00", "America/New_York")).toBe("2026-11-19T14:00:00-05:00");
    expect(toRfc3339("2026-07-01T09:30", "America/New_York")).toBe("2026-07-01T09:30:00-04:00");
  });
  it("moves a skipped spring-forward time to after the gap", () => {
    expect(toRfc3339("2026-03-08T02:30", "America/New_York")).toBe("2026-03-08T03:30:00-04:00");
  });
  it("picks the earlier instant for an ambiguous fall-back time", () => {
    expect(toRfc3339("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T01:30:00-04:00");
    expect(toRfc3339("2026-11-01T02:30", "America/New_York")).toBe("2026-11-01T02:30:00-05:00");
  });
  it("handles times just around a transition", () => {
    expect(toRfc3339("2026-03-08T01:59", "America/New_York")).toBe("2026-03-08T01:59:00-05:00");
    expect(toRfc3339("2026-03-08T03:00", "America/New_York")).toBe("2026-03-08T03:00:00-04:00");
  });
  it("supports half-hour zones and UTC", () => {
    expect(toRfc3339("2026-11-19T14:00", "Asia/Kolkata")).toBe("2026-11-19T14:00:00+05:30");
    expect(toRfc3339("2026-11-19T14:00", "UTC")).toBe("2026-11-19T14:00:00+00:00");
  });
});

describe("zone helpers", () => {
  it("reads offsets", () => {
    expect(zoneOffsetMinutes("America/New_York", Date.UTC(2026, 10, 19, 19))).toBe(-300);
    expect(zoneOffsetMinutes("Europe/London", Date.UTC(2026, 6, 1, 12))).toBe(60);
  });
  it("formats offsets", () => {
    expect(formatOffset(-300)).toBe("-05:00");
    expect(formatOffset(330)).toBe("+05:30");
    expect(formatOffset(0)).toBe("+00:00");
  });
  it("validates zones", () => {
    expect(isValidZone("America/New_York")).toBe(true);
    expect(isValidZone("Mars/Olympus")).toBe(false);
  });
});

describe("labels", () => {
  it("formats day and slot labels", () => {
    expect(formatDayLabel("2026-11-19", "en-US")).toBe("Thu, Nov 19");
    expect(norm(formatSlotLabel("2026-11-19", 840, 45, "en-US"))).toBe("Thu, Nov 19 · 2:00 – 2:45 PM");
    expect(norm(formatSlotLabel("2026-11-19", 690, 60, "en-US"))).toBe("Thu, Nov 19 · 11:30 AM – 12:30 PM");
  });
  it("shows both dates when the slot crosses midnight", () => {
    const label = norm(formatSlotLabel("2026-11-19", 1410, 60, "en-US"));
    expect(label).toContain("Nov 19");
    expect(label).toContain("Nov 20");
  });
});
