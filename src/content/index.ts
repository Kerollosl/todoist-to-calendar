// Content script for calendar.google.com: mounts the launcher, the panel and
// the drag/drop + confirm UI inside one closed shadow root.
import { h, icon } from "./dom";
import { totalDurationMinutes } from "../core/tasks";
import { attachDrag } from "./drag";
import { DragSession, targetLabel } from "./dragSession";
import { installKeyFirewall, pushKeyHandler } from "./keys";
import { DragOverlay } from "./overlay";
import { Panel } from "./panel";
import { createLauncher } from "./railButton";
import { BASE_CSS, DRAG_CSS, PANEL_CSS } from "./styles";
import { detectTheme } from "./theme";

function boot(): void {
  if (document.querySelector("ttc-root")) return; // already injected (e.g. extension reload)

  const host = document.createElement("ttc-root");
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;";
  const shadow = host.attachShadow({ mode: "closed" });
  const root = h("div", { class: "ttc" });
  shadow.append(h("style", {}, BASE_CSS + PANEL_CSS + DRAG_CSS), root);
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
  root.append(panel.el, fab, overlay.el);

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
      overlay.announce(`Dropped on ${targetLabel(target, totalDurationMinutes(tasks, panel.currentSettings.defaultDuration))}.`);
    },
    cancel() {
      session.cancel();
      overlay.announce("Drag cancelled.");
    },
  });

  layout();
  window.addEventListener("resize", layout);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", layout);
  installKeyFirewall((event) => event.composedPath().includes(host));
  pushKeyHandler((event, fromUi) => panel.handleKey(event, fromUi));
}

boot();
