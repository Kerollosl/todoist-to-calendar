import { describe, expect, it } from "vitest";
import { DEFAULT_QUERY, choiceToValue, matchesSearch, resolveFilter, sortModeFor, valueToChoice } from "../src/core/filters";

describe("resolveFilter", () => {
  it("defaults to today | overdue", () => {
    expect(resolveFilter({ preset: "default" }, "")).toEqual({ kind: "query", query: "today | overdue" });
    expect(DEFAULT_QUERY).toBe("today | overdue");
  });
  it("maps query presets to Todoist filter queries", () => {
    expect(resolveFilter({ preset: "today" }, "")).toEqual({ kind: "query", query: "today" });
    expect(resolveFilter({ preset: "overdue" }, "")).toEqual({ kind: "query", query: "overdue" });
    expect(resolveFilter({ preset: "upcoming" }, "")).toEqual({ kind: "query", query: "7 days" });
  });
  it("uses project endpoints for inbox, all and projects", () => {
    expect(resolveFilter({ preset: "inbox" }, "")).toEqual({ kind: "inbox" });
    expect(resolveFilter({ preset: "all" }, "")).toEqual({ kind: "all" });
    expect(resolveFilter({ projectId: "6X7" }, "")).toEqual({ kind: "project", projectId: "6X7" });
  });
  it("uses the custom query, falling back to the default when blank", () => {
    expect(resolveFilter({ preset: "custom" }, " #Work & p1 ")).toEqual({ kind: "query", query: "#Work & p1" });
    expect(resolveFilter({ preset: "custom" }, "  ")).toEqual({ kind: "query", query: DEFAULT_QUERY });
  });
});

describe("choice values", () => {
  it("round-trips presets and projects", () => {
    for (const choice of [{ preset: "today" as const }, { projectId: "abc:def" }]) {
      expect(valueToChoice(choiceToValue(choice))).toEqual(choice);
    }
  });
  it("rejects unknown values", () => {
    expect(valueToChoice("preset:nope")).toBeNull();
    expect(valueToChoice("project:")).toBeNull();
    expect(valueToChoice("garbage")).toBeNull();
  });
  it("sorts project-like views manually and date views by due", () => {
    expect(sortModeFor({ projectId: "1" })).toBe("manual");
    expect(sortModeFor({ preset: "inbox" })).toBe("manual");
    expect(sortModeFor({ preset: "today" })).toBe("due");
  });
});

describe("matchesSearch", () => {
  const task = { content: "Email Sam about the Q3 report", description: "attach slides" };
  it("matches every word case-insensitively across title, description and project", () => {
    expect(matchesSearch(task, "Work", "sam REPORT")).toBe(true);
    expect(matchesSearch(task, "Work", "slides work")).toBe(true);
    expect(matchesSearch(task, "Work", "sam invoice")).toBe(false);
  });
  it("matches everything for a blank query", () => {
    expect(matchesSearch(task, "", "   ")).toBe(true);
  });
});
