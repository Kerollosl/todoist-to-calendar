import { describe, expect, it } from "vitest";
import { describeCreate, describeUndo, safeEventLink } from "../src/core/results";
import type { CreateResult, TaskRef } from "../src/shared/types";

const a: TaskRef = { id: "a", content: "Write **report**", isRecurring: false };
const b: TaskRef = { id: "b", content: "Water plants", isRecurring: true };
const c: TaskRef = { id: "c", content: "Call Sam", isRecurring: false };
const api = (over: Partial<CreateResult>): CreateResult => ({
  mode: "api",
  event: { id: "e1", timeZone: "America/New_York" },
  closed: [],
  failed: [],
  notAttempted: [],
  ...over,
});

describe("describeCreate", () => {
  it("reports full success, noting recurring tasks", () => {
    const s = describeCreate(api({ closed: [a, b] }), [a, b], true);
    expect(s.tone).toBe("success");
    expect(s.message).toBe("Event created · 2 tasks checked off");
    expect(s.details).toEqual(["“Water plants” is recurring, so it moved to its next date instead of being finished."]);
  });
  it("names every task that failed or was not attempted", () => {
    const s = describeCreate(
      api({ closed: [a], failed: [{ task: b, reason: "Todoist rate limit reached." }], notAttempted: [c] }),
      [a, b, c],
      true,
    );
    expect(s.tone).toBe("error");
    expect(s.message).toBe("Event created · 1 of 3 tasks checked off");
    expect(s.details).toEqual(["Couldn't check off “Water plants”: Todoist rate limit reached.", "Not attempted after that error: “Call Sam”"]);
  });
  it("says event only when not completing tasks", () => {
    expect(describeCreate(api({}), [a], false)).toEqual({ tone: "success", message: "Event created", details: [] });
  });
  it("explains the template fallback never completes tasks", () => {
    const s = describeCreate({ mode: "template", closed: [], failed: [], notAttempted: [] }, [a], true);
    expect(s.tone).toBe("info");
    expect(s.details[0]).toMatch(/not checked off/);
  });
});

describe("describeUndo", () => {
  it("summarises a full undo", () => {
    const s = describeUndo({ reopened: [a, c], failed: [], skippedRecurring: [], eventDeleted: true }, true);
    expect(s).toEqual({ tone: "success", message: "Undone: event deleted and 2 tasks reopened", details: [] });
  });
  it("explains skipped recurring tasks and failures", () => {
    const s = describeUndo(
      { reopened: [], failed: [{ task: c, reason: "Todoist error 404" }], skippedRecurring: [b], eventDeleted: false, eventError: "Couldn't reach Google Calendar to delete the event." },
      true,
    );
    expect(s.tone).toBe("error");
    expect(s.message).toBe("Undo didn't complete");
    expect(s.details).toEqual([
      "Couldn't reopen “Call Sam”: Todoist error 404",
      "The event was not deleted: Couldn't reach Google Calendar to delete the event.",
      "“Water plants” is recurring and keeps its new date. Move it back in Todoist if needed.",
    ]);
  });
  it("keeps the event when only reopening tasks", () => {
    expect(describeUndo({ reopened: [a], failed: [], skippedRecurring: [], eventDeleted: false }, false).message).toBe("Undone: 1 task reopened");
  });
});

describe("safeEventLink", () => {
  it("allows only Google Calendar links", () => {
    expect(safeEventLink("https://www.google.com/calendar/event?eid=abc")).toBe("https://www.google.com/calendar/event?eid=abc");
    expect(safeEventLink("https://calendar.google.com/calendar/r")).not.toBeNull();
    expect(safeEventLink("javascript:alert(1)")).toBeNull();
    expect(safeEventLink("https://evil.example/calendar")).toBeNull();
    expect(safeEventLink(undefined)).toBeNull();
  });
});
