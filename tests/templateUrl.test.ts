import { describe, expect, it } from "vitest";
import { buildTemplateUrl } from "../src/core/templateUrl";

const parse = (url: string) => {
  const u = new URL(url);
  return { base: `${u.origin}${u.pathname}`, params: Object.fromEntries(u.searchParams) };
};

describe("buildTemplateUrl", () => {
  it("prefills title, details and timed dates in the user's Calendar zone", () => {
    const { base, params } = parse(
      buildTemplateUrl({ title: "Todoist", details: "1. A\n2. B", allDay: false, start: "2026-11-19T14:00", end: "2026-11-19T14:45" }),
    );
    expect(base).toBe("https://calendar.google.com/calendar/render");
    expect(params).toEqual({ action: "TEMPLATE", text: "Todoist", details: "1. A\n2. B", dates: "20261119T140000/20261119T144500" });
  });
  it("adds ctz when a zone is known", () => {
    const { params } = parse(
      buildTemplateUrl({ title: "T", details: "", allDay: false, start: "2026-11-19T14:00", end: "2026-11-19T15:00", timeZone: "America/New_York" }),
    );
    expect(params.ctz).toBe("America/New_York");
  });
  it("uses an exclusive end date for all-day events and no ctz", () => {
    const { params } = parse(
      buildTemplateUrl({ title: "T", details: "", allDay: true, start: "2026-11-30", end: "2026-11-30", timeZone: "America/New_York" }),
    );
    expect(params.dates).toBe("20261130/20261201");
    expect(params.ctz).toBeUndefined();
  });
  it("encodes special characters safely", () => {
    const url = buildTemplateUrl({ title: "A & B #1", details: "x=1&y=2", allDay: true, start: "2026-11-19", end: "2026-11-19" });
    expect(parse(url).params.text).toBe("A & B #1");
    expect(parse(url).params.details).toBe("x=1&y=2");
  });
});
