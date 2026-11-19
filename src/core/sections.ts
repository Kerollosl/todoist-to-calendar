// Turn a task list into the panel's swipeable pages. Pure.
//
//   project / Inbox view → one page per section (like Todoist's board columns),
//                          plus "No section" when tasks have none
//   filter views         → one page, grouped by project
//   while searching      → one "Results" page across every section
import type { TodoistProject, TodoistSection, TodoistTask } from "../shared/types";
import { groupByProject, sortTasks } from "./tasks";

export interface Row {
  task: TodoistTask;
  /** Subtask nesting depth (0 = top level), capped for layout. */
  depth: number;
}

export interface PageGroup {
  title: string | null;
  rows: Row[];
}

export interface Page {
  key: string;
  title: string;
  count: number;
  groups: PageGroup[];
}

export const NO_SECTION_KEY = "__none__";
export const RESULTS_KEY = "__results__";
export const LIST_KEY = "__list__";
const MAX_DEPTH = 3;

/** Parents before their subtasks, siblings in manual order. Orphaned subtasks become top level. */
export function treeRows(tasks: readonly TodoistTask[]): Row[] {
  const ids = new Set(tasks.map((t) => t.id));
  const children = new Map<string | null, TodoistTask[]>();
  for (const task of tasks) {
    const parent = task.parent_id && ids.has(task.parent_id) ? task.parent_id : null;
    const list = children.get(parent) ?? [];
    list.push(task);
    children.set(parent, list);
  }
  const rows: Row[] = [];
  const seen = new Set<string>();
  const visit = (parent: string | null, depth: number) => {
    for (const task of sortTasks(children.get(parent) ?? [], "manual")) {
      if (seen.has(task.id)) continue; // guard against parent cycles
      seen.add(task.id);
      rows.push({ task, depth: Math.min(depth, MAX_DEPTH) });
      visit(task.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

const page = (key: string, title: string, groups: PageGroup[]): Page => ({
  key,
  title,
  groups,
  count: groups.reduce((n, g) => n + g.rows.length, 0),
});

export interface BuildPagesInput {
  /** Tasks after search filtering. */
  tasks: readonly TodoistTask[];
  sections: readonly TodoistSection[];
  projects: readonly TodoistProject[];
  layout: "sections" | "list";
  /** Order for list layout. */
  listOrder: "manual" | "due";
  searching: boolean;
  /** Title for a sectionless project's single page, or the list page. */
  title: string;
}

export function buildPages(input: BuildPagesInput): Page[] {
  const { tasks, projects } = input;
  if (input.layout === "list") {
    const groups = groupByProject(tasks, projects, input.listOrder).map((g) => ({
      title: g.projectName,
      rows: g.tasks.map((task) => ({ task, depth: 0 })),
    }));
    return [page(LIST_KEY, input.title, groups)];
  }

  const sections = [...input.sections].filter((s) => !s.is_archived && !s.is_deleted).sort((a, b) => a.section_order - b.section_order);
  const known = new Set(sections.map((s) => s.id));
  const inSection = (task: TodoistTask, id: string | null) => (id === null ? !task.section_id || !known.has(task.section_id) : task.section_id === id);

  if (input.searching) {
    const groups: PageGroup[] = [];
    const loose = tasks.filter((t) => inSection(t, null));
    if (loose.length) groups.push({ title: sections.length ? "No section" : null, rows: treeRows(loose) });
    for (const section of sections) {
      const rows = treeRows(tasks.filter((t) => inSection(t, section.id)));
      if (rows.length) groups.push({ title: section.name, rows });
    }
    return [page(RESULTS_KEY, "Results", groups)];
  }

  const pages: Page[] = [];
  const loose = tasks.filter((t) => inSection(t, null));
  if (loose.length > 0 || sections.length === 0) {
    pages.push(page(NO_SECTION_KEY, sections.length ? "No section" : input.title, [{ title: null, rows: treeRows(loose) }]));
  }
  for (const section of sections) {
    pages.push(page(section.id, section.name, [{ title: null, rows: treeRows(tasks.filter((t) => inSection(t, section.id))) }]));
  }
  return pages;
}

/** Every task ID in page order, then row order: the order tasks are numbered in the event. */
export function pageOrder(pages: readonly Page[]): string[] {
  return pages.flatMap((p) => p.groups.flatMap((g) => g.rows.map((r) => r.task.id)));
}
