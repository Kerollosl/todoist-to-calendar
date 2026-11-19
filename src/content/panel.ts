// The in-page Todoist panel.
//
//   header   logo + view switcher ("Inbox ▾") · refresh · close
//   search   pill field
//   pager    ‹ [No section] [Group 1 3] [Group 2 5] … ›   (project views with sections)
//   track    horizontal scroll-snap pages, one per section; each page scrolls vertically
//   footer   selection count
//
// The track is the listbox (aria-activedescendant points at the keyboard
// cursor). Selection spans pages; the keyboard and shift-ranges act on the
// visible page.
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
import { buildPages, pageOrder, type Page, type Row } from "../core/sections";
import { EMPTY_SELECTION, reduceSelection, selectedInOrder, type SelectionAction, type SelectionState } from "../core/selection";
import { descriptionPreview, dueInfo, formatDuration, plainTitle, priorityLabel, projectColor, projectOrder, taskDurationMinutes } from "../core/tasks";
import { STALE_MESSAGE, isContextAlive, send } from "../shared/messages";
import { DEFAULT_SETTINGS, getSettings, sanitizeSettings, type Settings } from "../shared/settings";
import type { ErrorInfo, TodoistProject, TodoistSection, TodoistTask } from "../shared/types";
import { h, icon, type ICONS } from "./dom";

const STALE_AFTER_MS = 60 * 1000;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface MenuItem {
  value: string;
  label: string;
  icon: keyof typeof ICONS;
  color?: string;
  depth?: number;
}

export class Panel {
  readonly el: HTMLElement;
  private readonly switcher: HTMLButtonElement;
  private readonly switcherIcon: HTMLElement;
  private readonly switcherLabel: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly refreshBtn: HTMLButtonElement;
  private readonly pager: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly track: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly clearBtn: HTMLButtonElement;
  private readonly live: HTMLElement;

  private isOpen = false;
  private settings: Settings = DEFAULT_SETTINGS;
  private choice: FilterChoice | null = null;
  private search = "";
  private tasks: TodoistTask[] = [];
  private projects: TodoistProject[] = [];
  private sections: TodoistSection[] = [];
  private loading = false;
  private error: ErrorInfo | null = null;
  private loadSeq = 0;
  private loadedAt = 0;
  private pages: Page[] = [];
  private pageIndex = 0;
  /** Last page key per view, so switching views and back returns to the same section. */
  private readonly pageMemory = new Map<string, string>();
  private sel: SelectionState = EMPTY_SELECTION;
  private menuOpen = false;
  private pointerInside = false;
  private scrollFrame = 0;

  constructor(private readonly hooks: { onOpenChange: (open: boolean) => void }) {
    this.switcherIcon = h("span", { class: "switcher-icon", "aria-hidden": "true" }, icon("inbox"));
    this.switcherLabel = h("span", { class: "switcher-label" }, "Inbox");
    this.switcher = h(
      "button",
      { class: "switcher", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false", title: "Choose a project or view" },
      this.switcherIcon,
      this.switcherLabel,
      h("span", { class: "switcher-chevron", "aria-hidden": "true" }, icon("chevronDown")),
    );
    this.menu = h("div", { class: "menu", role: "listbox", "aria-label": "Projects and views", hidden: true });
    this.refreshBtn = h("button", { class: "icon-btn", type: "button", title: "Refresh", "aria-label": "Refresh tasks" }, icon("refresh"));
    const closeBtn = h("button", { class: "icon-btn", type: "button", title: "Close", "aria-label": "Close Todoist panel" }, icon("close"));
    this.searchInput = h("input", { type: "search", placeholder: "Search tasks", "aria-label": "Search tasks", autocomplete: "off", spellcheck: "false" });
    this.prevBtn = h("button", { class: "icon-btn pager-btn", type: "button", "aria-label": "Previous section" }, icon("chevronLeft"));
    this.nextBtn = h("button", { class: "icon-btn pager-btn", type: "button", "aria-label": "Next section" }, icon("chevronRight"));
    this.tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "Sections" });
    this.pager = h("div", { class: "pager", hidden: true }, this.prevBtn, this.tabs, this.nextBtn);
    this.status = h("div", { class: "status", role: "status", "aria-live": "polite", hidden: true });
    this.track = h("div", { class: "track", role: "listbox", "aria-label": "Todoist tasks", "aria-multiselectable": "true", tabindex: "0" });
    this.countEl = h("span", { class: "count" });
    this.clearBtn = h("button", { class: "btn text", type: "button", hidden: true }, "Clear");
    this.live = h("div", { class: "sr-only", "aria-live": "polite" });

