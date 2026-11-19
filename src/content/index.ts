// Content script for calendar.google.com: mounts the launcher, the panel and
// the drag/drop + confirm UI inside one closed shadow root.
import { h, icon } from "./dom";
import { initialTimes } from "../core/draft";
import { describeCreate, describeUndo, safeEventLink } from "../core/results";
import { totalDurationMinutes } from "../core/tasks";
import { formatOffset, wallToUtcMs, zoneOffsetMinutes } from "../core/time";
import { isContextAlive, send } from "../shared/messages";
import type { CalendarContext, CreateResult, EventDraft, TaskRef } from "../shared/types";
import { readGridOffset } from "./calendarGeometry";
import { attachDrag } from "./drag";
import { DragSession, targetLabel } from "./dragSession";
import { installKeyFirewall, pushKeyHandler } from "./keys";
import { DragOverlay } from "./overlay";
import { Panel } from "./panel";
import { ConfirmPopover, type SubmitOutcome } from "./popover";
import { startDevReload } from "./devReload";
import { createDock } from "./dock";
import { createLauncher, type Launcher } from "./railButton";
import { BASE_CSS, DRAG_CSS, PANEL_CSS, POPOVER_CSS, TOAST_CSS } from "./styles";
import { Toasts, type ToastAction } from "./toast";
import { applyLook, readCalendarLook } from "./theme";

