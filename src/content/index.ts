// Content script for calendar.google.com: mounts the launcher, the panel and
// the drag/drop + confirm UI inside one closed shadow root.
import { h, icon } from "./dom";
import { initialTimes } from "../core/draft";
import { totalDurationMinutes } from "../core/tasks";
import { send } from "../shared/messages";
import type { EventDraft, TaskRef } from "../shared/types";
import { attachDrag } from "./drag";
import { DragSession, targetLabel } from "./dragSession";
import { installKeyFirewall, pushKeyHandler } from "./keys";
import { DragOverlay } from "./overlay";
import { Panel } from "./panel";
import { ConfirmPopover, type SubmitOutcome } from "./popover";
import { createLauncher } from "./railButton";
import { BASE_CSS, DRAG_CSS, PANEL_CSS, POPOVER_CSS } from "./styles";
import { detectTheme } from "./theme";

function boot(): void {
  if (document.querySelector("ttc-root")) return; // already injected (e.g. extension reload)

  const host = document.createElement("ttc-root");
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;";
  const shadow = host.attachShadow({ mode: "closed" });
  const root = h("div", { class: "ttc" });
  shadow.append(h("style", {}, BASE_CSS + PANEL_CSS + DRAG_CSS + POPOVER_CSS), root);
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
  root.append(panel.el, fab, overlay.el, popover.el);

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
    drop(x, y) {
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
      overlay.announce(`Dropped on ${targetLabel(target, duration)}. Confirm the event details.`);
      popover.open(
        {
          x,
          y,
          title: settings.defaultTitle,
          times: initialTimes(target, duration),
          tasks: refs,
          defaultDuration: settings.defaultDuration,
          includeLinks: settings.includeLinks,
          notes: [],
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

  async function submitDraft(draft: EventDraft, complete: boolean): Promise<SubmitOutcome> {
    const result = await send("event/create", { draft, complete });
    if (!result.ok) return { ok: false, message: result.error.message, retryable: result.error.kind !== "uncertain" };
    return { ok: true };
  }

  layout();
  window.addEventListener("resize", layout);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", layout);
  installKeyFirewall((event) => event.composedPath().includes(host));
  pushKeyHandler((event, fromUi) => panel.handleKey(event, fromUi));
  pushKeyHandler((event) => popover.handleKey(event));
}

boot();
