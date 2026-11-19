// The in-page Todoist panel: filter, search, grouped task list, footer.
import {
  PRESET_LABELS,
  choiceToValue,
  matchesSearch,
  resolveFilter,
  sortModeFor,
  valueToChoice,
  type FilterChoice,
  type FilterPreset,
} from "../core/filters";
import { dueInfo, formatDuration, groupByProject, plainTitle, priorityColor, priorityLabel, projectOrder, taskDurationMinutes } from "../core/tasks";
import { send } from "../shared/messages";
import { DEFAULT_SETTINGS, getSettings, sanitizeSettings, type Settings } from "../shared/settings";
import type { ErrorInfo, TodoistProject, TodoistTask } from "../shared/types";
import { h, icon } from "./dom";

const STALE_AFTER_MS = 60 * 1000;

export class Panel {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly status: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly filterSelect: HTMLSelectElement;
  private readonly searchInput: HTMLInputElement;
  private readonly refreshBtn: HTMLButtonElement;

  private isOpen = false;
  private settings: Settings = DEFAULT_SETTINGS;
  private choice: FilterChoice | null = null;
  private search = "";
  private tasks: TodoistTask[] = [];
  private projects: TodoistProject[] = [];
  private loading = false;
  private error: ErrorInfo | null = null;
  private loadSeq = 0;
  private loadedAt = 0;
  private visibleIds: string[] = [];

  constructor(private readonly hooks: { onOpenChange: (open: boolean) => void }) {
    this.refreshBtn = h("button", { class: "icon-btn", type: "button", title: "Refresh", "aria-label": "Refresh tasks" }, icon("refresh"));
    const closeBtn = h("button", { class: "icon-btn", type: "button", title: "Close", "aria-label": "Close Todoist panel" }, icon("close"));
    this.filterSelect = h("select", { "aria-label": "Which tasks to show" });
    this.searchInput = h("input", { type: "search", placeholder: "Search tasks", "aria-label": "Search tasks", autocomplete: "off", spellcheck: "false" });
    this.status = h("div", { class: "status", role: "status", "aria-live": "polite" });
    this.list = h("div", { class: "list", role: "listbox", "aria-label": "Todoist tasks", "aria-multiselectable": "true", tabindex: "0" });
    this.countEl = h("span", { class: "count", "aria-live": "polite" });

    this.el = h(
      "aside",
      { class: "panel", "aria-label": "Todoist tasks", hidden: true },
      h("div", { class: "head" }, h("h2", {}, icon("logo"), "Todoist"), this.refreshBtn, closeBtn),
      h("div", { class: "controls" }, this.filterSelect, h("div", { class: "search" }, icon("search"), this.searchInput)),
      this.status,
      this.list,
      h("div", { class: "foot" }, this.countEl),
    );

    closeBtn.addEventListener("click", () => this.close());
    this.refreshBtn.addEventListener("click", () => void this.refresh());
    this.filterSelect.addEventListener("change", () => {
      const choice = valueToChoice(this.filterSelect.value);
      if (choice) {
        this.choice = choice;
        void this.refresh();
      }
    });
    this.searchInput.addEventListener("input", () => {
      this.search = this.searchInput.value;
      this.renderList();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      const next: Record<string, unknown> = { ...this.settings };
      for (const [key, change] of Object.entries(changes)) next[key] = change.newValue;
      this.settings = sanitizeSettings(next);
    });
    const maybeRefresh = () => {
      if (!this.isOpen || document.visibilityState !== "visible") return;
      const fixable = this.error && ["no-token", "auth", "offline", "network"].includes(this.error.kind);
      if (fixable || Date.now() - this.loadedAt > STALE_AFTER_MS) void this.refresh();
    };
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    window.addEventListener("online", maybeRefresh);
  }

  get open(): boolean {
    return this.isOpen;
  }