function boot(): void {
  // A previous copy of this script may have left UI behind (e.g. injected again
  // after an update). Keep our own build's UI; remove anything older.
  const existing = document.querySelector<HTMLElement>("ttc-root");
  if (existing?.dataset.build === __TTC_BUILD__) return;
  for (const stale of document.querySelectorAll("ttc-root, ttc-rail-button, ttc-dock")) stale.remove();

  const host = document.createElement("ttc-root");
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;";
  host.dataset.build = __TTC_BUILD__;
  const shadow = host.attachShadow({ mode: "closed" });
  const root = h("div", { class: "ttc" });
  shadow.append(h("style", {}, BASE_CSS + PANEL_CSS + DRAG_CSS + POPOVER_CSS + TOAST_CSS), root);
  document.body.append(host);

  const fab = h(
    "button",
    { class: "fab", type: "button", hidden: true, title: "Todoist tasks", "aria-label": "Todoist tasks", "aria-pressed": "false" },
    icon("logo"),
  );
  // Declared up front: callbacks below may fire while later pieces are still being created.
  let launcher: Launcher | null = null;
  const panel = new Panel({
    onOpenChange: (open) => {
      launcher?.setPressed(open);
      dock.setOpen(open);
      layout();
    },
  });
  const overlay = new DragOverlay();
  const popover = new ConfirmPopover();
  const toasts = new Toasts();
  root.append(panel.el, fab, overlay.el, popover.el, toasts.el);

  // Docked into Calendar's layout when possible; floating in `root` otherwise.
  const dock = createDock({ panel: panel.el, floatingRoot: root, css: BASE_CSS + PANEL_CSS, onChange: () => layout() });

  launcher = createLauncher({
    floatingButton: fab,
    onToggle: () => panel.toggle(),
    onLayoutChange: () => layout(),
  });

  /** Match Calendar's look; place the floating panel below the header, left of the rail. */
  function layout(): void {
    const look = readCalendarLook();
    applyLook(root, look);
    dock.setLook(look);
    launcher?.setTheme(look.theme);
    const railLeft = launcher?.railLeft() ?? null;
    const right = railLeft !== null ? Math.max(0, window.innerWidth - railLeft) + 4 : 8;
    const header = document.querySelector('header[role="banner"]') ?? document.querySelector("header");
    const top = header ? Math.round(header.getBoundingClientRect().bottom) + 4 : 68;
    root.style.setProperty("--ttc-right", `${right}px`);
    root.style.setProperty("--ttc-top", `${top}px`);
  }

  const session = new DragSession(overlay, () => {
    const rect = panel.rect();
    return rect ? [{ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }] : [];
  });
  attachDrag(panel.listElement, {
    begin(id) {
      if (!isContextAlive()) {
        panel.markStale();
        return 0;
      }
      panel.dispatch({ type: "dragStart", id });
      const tasks = panel.selectedTasks();
      session.start(tasks.length, totalDurationMinutes(tasks, panel.currentSettings.defaultDuration));
      return tasks.length;
    },
    move(x, y) {
      session.move(x, y);
    },
    async drop(x, y) {
      session.move(x, y);
      const target = session.finish();
      const tasks = panel.selectedTasks();
      if (!target) {
        overlay.announce("Not on a calendar slot. Nothing was created.");
        return;
      }
      const settings = panel.currentSettings;
      const duration = totalDurationMinutes(tasks, settings.defaultDuration);
      const refs: TaskRef[] = tasks.map((t) => ({ id: t.id, content: t.content, isRecurring: Boolean(t.due?.is_recurring) }));
      const times = initialTimes(target, duration);
      overlay.announce(`Dropped on ${targetLabel(target, duration)}. Confirm the event details.`);
      const context = await send("calendar/context", {});
      popover.open(
        {
          x,
          y,
          title: settings.defaultTitle,
          times,
          tasks: refs,
          defaultDuration: settings.defaultDuration,
          includeLinks: settings.includeLinks,
          notes: context.ok ? contextNotes(context.data, times) : [],
          submit: submitDraft,
        },
        () => panel.listElement.focus({ preventScroll: true }),
      );
    },
    cancel() {
      session.cancel();
      overlay.announce("Drag cancelled.");
    },
  });

  /** Heads-ups for the popover: fallback mode, sign-in prompt, time-zone mismatch. */
  function contextNotes(context: CalendarContext, times: { allDay: boolean; start: string }): string[] {
    if (!context.googleConfigured || context.googleDisabled) {
      return ["Google Calendar isn't connected, so this opens a prefilled event in a new tab for you to save. Tasks won't be checked off."];
    }
    if (!context.googleConnected) return ["You'll be asked to allow access to Google Calendar first."];
    const grid = readGridOffset();
    if (context.timeZone && grid !== null && !times.allDay) {
      const offset = zoneOffsetMinutes(context.timeZone, wallToUtcMs(times.start, context.timeZone));
      if (offset !== grid) {
        return [
          `The grid shows GMT${formatOffset(grid)}, but your calendar's time zone is ${context.timeZone} (GMT${formatOffset(offset)}). Times are created in ${context.timeZone}.`,
        ];
      }
    }
    return [];
  }

  async function submitDraft(draft: EventDraft, complete: boolean): Promise<SubmitOutcome> {
    const result = await send("event/create", { draft, complete });
    if (!result.ok) return { ok: false, message: result.error.message, retryable: result.error.kind !== "uncertain" };
    showCreateResult(result.data, draft, complete);
    return { ok: true };
  }

  function showCreateResult(result: CreateResult, draft: EventDraft, complete: boolean): void {
    const summary = describeCreate(result, draft.tasks, complete);
    const actions: ToastAction[] = [];
    if (result.mode === "api" && result.event) {
      actions.push({ label: "Undo", run: () => runUndo(result, true) });
      if (result.closed.length > 0) actions.push({ label: "Reopen tasks only", run: () => runUndo(result, false) });
    }
    const href = safeEventLink(result.event?.htmlLink);
    toasts.show({
      ...summary,
      actions,
      link: href ? { label: "Open event", href } : undefined,
      timeoutMs: summary.tone === "error" ? null : 12_000,
    });
    if (result.closed.length) panel.removeTasks(result.closed.map((t) => t.id));
    window.setTimeout(() => panel.open && void panel.refresh(), 1500);
  }

  async function runUndo(result: CreateResult, deleteEvent: boolean): Promise<void> {
    const response = await send("undo", { eventId: result.event?.id, tasks: result.closed, deleteEvent });
    if (!response.ok) {
      toasts.show({ tone: "error", message: "Undo failed", details: [response.error.message], timeoutMs: null });
    } else {
      const summary = describeUndo(response.data, deleteEvent);
      toasts.show({ ...summary, timeoutMs: summary.tone === "error" ? null : 6000 });
    }
    if (panel.open) void panel.refresh();
  }

  // Notice an extension reload/update and switch the panel to a "reload this tab" state.
  const watchdog = window.setInterval(() => {
    if (isContextAlive()) return;
    window.clearInterval(watchdog);
    popover.close();
    panel.markStale();
  }, 2000);

  layout();
  window.addEventListener("resize", layout);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", layout);
  // Calendar's theme setting changes body/html classes or styles; re-read its look.
  let themeFrame = 0;
  const themeObserver = new MutationObserver(() => {
    cancelAnimationFrame(themeFrame);
    themeFrame = requestAnimationFrame(layout);
  });
  for (const el of [document.documentElement, document.body]) themeObserver.observe(el, { attributes: true, attributeFilter: ["class", "style"] });
  installKeyFirewall((event) => {
    const path = event.composedPath();
    return path.includes(host) || path.includes(dock.host);
  });
  pushKeyHandler((event, fromUi) => panel.handleKey(event, fromUi));
  pushKeyHandler((event) => popover.handleKey(event));
  startDevReload();
}

boot();
