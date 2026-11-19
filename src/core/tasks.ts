// Task presentation helpers: titles, durations, grouping, due labels. Pure.
import type { TodoistDue, TodoistProject, TodoistTask } from "../shared/types";

/** The v1 API has no `url` field, so build the web-app link from the ID. */
export function taskUrl(id: string): string {
  return `https://app.todoist.com/app/task/${encodeURIComponent(id)}`;
}

/**
 * Todoist titles are lightweight markdown. Turn them into plain text for the
 * panel and the event description: `[text](url)` → `text (url)`, and drop
 * `**bold**`, `__bold__`, `~~strike~~` and `` `code` `` markers.
 */
export function plainTitle(content: string): string {
  return content
    .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
      const label = text.trim();
      return !label || label === url ? url : `${label} (${url})`;
    })
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function taskDurationMinutes(task: Pick<TodoistTask, "duration">): number | null {
  const d = task.duration;
  if (!d || !Number.isFinite(d.amount) || d.amount <= 0) return null;
  return d.unit === "day" ? d.amount * 24 * 60 : d.amount;
}

/** Sum of the durations the tasks have; `fallback` when none of them has one. */
export function totalDurationMinutes(tasks: readonly Pick<TodoistTask, "duration">[], fallback: number): number {
  let total = 0;
  let any = false;
  for (const task of tasks) {
    const minutes = taskDurationMinutes(task);
    if (minutes !== null) {
      total += minutes;
      any = true;
    }
  }
  return any ? total : fallback;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** API priority 4 is the app's red "P1"; 1 is the uncolored default. */
export function priorityColor(priority: number): string | null {
  return ({ 4: "#d1453b", 3: "#eb8909", 2: "#246fe0" } as Record<number, string>)[priority] ?? null;
}

export function priorityLabel(priority: number): string {
  return `P${5 - Math.min(4, Math.max(1, priority))}`;
}

export interface TaskGroup {
  projectId: string;
  projectName: string;
  tasks: TodoistTask[];
}

/** Projects in sidebar order: Inbox first, then a depth-first walk by child_order. */
export function projectOrder(projects: readonly TodoistProject[]): Map<string, number> {
  const children = new Map<string | null, TodoistProject[]>();
  const ids = new Set(projects.map((p) => p.id));
  for (const project of projects) {
    const parent = project.parent_id && ids.has(project.parent_id) ? project.parent_id : null;
    const list = children.get(parent) ?? [];
    list.push(project);
    children.set(parent, list);
  }
  const order = new Map<string, number>();
  const visit = (parent: string | null) => {
    const list = (children.get(parent) ?? []).sort(
      (a, b) => Number(Boolean(b.inbox_project)) - Number(Boolean(a.inbox_project)) || a.child_order - b.child_order,
    );
    for (const project of list) {
      if (!order.has(project.id)) {
        order.set(project.id, order.size);
        visit(project.id);
      }
    }
  };
  visit(null);
  return order;
}

function dueSortKey(task: TodoistTask): string {
  if (!task.due) return "9999-99-99T99:99";
  const dt = task.due.datetime ?? task.due.date;
  // Date-only tasks sort before timed ones on the same day (" " sorts before digits).
  return dt.length > 10 ? dt.slice(0, 16) : `${dt.slice(0, 10)}T `;
}

export function sortTasks(tasks: readonly TodoistTask[], mode: "manual" | "due"): TodoistTask[] {
  return [...tasks].sort((a, b) => {
    if (mode === "due") {
      const byDue = dueSortKey(a).localeCompare(dueSortKey(b));
      if (byDue !== 0) return byDue;
      if (a.priority !== b.priority) return b.priority - a.priority;
    }
    return a.child_order - b.child_order || a.id.localeCompare(b.id);
  });
}

export function groupByProject(
  tasks: readonly TodoistTask[],
  projects: readonly TodoistProject[],
  mode: "manual" | "due",
): TaskGroup[] {
  const names = new Map(projects.map((p) => [p.id, p.inbox_project ? "Inbox" : p.name]));
  const order = projectOrder(projects);
  const groups = new Map<string, TaskGroup>();
  for (const task of tasks) {
    const group = groups.get(task.project_id) ?? {
      projectId: task.project_id,
      projectName: names.get(task.project_id) ?? "Other project",
      tasks: [],
    };
    group.tasks.push(task);
    groups.set(task.project_id, group);
  }
  return [...groups.values()]
    .sort((a, b) => (order.get(a.projectId) ?? 1e9) - (order.get(b.projectId) ?? 1e9) || a.projectName.localeCompare(b.projectName))
    .map((group) => ({ ...group, tasks: sortTasks(group.tasks, mode) }));
}

export interface DueInfo {
  label: string;
  overdue: boolean;
  isToday: boolean;
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Short, human due label relative to `now` (local time), e.g. "Today 2:30 PM", "Nov 12". */
export function dueInfo(due: TodoistDue | null, now: Date, locale?: string): DueInfo | null {
  if (!due?.date) return null;
  const today = isoDate(now);
  let dateOnly = due.date.slice(0, 10);
  let time: string | null = null;
  const stamp = due.datetime ?? (due.date.length > 10 ? due.date : null);
  if (stamp) {
    // A trailing "Z" means a fixed-zone time stored in UTC; otherwise it is floating local time.
    const parsed = /Z$|[+-]\d\d:\d\d$/.test(stamp) ? new Date(stamp) : new Date(stamp.slice(0, 19));
    if (!Number.isNaN(parsed.getTime())) {
      dateOnly = isoDate(parsed);
      time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(parsed);
    }
  }
  let label: string;
  if (dateOnly === today) label = "Today";
  else if (dateOnly === shiftDays(today, 1)) label = "Tomorrow";
  else if (dateOnly === shiftDays(today, -1)) label = "Yesterday";
  else {
    const [y, m, d] = dateOnly.split("-").map(Number) as [number, number, number];
    const sameYear = y === now.getFullYear();
    label = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    }).format(new Date(y, m - 1, d));
  }
  return { label: time ? `${label} ${time}` : label, overdue: dateOnly < today, isToday: dateOnly === today };
}