  async show(): Promise<void> {
    if (this.isOpen) return;
    this.isOpen = true;
    this.el.hidden = false;
    this.hooks.onOpenChange(true);
    this.settings = await getSettings();
    if (!this.choice) this.choice = { preset: this.settings.defaultFilter };
    this.renderFilterOptions();
    void this.refresh(); // auto-refresh every time the panel opens
    this.list.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.hidden = true;
    this.hooks.onOpenChange(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else void this.show();
  }

  rect(): DOMRect | null {
    return this.isOpen ? this.el.getBoundingClientRect() : null;
  }

  async refresh(): Promise<void> {
    if (!this.choice) return;
    const seq = ++this.loadSeq;
    this.loading = true;
    this.renderStatus();
    const result = await send("tasks/list", { filter: resolveFilter(this.choice, this.settings.customQuery) });
    if (seq !== this.loadSeq) return; // a newer request superseded this one
    this.loading = false;
    if (result.ok) {
      this.error = null;
      this.tasks = result.data.tasks;
      this.projects = result.data.projects;
      this.loadedAt = Date.now();
      this.renderFilterOptions();
    } else {
      this.error = result.error;
    }
    this.renderList();
  }

  /** Drop tasks locally (e.g. after they were completed) before the next refresh. */
  removeTasks(ids: readonly string[]): void {
    const gone = new Set(ids);
    this.tasks = this.tasks.filter((task) => !gone.has(task.id));
    this.renderList();
  }

  private projectName(id: string): string {
    const project = this.projects.find((p) => p.id === id);
    return project ? (project.inbox_project ? "Inbox" : project.name) : "";
  }

  private renderFilterOptions(): void {
    const presets: FilterPreset[] = ["default", "today", "overdue", "upcoming", "inbox", "all"];
    if (this.settings.customQuery) presets.push("custom");
    const views = h("optgroup", { label: "Views" });
    for (const preset of presets) {
      const label = preset === "custom" ? `Custom: ${this.settings.customQuery}` : PRESET_LABELS[preset];
      views.append(h("option", { value: choiceToValue({ preset }) }, label));
    }
    this.filterSelect.replaceChildren(views);
    if (this.projects.length > 0) {
      const group = h("optgroup", { label: "Projects" });
      const order = projectOrder(this.projects);
      const depth = (p: TodoistProject): number => {
        let d = 0;
        let parent = p.parent_id;
        while (parent && d < 10) {
          d++;
          parent = this.projects.find((x) => x.id === parent)?.parent_id ?? null;
        }
        return d;
      };
      for (const project of [...this.projects].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))) {
        const name = project.inbox_project ? "Inbox" : project.name;
        group.append(h("option", { value: choiceToValue({ projectId: project.id }) }, `${" ".repeat(depth(project))}${name}`));
      }
      this.filterSelect.append(group);
    }
    if (this.choice) {
      const value = choiceToValue(this.choice);
      // A project that no longer exists: fall back to the default view.
      if (![...this.filterSelect.options].some((o) => o.value === value)) this.choice = { preset: "default" };
      this.filterSelect.value = choiceToValue(this.choice);
    }
  }

  private renderStatus(): void {
    this.refreshBtn.disabled = this.loading;
    this.refreshBtn.firstElementChild?.classList.toggle("spin", this.loading);
    const status = this.status;
    status.replaceChildren();
    status.hidden = true;
    if (this.loading && this.tasks.length === 0) {
      status.hidden = false;
      status.append(h("p", {}, h("span", { class: "spinner", "aria-hidden": "true" })), h("p", {}, "Loading tasks…"));
      return;
    }
    if (this.loading) return;
    if (this.error) {
      status.hidden = false;
      const err = this.error;
      const actions = h("div", { class: "actions" });
      if (err.kind === "no-token" || err.kind === "auth") {
        const fix = h("button", { class: "btn primary", type: "button" }, err.kind === "no-token" ? "Add token" : "Fix token");
        fix.addEventListener("click", () => void send("options/open", {}));
        actions.append(fix);
      } else {
        const retry = h("button", { class: "btn", type: "button" }, "Try again");
        retry.addEventListener("click", () => void this.refresh());
        actions.append(retry);
      }
      const text =
        err.kind === "no-token"
          ? "Add your Todoist API token to see your tasks here."
          : err.kind === "offline"
            ? "You're offline. Tasks will load when you reconnect."
            : err.message;
      status.append(h("p", {}, text), actions);
      return;
    }
    if (this.visibleIds.length === 0) {
      status.hidden = false;
      status.append(
        h("p", {}, this.search.trim() ? `No tasks match “${this.search.trim()}”.` : "No tasks in this view."),
        h("p", {}, this.search.trim() ? "Try a different search." : "Pick another view above, or refresh."),
      );
    }
  }

  private renderList(): void {
    const now = new Date();
    const visible = this.error ? [] : this.tasks.filter((t) => matchesSearch(t, this.projectName(t.project_id), this.search));
    const groups = groupByProject(visible, this.projects, this.choice ? sortModeFor(this.choice) : "due");
    this.visibleIds = groups.flatMap((g) => g.tasks.map((t) => t.id));

    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const section = h("div", { role: "group", "aria-label": group.projectName });
      section.append(h("div", { class: "group-title", "aria-hidden": "true" }, h("span", {}, group.projectName), h("span", {}, String(group.tasks.length))));
      for (const task of group.tasks) section.append(this.renderRow(task, now));
      fragment.append(section);
    }
    this.list.replaceChildren(fragment);
    this.renderStatus();
    this.renderFooter();
  }

  private renderRow(task: TodoistTask, now: Date): HTMLElement {
    const due = dueInfo(task.due, now);
    const minutes = taskDurationMinutes(task);
    const color = priorityColor(task.priority);
    const meta = h("div", { class: "row-meta" });
    if (due) meta.append(h("span", { class: `due${due.overdue ? " overdue" : due.isToday ? " today" : ""}` }, due.label));
    if (task.due?.is_recurring) meta.append(h("span", { title: "Recurring task" }, icon("recurring"), "Recurring"));
    if (minutes !== null) meta.append(h("span", { title: "Duration" }, formatDuration(minutes)));
    const row = h(
      "div",
      {
        class: "row",
        role: "option",
        id: `ttc-task-${task.id}`,
        "data-id": task.id,
        "aria-selected": "false",
        title: color ? priorityLabel(task.priority) : null,
      },
      h("span", { class: "check", "aria-hidden": "true" }, icon("check")),
      h("div", { class: "row-main" }, h("div", { class: "row-title" }, plainTitle(task.content)), meta.childElementCount ? meta : null),
    );
    if (color) row.style.setProperty("--prio", color);
    return row;
  }

  private renderFooter(): void {
    const n = this.visibleIds.length;
    this.countEl.textContent = this.error ? "" : `${n} task${n === 1 ? "" : "s"}`;
  }
}