    this.el = h(
      "aside",
      { class: "panel", "aria-label": "Todoist tasks", hidden: true },
      h("div", { class: "head" }, this.switcher, h("span", { class: "spacer" }), this.refreshBtn, closeBtn),
      this.menu,
      h("div", { class: "search" }, icon("search"), this.searchInput),
      this.pager,
      this.status,
      this.track,
      h("div", { class: "foot" }, this.countEl, this.clearBtn),
      this.live,
    );

    closeBtn.addEventListener("click", () => this.close());
    this.refreshBtn.addEventListener("click", () => void this.refresh());
    this.clearBtn.addEventListener("click", () => this.dispatch({ type: "clear" }));
    this.switcher.addEventListener("click", () => (this.menuOpen ? this.closeMenu(true) : this.openMenu()));
    this.menu.addEventListener("click", (event) => {
      const item = (event.target as Element).closest<HTMLElement>("[role=option]");
      if (item?.dataset.value) this.pickView(item.dataset.value);
    });
    this.searchInput.addEventListener("input", () => {
      this.search = this.searchInput.value;
      this.render();
    });
    this.tabs.addEventListener("scroll", () => this.updateTabFades(), { passive: true });
    this.prevBtn.addEventListener("click", () => this.goTo(this.pageIndex - 1));
    this.nextBtn.addEventListener("click", () => this.goTo(this.pageIndex + 1));
    this.tabs.addEventListener("click", (event) => {
      const tab = (event.target as Element).closest<HTMLElement>("[role=tab]");
      if (tab?.dataset.index) this.goTo(Number(tab.dataset.index));
    });
    this.track.addEventListener("scroll", () => {
      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = requestAnimationFrame(() => {
        const width = this.track.clientWidth;
        if (!width) return;
        const index = Math.round(this.track.scrollLeft / width);
        if (index !== this.pageIndex) this.setPage(index, false);
      });
    });
    this.track.addEventListener("click", (event) => {
      const row = (event.target as Element).closest<HTMLElement>(".row");
      if (!row?.dataset.id) return;
      this.track.classList.remove("keyboard");
      this.dispatch({ type: "click", id: row.dataset.id, shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey });
      this.track.focus({ preventScroll: true });
    });

