// Content script for calendar.google.com: mounts the launcher, the panel and
// the drag/drop + confirm UI inside one closed shadow root.
import { h, icon } from "./dom";
import { initialTimes } from "../core/draft";
import { describeCreate, describeUndo, safeEventLink } from "../core/results";
import { totalDurationMinutes } from "../core/tasks";
import { formatOffset, wallToUtcMs, zoneOffsetMinutes } from "../core/time";
import { send } from "../shared/messages";
import type { CalendarContext, CreateResult, EventDraft, TaskRef } from "../shared/types";
import { readGridOffset } from "./calendarGeometry";
import { attachDrag } from "./drag";
import { DragSession, targetLabel } from "./dragSession";
import { installKeyFirewall, pushKeyHandler } from "./keys";
import { DragOverlay } from "./overlay";
import { Panel } from "./panel";
import { ConfirmPopover, type SubmitOutcome } from "./popover";
import { createLauncher } from "./railButton";
import { BASE_CSS, DRAG_CSS, PANEL_CSS, POPOVER_CSS, TOAST_CSS } from "./styles";
import { Toasts, type ToastAction } from "./toast";
import { detectTheme } from "./theme";

function boot(): void {
  if (document.querySelector("ttc-root")) return; // already injected (e.g. extension reload)

  const host = document.createElement("ttc-root");
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;";
  const shadow = host.attachShadow({ mode: "closed" });
  const root = h("div", { class: "ttc" });
  shadow.append(h("style", {}, BASE_CSS + PANEL_CSS + DRAG_CSS + POPOVER_CSS + TOAST_CSS), root);
  document.body.append(host);

  const fab = h(
    "button",
    { class: "fab", type: "button", hidden: true, title: "Todoist tasks", "aria-label": "Todoist tasks", "aria-pressed": "false" },
    icon("logo"),
  );
  const panel = new Panel({
    onOpenChange: (open) => {
      launcher.setPressed(open);
      layout();
    },
  });
  const overlay = new DragOverlay();
  const popover = new ConfirmPopover();
  const toasts = new Toasts();
  root.append(panel.el, fab, overlay.el, popover.el, toasts.el);

  const launcher = createLauncher({
    floatingButton: fab,
    onToggle: () => panel.toggle(),
    onLayoutChange: () => layout(),
  });

  /** Theme + panel placement: just below Calendar's header, just left of the rail. */
  function layout(): void {
    const theme = detectTheme();
    root.dataset.theme = theme;
    launcher.setTheme(theme);
    const railLeft = launcher.railLeft();
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

  layout();
  window.addEventListener("resize", layout);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", layout);
  installKeyFirewall((event) => event.composedPath().includes(host));
  pushKeyHandler((event, fromUi) => panel.handleKey(event, fromUi));
  pushKeyHandler((event) => popover.handleKey(event));
}

boot();
