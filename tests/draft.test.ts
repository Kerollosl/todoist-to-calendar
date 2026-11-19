import { describe, expect, it } from "vitest";
import { buildDescription, buildEventBody, convertTimes, initialTimes, newEventId, validateDraft } from "../src/core/draft";
import type { EventDraft } from "../src/shared/types";

const tasks = [
  { id: "6X7rM8997g3RQmvh", content: "Email **Sam** about the report", isRecurring: false },
  { id: "6X7rfFVPjhvv84XG", content: "Read [the spec](https://example.com/spec)", isRecurring: true },
];

describe("buildDescription", () => {
  it("numbers one task per line in plain text", () => {
    expect(buildDescription(tasks, false)).toBe("1. Email Sam about the report\n2. Read the spec (https://example.com/spec)");
  });
  it("optionally appends each task's Todoist URL on the same line", () => {
    expect(buildDescription(tasks, true)).toBe(
      "1. Email Sam about the report — https://app.todoist.com/app/task/6X7rM8997g3RQmvh\n" +
        "2. Read the spec (https://example.com/spec) — https://app.todoist.com/app/task/6X7rfFVPjhvv84XG",
    );
  });
  it("handles a single task and keeps numbering past 9", () => {
    expect(buildDescription([tasks[0]!], false)).toBe("1. Email Sam about the report");
    const many = Array.from({ length: 11 }, (_, i) => ({ id: String(i), content: `T${i + 1}` }));
    expect(buildDescription(many, false).split("\n").at(-1)).toBe("11. T11");
  });
});

describe("initialTimes", () => {
  it("starts at the drop slot and lasts the given duration", () => {
    expect(initialTimes({ kind: "timed", date: "2026-11-19", minutes: 840 }, 45)).toEqual({
      allDay: false,
      start: "2026-11-19T14:00",
      end: "2026-11-19T14:45",
    });
  });
  it("crosses midnight", () => {
    expect(initialTimes({ kind: "timed", date: "2026-11-19", minutes: 1410 }, 60).end).toBe("2026-11-20T00:30");
  });
  it("makes single-day all-day drafts", () => {
    expect(initialTimes({ kind: "allday", date: "2026-11-19" }, 30)).toEqual({ allDay: true, start: "2026-11-19", end: "2026-11-19" });
  });
});

describe("convertTimes", () => {
  it("timed → all-day keeps the dates; a midnight end belongs to the previous day", () => {
    expect(convertTimes({ allDay: false, start: "2026-11-19T14:00", end: "2026-11-19T15:00" }, true, 30)).toEqual({
      allDay: true,
      start: "2026-11-19",
      end: "2026-11-19",
    });
    expect(convertTimes({ allDay: false, start: "2026-11-19T23:00", end: "2026-11-20T00:00" }, true, 30).end).toBe("2026-11-19");
  });
  it("all-day → timed starts at 9:00 with the default duration", () => {
    expect(convertTimes({ allDay: true, start: "2026-11-19", end: "2026-11-19" }, false, 30)).toEqual({
      allDay: false,
      start: "2026-11-19T09:00",
      end: "2026-11-19T09:30",
    });
  });
});

describe("validateDraft", () => {
  const ok = { title: "Todoist", allDay: false, start: "2026-11-19T14:00", end: "2026-11-19T14:30", tasks };
  it("accepts a valid draft", () => {
    expect(validateDraft(ok)).toBeNull();
    expect(validateDraft({ ...ok, allDay: true, start: "2026-11-19", end: "2026-11-19" })).toBeNull();
  });
  it("rejects empty titles, no tasks, and bad or reversed times", () => {
    expect(validateDraft({ ...ok, title: "  " })).toMatch(/title/);
    expect(validateDraft({ ...ok, tasks: [] })).toMatch(/No tasks/);
    expect(validateDraft({ ...ok, end: "2026-11-19T14:00" })).toMatch(/after the start/);
    expect(validateDraft({ ...ok, end: "garbage" })).toMatch(/valid/);
    expect(validateDraft({ ...ok, end: "2026-12-19T14:00" })).toMatch(/two weeks/);
    expect(validateDraft({ ...ok, allDay: true, start: "2026-11-19", end: "2026-11-18" })).toMatch(/before/);
  });
});

describe("buildEventBody", () => {
  const draft: EventDraft = { draftId: "d1", title: " Todoist ", allDay: false, start: "2026-11-19T14:00", end: "2026-11-19T14:45", tasks };
  it("sends RFC 3339 with an explicit offset plus the timeZone field", () => {
    expect(buildEventBody(draft, "America/New_York", false, "ttcabc12")).toEqual({
      id: "ttcabc12",
      summary: "Todoist",
      description: "1. Email Sam about the report\n2. Read the spec (https://example.com/spec)",
      start: { dateTime: "2026-11-19T14:00:00-05:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-11-19T14:45:00-05:00", timeZone: "America/New_York" },
    });
  });
  it("uses the calendar's zone, not a hardcoded one", () => {
    const body = buildEventBody(draft, "Europe/Berlin", false, "ttcabc12");
    expect(body.start).toEqual({ dateTime: "2026-11-19T14:00:00+01:00", timeZone: "Europe/Berlin" });
  });
  it("uses dates with an exclusive end for all-day events", () => {
    const body = buildEventBody({ ...draft, allDay: true, start: "2026-11-19", end: "2026-11-20" }, "America/New_York", false, "ttcabc12");
    expect(body.start).toEqual({ date: "2026-11-19" });
    expect(body.end).toEqual({ date: "2026-11-21" });
  });
});

describe("newEventId", () => {
  it("produces a valid base32hex Calendar event ID", () => {
    const id = newEventId("3F2504E0-4F89-11D3-9A0C-0305E82C3301");
    expect(id).toBe("ttc3f2504e04f8911d39a0c0305e82c3301");
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
  });
});