    // Close the menu on any outside click (inside the panel, or anywhere on Calendar).
    this.el.addEventListener("pointerdown", (event) => {
      this.pointerInside = true;
      if (this.menuOpen && !event.composedPath().some((n) => n === this.menu || n === this.switcher)) this.closeMenu(false);
    });
    window.addEventListener("pointerdown", () => {
      if (!this.pointerInside && this.menuOpen) this.closeMenu(false);
      this.pointerInside = false;
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

  // ------------------------------------------------------------ public API

  get open(): boolean {
    return this.isOpen;
  }

  get listElement(): HTMLElement {
    return this.track;
  }

  get currentSettings(): Settings {
    return this.settings;
  }

  rect(): DOMRect | null {
    return this.isOpen ? this.el.getBoundingClientRect() : null;
  }

  async show(): Promise<void> {
    if (this.isOpen) return;
    this.isOpen = true;
    this.el.hidden = false;
    this.hooks.onOpenChange(true);
    // Render something useful before any await, so the panel is never blank.
    this.updateSwitcher();
    this.render();
    this.track.focus({ preventScroll: true });
    if (!isContextAlive()) {
      this.markStale();
      return;
    }
    try {
      this.settings = await getSettings();
    } catch {
      if (!isContextAlive()) {
        this.markStale();
        return;
      }
    }
    if (!this.choice) {
      this.choice = { preset: this.settings.defaultFilter };
      this.updateSwitcher();
    }
    void this.refresh(); // auto-refresh every time the panel opens
  }

  close(): void {
    if (!this.isOpen) return;
    this.closeMenu(false);
    this.isOpen = false;
    this.el.hidden = true;
    this.hooks.onOpenChange(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else void this.show();
  }

  /** The extension was reloaded under us: say so instead of failing silently. */
  markStale(): void {
    if (this.error?.kind === "stale") return;
    this.loadSeq++;
    this.loading = false;
    this.error = { kind: "stale", message: STALE_MESSAGE };
    this.render();
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
      this.sections = result.data.sections ?? [];
      this.loadedAt = Date.now();
      this.updateSwitcher();
    } else {
      this.error = result.error;
    }
    this.render();
  }

  /** Drop tasks locally (e.g. after they were completed) before the next refresh. */
  removeTasks(ids: readonly string[]): void {
    const gone = new Set(ids);
    this.tasks = this.tasks.filter((task) => !gone.has(task.id));
    this.render();
  }

  /** Selected tasks in numbering order: page by page, then row by row. */
  selectedTasks(): TodoistTask[] {
    const byId = new Map(this.tasks.map((t) => [t.id, t]));
    return selectedInOrder(this.sel, pageOrder(this.pages)).flatMap((id) => byId.get(id) ?? []);
  }

  dispatch(action: SelectionAction): void {
    const order = action.type === "sync" ? pageOrder(this.pages) : this.pageIds();
    const next = reduceSelection(this.sel, action, order);
    if (next === this.sel) return;
    this.sel = next;
    this.applySelection();
  }

  /** Keyboard handling, called from the key firewall. Returns true when handled. */
  handleKey(event: KeyboardEvent, fromUi: boolean): boolean {
    if (!this.isOpen || !fromUi) return false;
    if (this.menuOpen) return this.handleMenuKey(event);
    const mod = event.metaKey || event.ctrlKey;
    if (this.searchInput.matches(":focus")) {
      if (event.key === "ArrowDown") {
        this.track.focus();
        this.track.classList.add("keyboard");
        if (!this.sel.active) this.dispatch({ type: "move", to: "first", extend: false });
        return true;
      }
      if (event.key === "Escape" && this.searchInput.value) {
        this.searchInput.value = "";
        this.search = "";
        this.render();
        return true;
      }
      return false;
    }
    if (this.tabs.contains(this.activeElement())) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        this.goTo(this.pageIndex + (event.key === "ArrowLeft" ? -1 : 1), { focusTab: true, instant: true });
        return true;
      }
      return false;
    }
    if (!this.track.matches(":focus")) return false;
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !mod && !event.altKey) {
      // Keyboard: no animation, and put the cursor on the new page's first task.
      this.track.classList.add("keyboard");
      this.goTo(this.pageIndex + (event.key === "ArrowLeft" ? -1 : 1), { instant: true });
      this.dispatch({ type: "move", to: "first", extend: false });
      return true;
    }
    const moves: Record<string, "next" | "prev" | "first" | "last"> = { ArrowDown: "next", ArrowUp: "prev", Home: "first", End: "last" };
    const move = moves[event.key];
    if (move && !mod && !event.altKey) {
      this.track.classList.add("keyboard");
      this.dispatch({ type: "move", to: move, extend: event.shiftKey });
      return true;
    }
    if ((event.key === " " || event.key === "Enter") && !mod) {
      this.track.classList.add("keyboard");
      this.dispatch({ type: "toggleActive" });
      return true;
    }
    if (mod && event.key.toLowerCase() === "a" && !event.shiftKey) {
      this.dispatch({ type: "selectAll" });
      return true;
    }
    if (event.key === "Escape") {
      if (this.sel.selected.size > 0) this.dispatch({ type: "clear" });
      else this.close();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ view switcher

  private viewItems(): { views: MenuItem[]; projects: MenuItem[] } {
    const presets: [FilterPreset, keyof typeof ICONS][] = [
      ["inbox", "inbox"],
      ["default", "today"],
      ["today", "today"],
      ["overdue", "today"],
      ["upcoming", "upcoming"],
      ["all", "hash"],
    ];
    if (this.settings.customQuery) presets.push(["custom", "filter"]);
    const views = presets.map(([preset, ic]) => ({
      value: choiceToValue({ preset }),
      label: preset === "custom" ? this.settings.customQuery : PRESET_LABELS[preset],
      icon: ic,
    }));
    const order = projectOrder(this.projects);
    const depthOf = (p: TodoistProject): number => {
      let depth = 0;
      for (let parent = p.parent_id; parent && depth < 4; depth++) parent = this.projects.find((x) => x.id === parent)?.parent_id ?? null;
      return depth;
    };
    const projects = [...this.projects]
      .filter((p) => !p.inbox_project)
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((p) => ({ value: choiceToValue({ projectId: p.id }), label: p.name, icon: "hash" as const, color: projectColor(p.color), depth: depthOf(p) }));
    return { views, projects };
  }

  private currentItem(): MenuItem | null {
    if (!this.choice) return null;
    const value = choiceToValue(this.choice);
    const { views, projects } = this.viewItems();
    return [...views, ...projects].find((item) => item.value === value) ?? null;
  }

  private updateSwitcher(): void {
    const item = this.currentItem();
    this.switcherLabel.textContent = item?.label ?? (this.choice && "projectId" in this.choice ? "Project" : "Inbox");
    this.switcherIcon.replaceChildren(icon(item?.icon ?? "inbox"));
    this.switcherIcon.style.color = item?.color ?? "";
  }

  private openMenu(): void {
    const { views, projects } = this.viewItems();
    const current = this.choice ? choiceToValue(this.choice) : "";
    const option = (item: MenuItem) => {
      const el = h(
        "div",
        { class: "menu-item", role: "option", tabindex: "-1", "data-value": item.value, "aria-selected": String(item.value === current) },
        h("span", { class: "menu-icon", "aria-hidden": "true" }, icon(item.icon)),
        h("span", { class: "menu-label" }, item.label),
      );
      if (item.color) (el.firstElementChild as HTMLElement).style.color = item.color;
      if (item.depth) el.style.setProperty("--depth", String(item.depth));
      return el;
    };
    this.menu.replaceChildren(h("div", { role: "group", "aria-label": "Views" }, ...views.map(option)));
    if (projects.length) {
      this.menu.append(
        h("div", { class: "menu-sep", role: "separator" }),
        h("div", { role: "group", "aria-label": "Projects" }, h("div", { class: "menu-heading", "aria-hidden": "true" }, "Projects"), ...projects.map(option)),
      );
    }
    this.menu.hidden = false;
    this.menuOpen = true;
    this.switcher.setAttribute("aria-expanded", "true");
    const selected = this.menu.querySelector<HTMLElement>('[aria-selected="true"]') ?? this.menu.querySelector<HTMLElement>("[role=option]");
    selected?.focus();
    selected?.scrollIntoView({ block: "nearest" });
  }

  private closeMenu(focusSwitcher: boolean): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.menu.hidden = true;
    this.switcher.setAttribute("aria-expanded", "false");
    if (focusSwitcher) this.switcher.focus();
  }

