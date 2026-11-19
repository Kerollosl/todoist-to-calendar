// Panel filter choices → what the service worker should fetch. Pure.
import type { FilterSpec, TodoistTask } from "../shared/types";

export type FilterPreset = "default" | "today" | "overdue" | "upcoming" | "inbox" | "all" | "custom";

export const DEFAULT_QUERY = "today | overdue";

export const PRESET_LABELS: Record<FilterPreset, string> = {
  default: "Today & overdue",
  today: "Today",
  overdue: "Overdue",
  upcoming: "Upcoming (7 days)",
  inbox: "Inbox",
  all: "All tasks",
  custom: "Custom filter",
};

/** Todoist filter-language query for each query-based preset. */
const PRESET_QUERIES: Partial<Record<FilterPreset, string>> = {
  default: DEFAULT_QUERY,
  today: "today",
  overdue: "overdue",
  upcoming: "7 days",
};

export type FilterChoice = { preset: FilterPreset } | { projectId: string };

export function choiceToValue(choice: FilterChoice): string {
  return "preset" in choice ? `preset:${choice.preset}` : `project:${choice.projectId}`;
}

export function valueToChoice(value: string): FilterChoice | null {
  const [kind, ...rest] = value.split(":");
  const arg = rest.join(":");
  if (kind === "preset" && arg in PRESET_LABELS) return { preset: arg as FilterPreset };
  if (kind === "project" && arg) return { projectId: arg };
  return null;
}

export function resolveFilter(choice: FilterChoice, customQuery: string): FilterSpec {
  if ("projectId" in choice) return { kind: "project", projectId: choice.projectId };
  switch (choice.preset) {
    case "inbox":
      return { kind: "inbox" };
    case "all":
      return { kind: "all" };
    case "custom":
      return { kind: "query", query: customQuery.trim() || DEFAULT_QUERY };
    default:
      return { kind: "query", query: PRESET_QUERIES[choice.preset] ?? DEFAULT_QUERY };
  }
}

/** Manual (project) order for project-like views, due order for date-based ones. */
export function sortModeFor(choice: FilterChoice): "manual" | "due" {
  if ("projectId" in choice) return "manual";
  return choice.preset === "inbox" || choice.preset === "all" ? "manual" : "due";
}

/** Every whitespace-separated word must appear in the title, description or project name. */
export function matchesSearch(task: Pick<TodoistTask, "content" | "description">, projectName: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${task.content}\n${task.description}\n${projectName}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
