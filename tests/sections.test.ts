import { describe, expect, it } from "vitest";
import { LIST_KEY, NO_SECTION_KEY, RESULTS_KEY, buildPages, pageOrder, treeRows, type BuildPagesInput } from "../src/core/sections";
import type { TodoistSection, TodoistTask } from "../src/shared/types";

const task = (id: string, over: Partial<TodoistTask> = {}): TodoistTask => ({
  id,
  content: id,
  description: "",
  project_id: "inbox",
  priority: 1,
  due: null,
  duration: null,
  child_order: 1,
  ...over,
});
const section = (id: string, name: string, order: number, over: Partial<TodoistSection> = {}): TodoistSection => ({
  id,
  project_id: "inbox",
  name,
  section_order: order,
  ...over,
});
const base: Omit<BuildPagesInput, "tasks" | "sections"> = {
  projects: [{ id: "inbox", name: "Inbox", child_order: 0, inbox_project: true }],
  layout: "sections",
  listOrder: "manual",
  searching: false,
  title: "Inbox",
};
const titles = (input: Partial<BuildPagesInput> & Pick<BuildPagesInput, "tasks" | "sections">) => buildPages({ ...base, ...input }).map((p) => `${p.title}:${p.count}`);

describe("buildPages (sections layout)", () => {
  const sections = [section("g2", "Group 2", 2), section("g1", "Group 1", 1), section("g3", "Group 3", 3)];
  const tasks = [task("a"), task("b", { section_id: "g1" }), task("c", { section_id: "g1", child_order: 0 }), task("d", { section_id: "g3" })];

  it("makes one page per section in section_order, with No section first", () => {
    expect(titles({ tasks, sections })).toEqual(["No section:1", "Group 1:2", "Group 2:0", "Group 3:1"]);
  });
  it("keeps empty sections (like board columns) but drops No section when it is empty", () => {
    const sectioned = tasks.filter((t) => t.section_id);
    expect(titles({ tasks: sectioned, sections })).toEqual(["Group 1:2", "Group 2:0", "Group 3:1"]);
  });
  it("drops archived and deleted sections; their tasks fall back to No section", () => {
    const withArchived = [...sections, section("old", "Old", 0, { is_archived: true }), section("del", "Deleted", 9, { is_deleted: true })];
    const pages = buildPages({ ...base, tasks: [task("x", { section_id: "old" }), task("y", { section_id: "del" })], sections: withArchived });
    expect(pages.map((p) => p.title)).toEqual(["No section", "Group 1", "Group 2", "Group 3"]);
    expect(pages[0]!.groups[0]!.rows.map((r) => r.task.id)).toEqual(["x", "y"]);
  });
  it("uses the project title for a project without sections, even when empty", () => {
    expect(titles({ tasks: [], sections: [], title: "Inbox" })).toEqual(["Inbox:0"]);
    const pages = buildPages({ ...base, tasks: [task("a")], sections: [] });
    expect(pages[0]!.key).toBe(NO_SECTION_KEY);
  });
  it("orders rows manually within a section", () => {
    const pages = buildPages({ ...base, tasks, sections });
    expect(pages[1]!.groups[0]!.rows.map((r) => r.task.id)).toEqual(["c", "b"]);
  });
});

describe("buildPages (search and list layouts)", () => {
  const sections = [section("g1", "Group 1", 1), section("g2", "Group 2", 2)];
  it("flattens a search into one Results page grouped by section, skipping empty ones", () => {
    const pages = buildPages({ ...base, searching: true, sections, tasks: [task("a"), task("b", { section_id: "g2" })] });
    expect(pages).toHaveLength(1);
    expect(pages[0]!.key).toBe(RESULTS_KEY);
    expect(pages[0]!.groups.map((g) => g.title)).toEqual(["No section", "Group 2"]);
    expect(pages[0]!.count).toBe(2);
  });
  it("groups filter views by project on a single page", () => {
    const projects = [...base.projects, { id: "work", name: "Work", child_order: 1 }];
    const pages = buildPages({
      ...base,
      projects,
      layout: "list",
      listOrder: "due",
      title: "Today & overdue",
      sections: [],
      tasks: [task("w", { project_id: "work" }), task("i")],
    });
    expect(pages.map((p) => [p.key, p.title])).toEqual([[LIST_KEY, "Today & overdue"]]);
    expect(pages[0]!.groups.map((g) => g.title)).toEqual(["Inbox", "Work"]);
  });
});

describe("treeRows", () => {
  it("nests subtasks under their parents in manual order", () => {
    const rows = treeRows([
      task("child2", { parent_id: "p", child_order: 2 }),
      task("p", { child_order: 1 }),
      task("child1", { parent_id: "p", child_order: 1 }),
      task("grandchild", { parent_id: "child1" }),
      task("q", { child_order: 2 }),
    ]);
    expect(rows.map((r) => `${r.task.id}@${r.depth}`)).toEqual(["p@0", "child1@1", "grandchild@2", "child2@1", "q@0"]);
  });
  it("treats subtasks whose parent is not listed as top level, and survives cycles", () => {
    expect(treeRows([task("orphan", { parent_id: "missing" })]).map((r) => r.depth)).toEqual([0]);
    const cyclic = treeRows([task("x", { parent_id: "y" }), task("y", { parent_id: "x" })]);
    expect(cyclic.length).toBeLessThanOrEqual(2);
  });
});

describe("pageOrder", () => {
  it("lists task IDs page by page, which is the event numbering order", () => {
    const pages = buildPages({
      ...base,
      sections: [section("g1", "Group 1", 1)],
      tasks: [task("s1", { section_id: "g1" }), task("n1"), task("n2", { child_order: 2 })],
    });
    expect(pageOrder(pages)).toEqual(["n1", "n2", "s1"]);
  });
});