  private pickView(value: string): void {
    const choice = valueToChoice(value);
    this.closeMenu(false);
    this.track.focus({ preventScroll: true });
    if (!choice || (this.choice && choiceToValue(this.choice) === value)) return;
    this.choice = choice;
    this.tasks = [];
    this.sections = [];
    this.sel = EMPTY_SELECTION;
    this.updateSwitcher();
    this.render();
    void this.refresh();
  }

  private handleMenuKey(event: KeyboardEvent): boolean {
    const items = [...this.menu.querySelectorAll<HTMLElement>("[role=option]")];
    const index = items.indexOf(this.activeElement() as HTMLElement);
    const focus = (i: number) => items[Math.max(0, Math.min(items.length - 1, i))]?.focus();
    switch (event.key) {
      case "ArrowDown":
        focus(index + 1);
        return true;
      case "ArrowUp":
        focus(index - 1);
        return true;
      case "Home":
        focus(0);
        return true;
      case "End":
        focus(items.length - 1);
        return true;
      case "Enter":
      case " ": {
        const value = items[index]?.dataset.value;
        if (value) this.pickView(value);
        return true;
      }
      case "Escape":
        this.closeMenu(true);
        return true;
      case "Tab":
        this.closeMenu(false);
        return false;
      default:
        return false;
    }
  }

  // ------------------------------------------------------------ pages

  private viewKey(): string {
    return this.choice ? choiceToValue(this.choice) : "";
  }

  private pageIds(): string[] {
    const page = this.pages[this.pageIndex];
    return page ? page.groups.flatMap((g) => g.rows.map((r) => r.task.id)) : [];
  }

