import { describe, expect, it } from "vitest";
import {
  descriptionPreview,
  dueInfo,
  formatDuration,
  groupByProject,
  plainTitle,
  priorityColor,
  priorityLabel,
  projectColor,
  taskDurationMinutes,
  taskUrl,
  totalDurationMinutes,
} from "../src/core/tasks";
import type { TodoistProject, TodoistTask } from "../src/shared/types";

const task = (over: Partial<TodoistTask>): TodoistTask => ({
  id: "1",
  content: "Task",
  description: "",
  project_id: "p1",
  priority: 1,
  due: null,
  duration: null,
  child_order: 1,
  ...over,
});

describe("plainTitle", () => {
  it("turns markdown links into text (url)", () => {
    expect(plainTitle("Read [the spec](https://example.com/spec) today")).toBe("Read the spec (https://example.com/spec) today");
    expect(plainTitle("[https://a.b](https://a.b)")).toBe("https://a.b");
  });
  it("strips emphasis markers and collapses whitespace", () => {
    expect(plainTitle("  **Call**  ~~Bob~~ `now`  __ok__ ")).toBe("Call Bob now ok");
  });
  it("leaves single underscores and asterisks alone", () => {
    expect(plainTitle("fix snake_case and 2*3")).toBe("fix snake_case and 2*3");
  });
});

describe("durations", () => {
  it("reads minute and day durations", () => {
    expect(taskDurationMinutes(task({ duration: { amount: 45, unit: "minute" } }))).toBe(45);
    expect(taskDurationMinutes(task({ duration: { amount: 1, unit: "day" } }))).toBe(1440);
    expect(taskDurationMinutes(task({ duration: null }))).toBeNull();
  });
  it("sums the durations that exist, else uses the fallback", () => {
    const tasks = [task({ duration: { amount: 45, unit: "minute" } }), task({}), task({ duration: { amount: 15, unit: "minute" } })];
    expect(totalDurationMinutes(tasks, 30)).toBe(60);
    expect(totalDurationMinutes([task({}), task({})], 30)).toBe(30);
    expect(totalDurationMinutes([], 25)).toBe(25);
  });
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(95)).toBe("1h 35m");
  });
});

describe("priority", () => {
  it("maps API priority to app labels and colors", () => {
    expect(priorityLabel(4)).toBe("P1");
    expect(priorityLabel(1)).toBe("P4");
    expect(priorityColor(4)).toBe("#d1453b");
    expect(priorityColor(1)).toBeNull();
  });
});

describe("taskUrl", () => {
  it("builds the web app link", () => {
    expect(taskUrl("6X7rM8997g3RQmvh")).toBe("https://app.todoist.com/app/task/6X7rM8997g3RQmvh");
  });
});

describe("groupByProject", () => {
  const projects: TodoistProject[] = [
    { id: "work", name: "Work", child_order: 2 },
    { id: "inbox", name: "Inbox", child_order: 9, inbox_project: true },
    { id: "home", name: "Home", child_order: 1 },
    { id: "sub", name: "Sub", child_order: 1, parent_id: "work" },
  ];
  it("orders groups Inbox first, then sidebar order with children after parents", () => {
    const tasks = [
      task({ id: "a", project_id: "sub" }),
      task({ id: "b", project_id: "work" }),
      task({ id: "c", project_id: "inbox" }),
      task({ id: "d", project_id: "home" }),
    ];
    expect(groupByProject(tasks, projects, "manual").map((g) => g.projectName)).toEqual(["Inbox", "Home", "Work", "Sub"]);
  });
  it("sorts by due date, then priority, in due mode", () => {
    const tasks = [
      task({ id: "late", due: { date: "2026-11-20", is_recurring: false } }),
      task({ id: "timed", due: { date: "2026-11-18", datetime: "2026-11-18T09:00:00", is_recurring: false } }),
      task({ id: "anytime-p1", priority: 4, due: { date: "2026-11-18", is_recurring: false } }),
      task({ id: "anytime-p4", priority: 1, due: { date: "2026-11-18", is_recurring: false } }),
      task({ id: "none" }),
    ];
    expect(groupByProject(tasks, [{ id: "p1", name: "P", child_order: 1 }], "due")[0]!.tasks.map((t) => t.id)).toEqual([
      "anytime-p1",
      "anytime-p4",
      "timed",
      "late",
      "none",
    ]);
  });
  it("puts unknown projects last", () => {
    const groups = groupByProject([task({ id: "x", project_id: "gone" }), task({ id: "y", project_id: "home" })], projects, "manual");
    expect(groups.map((g) => g.projectName)).toEqual(["Home", "Other project"]);
  });
});

describe("dueInfo", () => {
  const now = new Date(2026, 10, 18, 12, 0); // Wed Nov 18 2026, local time
  it("labels today, tomorrow, yesterday and overdue", () => {
    expect(dueInfo({ date: "2026-11-18", is_recurring: false }, now, "en-US")).toEqual({ label: "Today", overdue: false, isToday: true, tone: "today" });
    expect(dueInfo({ date: "2026-11-19", is_recurring: false }, now, "en-US")?.label).toBe("Tomorrow");
    expect(dueInfo({ date: "2026-11-17", is_recurring: false }, now, "en-US")).toEqual({ label: "Yesterday", overdue: true, isToday: false, tone: "overdue" });
    expect(dueInfo({ date: "2026-11-02", is_recurring: false }, now, "en-US")).toEqual({ label: "Nov 2", overdue: true, isToday: false, tone: "overdue" });
    expect(dueInfo({ date: "2027-01-05", is_recurring: false }, now, "en-US")?.label).toBe("Jan 5, 2027");
  });
  it("adds the time for floating datetimes", () => {
    expect(dueInfo({ date: "2026-11-18", datetime: "2026-11-18T14:30:00", is_recurring: false }, now, "en-US")?.label).toBe("Today 2:30 PM");
  });
  it("uses Todoist's date tones", () => {
    expect(dueInfo({ date: "2026-11-19", is_recurring: false }, now)?.tone).toBe("tomorrow");
    expect(dueInfo({ date: "2026-11-24", is_recurring: false }, now)?.tone).toBe("week");
    expect(dueInfo({ date: "2026-11-25", is_recurring: false }, now)?.tone).toBe("later");
  });
  it("returns null without a due date", () => {
    expect(dueInfo(null, now)).toBeNull();
  });
});

describe("project colors and description preview", () => {
  it("maps Todoist color names and falls back to charcoal", () => {
    expect(projectColor("berry_red")).toBe("#b8256f");
    expect(projectColor("nonsense")).toBe("#808080");
    expect(projectColor(undefined)).toBe("#808080");
  });
  it("previews the first non-empty description line as plain text", () => {
    expect(descriptionPreview("\n  \nSee **notes** [here](https://x.y)\nsecond")).toBe("See notes here (https://x.y)");
    expect(descriptionPreview("")).toBe("");
  });
});
