import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDraft, TaskRef } from "../src/shared/types";

vi.mock("../src/background/todoist", () => ({ closeTask: vi.fn(), reopenTask: vi.fn() }));
vi.mock("../src/background/gcal", () => ({
  isConfigured: vi.fn(),
  isDisabled: vi.fn(),
  setDisabled: vi.fn(),
  getToken: vi.fn(),
  withToken: vi.fn(),
  calendarTimeZone: vi.fn(),
  insertEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

const chromeStub = {
  storage: { sync: { get: vi.fn(async (defaults: unknown) => defaults) } },
  tabs: { create: vi.fn(async () => ({})) },
  identity: { clearAllCachedAuthTokens: vi.fn() },
};
vi.stubGlobal("chrome", chromeStub);

const todoist = await import("../src/background/todoist");
const gcal = await import("../src/background/gcal");
const { ApiError } = await import("../src/background/errors");
const { createEvent, undo } = await import("../src/background/flow");

const a: TaskRef = { id: "a", content: "Task A", isRecurring: false };
const b: TaskRef = { id: "b", content: "Task B", isRecurring: true };
const c: TaskRef = { id: "c", content: "Task C", isRecurring: false };
let n = 0;
const draft = (over: Partial<EventDraft> = {}): EventDraft => ({
  draftId: `d${++n}`,
  title: "Todoist",
  allDay: false,
  start: "2026-11-19T14:00",
  end: "2026-11-19T14:45",
  tasks: [a, b, c],
  ...over,
});
const apiError = (kind: string, message = kind) => new ApiError({ kind: kind as never, message });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(gcal.isConfigured).mockReturnValue(true);
  vi.mocked(gcal.isDisabled).mockResolvedValue(false);
  vi.mocked(gcal.getToken).mockResolvedValue("tok");
  vi.mocked(gcal.withToken).mockImplementation(async (_interactive, fn) => fn("tok"));
  vi.mocked(gcal.calendarTimeZone).mockResolvedValue("America/New_York");
  vi.mocked(gcal.insertEvent).mockResolvedValue({ id: "evt1", htmlLink: "https://www.google.com/calendar/event?eid=x" });
  vi.mocked(todoist.closeTask).mockResolvedValue(undefined);
  vi.mocked(todoist.reopenTask).mockResolvedValue(undefined);
});

describe("createEvent", () => {
  it("creates the event with the calendar's zone, then completes tasks in order", async () => {
    const result = await createEvent(draft(), true);
    expect(result.mode).toBe("api");
    expect(result.event).toEqual({ id: "evt1", htmlLink: "https://www.google.com/calendar/event?eid=x", timeZone: "America/New_York" });
    expect(result.closed.map((t) => t.id)).toEqual(["a", "b", "c"]);
    const body = vi.mocked(gcal.insertEvent).mock.calls[0]![1];
    expect(body.description).toBe("1. Task A\n2. Task B\n3. Task C");
    expect(body.start).toEqual({ dateTime: "2026-11-19T14:00:00-05:00", timeZone: "America/New_York" });
    const insertOrder = vi.mocked(gcal.insertEvent).mock.invocationCallOrder[0]!;
    expect(Math.min(...vi.mocked(todoist.closeTask).mock.invocationCallOrder)).toBeGreaterThan(insertOrder);
  });

  it("never completes tasks when event creation fails", async () => {
    vi.mocked(gcal.insertEvent).mockRejectedValue(apiError("http", "Google Calendar error 400"));
    await expect(createEvent(draft(), true)).rejects.toMatchObject({ info: { kind: "http" } });
    expect(todoist.closeTask).not.toHaveBeenCalled();
  });

  it("never completes tasks when the outcome is uncertain", async () => {
    vi.mocked(gcal.insertEvent).mockRejectedValue(apiError("uncertain"));
    await expect(createEvent(draft(), true)).rejects.toMatchObject({ info: { kind: "uncertain" } });
    expect(todoist.closeTask).not.toHaveBeenCalled();
  });

  it("does not touch Todoist for 'Create event only'", async () => {
    const result = await createEvent(draft(), false);
    expect(result.closed).toEqual([]);
    expect(todoist.closeTask).not.toHaveBeenCalled();
  });

  it("reports a per-task failure by name and carries on", async () => {
    vi.mocked(todoist.closeTask).mockImplementation(async (id) => {
      if (id === "b") throw apiError("http", "Todoist error 404");
    });
    const result = await createEvent(draft(), true);
    expect(result.closed.map((t) => t.id)).toEqual(["a", "c"]);
    expect(result.failed).toEqual([{ task: b, reason: "Todoist error 404" }]);
    expect(result.notAttempted).toEqual([]);
  });

  it("stops at a rate limit and lists the rest as not attempted", async () => {
    vi.mocked(todoist.closeTask).mockImplementation(async (id) => {
      if (id === "b") throw apiError("rate-limit", "Todoist rate limit reached. Try again in 30s.");
    });
    const result = await createEvent(draft(), true);
    expect(result.closed).toEqual([a]);
    expect(result.failed).toEqual([{ task: b, reason: "Todoist rate limit reached. Try again in 30s." }]);
    expect(result.notAttempted).toEqual([c]);
    expect(todoist.closeTask).toHaveBeenCalledTimes(2);
  });

  it("reports a lost response as unknown and does not retry it", async () => {
    vi.mocked(todoist.closeTask).mockImplementation(async (id) => {
      if (id === "a") throw apiError("network");
    });
    const result = await createEvent(draft(), true);
    expect(result.failed[0]!.reason).toMatch(/may or may not/);
    expect(vi.mocked(todoist.closeTask).mock.calls.filter(([id]) => id === "a")).toHaveLength(1);
  });

  it("falls back to the prefilled Calendar page without the API and completes nothing", async () => {
    vi.mocked(gcal.isConfigured).mockReturnValue(false);
    const result = await createEvent(draft(), true);
    expect(result.mode).toBe("template");
    const url = (chromeStub.tabs.create.mock.calls[0] as unknown as [{ url: string }])[0].url;
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&/);
    expect(new URL(url).searchParams.get("details")).toBe("1. Task A\n2. Task B\n3. Task C");
    expect(todoist.closeTask).not.toHaveBeenCalled();
    expect(gcal.insertEvent).not.toHaveBeenCalled();
  });

  it("falls back to the prefilled page when Google sign-in is refused", async () => {
    vi.mocked(gcal.getToken).mockRejectedValue(apiError("google-auth"));
    vi.mocked(gcal.withToken).mockRejectedValue(apiError("google-auth"));
    const result = await createEvent(draft(), true);
    expect(result.mode).toBe("template");
    expect(todoist.closeTask).not.toHaveBeenCalled();
  });

  it("rejects a repeated submission of the same draft", async () => {
    const d = draft();
    await createEvent(d, false);
    await expect(createEvent(d, false)).rejects.toMatchObject({ info: { kind: "bad-request" } });
    expect(gcal.insertEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid drafts before calling any API", async () => {
    await expect(createEvent(draft({ end: "2026-11-19T13:00" }), true)).rejects.toMatchObject({ info: { kind: "bad-request" } });
    expect(gcal.insertEvent).not.toHaveBeenCalled();
  });
});

describe("undo", () => {
  it("reopens completed tasks, skips recurring ones and deletes the event", async () => {
    const result = await undo({ eventId: "evt1", tasks: [a, b, c], deleteEvent: true });
    expect(vi.mocked(todoist.reopenTask).mock.calls.map(([id]) => id)).toEqual(["a", "c"]);
    expect(result.reopened).toEqual([a, c]);
    expect(result.skippedRecurring).toEqual([b]);
    expect(result.eventDeleted).toBe(true);
    expect(gcal.deleteEvent).toHaveBeenCalledWith("tok", "evt1");
  });

  it("keeps the event when only reopening tasks", async () => {
    const result = await undo({ eventId: "evt1", tasks: [a], deleteEvent: false });
    expect(gcal.deleteEvent).not.toHaveBeenCalled();
    expect(result.eventDeleted).toBe(false);
  });

  it("reports failures by task and stops at a rate limit", async () => {
    vi.mocked(todoist.reopenTask).mockRejectedValueOnce(apiError("rate-limit", "Todoist rate limit reached."));
    const result = await undo({ eventId: "evt1", tasks: [a, c], deleteEvent: false });
    expect(result.failed).toEqual([
      { task: a, reason: "Todoist rate limit reached." },
      { task: c, reason: "Not attempted: Todoist rate limit reached." },
    ]);
    expect(todoist.reopenTask).toHaveBeenCalledTimes(1);
  });
});