  /** Scroll to a page; the scroll listener (or this call) updates the state. */
  private goTo(index: number, opts: { focusTab?: boolean; instant?: boolean } = {}): void {
    if (this.pages.length === 0) return;
    const target = Math.max(0, Math.min(this.pages.length - 1, index));
    this.track.scrollTo({ left: target * this.track.clientWidth, behavior: opts.instant || reducedMotion() ? "auto" : "smooth" });
    this.setPage(target, false);
    if (opts.focusTab) this.tabs.querySelector<HTMLElement>(`[data-index="${target}"]`)?.focus();
  }

  /** Fade the chip strip's edges only where more chips are hidden. */
  private updateTabFades(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.tabs;
    this.tabs.classList.toggle("more-left", scrollLeft > 1);
    this.tabs.classList.toggle("more-right", scrollLeft + clientWidth < scrollWidth - 1);
  }

  private setPage(index: number, silent: boolean): void {
    const page = this.pages[index];
    if (!page) return;
    this.pageIndex = index;
    this.pageMemory.set(this.viewKey(), page.key);
    for (const tab of this.tabs.querySelectorAll<HTMLElement>("[role=tab]")) {
      const selected = tab.dataset.index === String(index);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) {
        // Scroll the strip itself (not the page) so the active chip clears the edge fades.
        const target = tab.offsetLeft - (this.tabs.clientWidth - tab.offsetWidth) / 2;
        this.tabs.scrollTo({ left: Math.max(0, target), behavior: reducedMotion() || silent ? "auto" : "smooth" });
      }
    }
    this.prevBtn.disabled = index === 0;
    this.nextBtn.disabled = index === this.pages.length - 1;
    if (this.sel.active && !this.pageIds().includes(this.sel.active)) this.sel = { ...this.sel, active: null };
    this.applySelection();
    if (!silent && this.pages.length > 1) this.announce(`${page.title} · ${page.count} task${page.count === 1 ? "" : "s"}`);
  }

  private announce(text: string): void {
    this.live.textContent = "";
    requestAnimationFrame(() => (this.live.textContent = text));
  }

  // ------------------------------------------------------------ rendering

  private projectName(id: string): string {
    const project = this.projects.find((p) => p.id === id);
    return project ? (project.inbox_project ? "Inbox" : project.name) : "";
  }

  private render(): void {
    const now = new Date();
    const query = this.search.trim();
    const visible = this.error ? [] : this.tasks.filter((t) => matchesSearch(t, this.projectName(t.project_id), query));
    const layout = this.choice && ("projectId" in this.choice || this.choice.preset === "inbox") ? "sections" : "list";
    this.pages =
      this.error || (this.loading && this.tasks.length === 0)
        ? []
        : buildPages({
            tasks: visible,
            sections: this.sections,
            projects: this.projects,
            layout,
            listOrder: this.choice ? sortModeFor(this.choice) : "due",
            searching: query.length > 0,
            title: this.currentItem()?.label ?? "Tasks",
          });

    // Tabs
    this.tabs.replaceChildren(
      ...this.pages.map((page, i) =>
        h(
          "button",
          { class: "tab", type: "button", role: "tab", "data-index": String(i), "aria-selected": "false", tabindex: "-1" },
          h("span", { class: "tab-name" }, page.title),
          h("span", { class: "tab-count" }, String(page.count)),
        ),
      ),
    );
    this.pager.hidden = this.pages.length < 2;
    requestAnimationFrame(() => this.updateTabFades());

    // Pages
    const fragment = document.createDocumentFragment();
    for (const page of this.pages) {
      const el = h("div", { class: "page", role: "group", "aria-label": page.title });
      if (page.count === 0) {
        el.append(h("div", { class: "empty" }, h("p", {}, query ? `Nothing matches “${query}”.` : this.pages.length > 1 ? `No tasks in ${page.title}.` : "All clear. No tasks here.")));
      }
      for (const group of page.groups) {
        if (group.rows.length === 0) continue;
        if (group.title) el.append(h("div", { class: "group-title", "aria-hidden": "true" }, h("span", {}, group.title), h("span", { class: "group-count" }, String(group.rows.length))));
        for (const row of group.rows) el.append(this.renderRow(row, now));
      }
      fragment.append(el);
    }
    this.track.replaceChildren(fragment);
    this.track.hidden = this.pages.length === 0;

    // Restore the remembered section for this view.
    const remembered = this.pageMemory.get(this.viewKey());
    const index = Math.max(0, this.pages.findIndex((p) => p.key === remembered));
    this.sel = reduceSelection(this.sel, { type: "sync" }, pageOrder(this.pages));
    requestAnimationFrame(() => {
      this.track.scrollTo({ left: index * this.track.clientWidth, behavior: "auto" });
    });
    this.setPage(index, true);
    this.renderStatus();
  }

  private renderRow({ task, depth }: Row, now: Date): HTMLElement {
    const due = dueInfo(task.due, now);
    const minutes = taskDurationMinutes(task);
    const preview = descriptionPreview(task.description);
    const meta = h("div", { class: "row-meta" });
    if (due) meta.append(h("span", { class: `chip due ${due.tone}` }, icon("calendar"), due.label));
    if (task.due?.is_recurring) meta.append(h("span", { class: "chip", title: "Recurring task" }, icon("recurring")));
    if (minutes !== null) meta.append(h("span", { class: "chip", title: "Duration" }, icon("clock"), formatDuration(minutes)));
    for (const label of (task.labels ?? []).slice(0, 2)) meta.append(h("span", { class: "chip label" }, `@${label}`));
    const uiPriority = 5 - Math.min(4, Math.max(1, task.priority));
    const row = h(
      "div",
      { class: "row", role: "option", id: `ttc-task-${task.id}`, "data-id": task.id, "aria-selected": "false" },
      h("span", { class: "grip", "aria-hidden": "true" }, icon("grip")),
      h("span", { class: "ring", "data-p": String(uiPriority), title: priorityLabel(task.priority), "aria-hidden": "true" }),
      h(
        "div",
        { class: "row-main" },
        h("div", { class: "row-title" }, plainTitle(task.content)),
        preview ? h("div", { class: "row-desc" }, preview) : null,
        meta.childElementCount ? meta : null,
      ),
      h("span", { class: "sel-mark", "aria-hidden": "true" }, icon("check")),
    );
    if (depth) row.style.setProperty("--depth", String(depth));
    return row;
  }

  /** Reflect selection on existing rows without rebuilding the list. */
  private applySelection(): void {
    for (const row of this.track.querySelectorAll<HTMLElement>(".row")) {
      const id = row.dataset.id ?? "";
      row.setAttribute("aria-selected", String(this.sel.selected.has(id)));
      row.classList.toggle("active", id === this.sel.active);
    }
    if (this.sel.active) {
      this.track.setAttribute("aria-activedescendant", `ttc-task-${this.sel.active}`);
      this.track.querySelector<HTMLElement>(`[data-id="${CSS.escape(this.sel.active)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else {
      this.track.removeAttribute("aria-activedescendant");
    }
    this.renderFooter();
  }

  private renderStatus(): void {
    this.refreshBtn.disabled = this.loading;
    this.refreshBtn.firstElementChild?.classList.toggle("spin", this.loading);
    const status = this.status;
    status.replaceChildren();
    status.hidden = true;
    if (this.loading && this.tasks.length === 0 && !this.error) {
      status.hidden = false;
      status.classList.add("skeleton");
      status.setAttribute("aria-label", "Loading tasks");
      for (let i = 0; i < 5; i++) status.append(h("div", { class: "skel-row" }, h("span", { class: "skel-ring" }), h("span", { class: "skel-line", style: `width:${[72, 56, 84, 48, 64][i]}%` })));
      return;
    }
    status.classList.remove("skeleton");
    status.removeAttribute("aria-label");
    if (!this.error) return;
    status.hidden = false;
    const err = this.error;
    const actions = h("div", { class: "actions" });
    if (err.kind === "stale") {
      const reload = h("button", { class: "btn primary", type: "button" }, "Reload tab");
      reload.addEventListener("click", () => location.reload());
      actions.append(reload);
    } else if (err.kind === "no-token" || err.kind === "auth") {
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
  }

  private renderFooter(): void {
    const selected = this.sel.selected.size;
    this.clearBtn.hidden = selected === 0;
    if (this.error || this.pages.length === 0) {
      this.countEl.textContent = "";
    } else if (selected > 0) {
      this.countEl.replaceChildren(h("strong", {}, `${selected} selected`), " · drag onto the calendar");
    } else {
      this.countEl.textContent = "Select tasks, then drag them onto the calendar";
    }
  }

  private activeElement(): Element | null {
    return (this.el.getRootNode() as ShadowRoot | Document).activeElement;
  }
}
