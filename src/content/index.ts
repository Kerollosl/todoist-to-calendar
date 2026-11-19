// Content script for calendar.google.com: mounts the launcher, the panel and
// the drag/drop + confirm UI inside one closed shadow root.
import { h, icon } from "./dom";
import { attachDrag } from "./drag";
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

  attachDrag(panel.listElement, {
    begin(id) {
      panel.dispatch({ type: "dragStart", id });
      const count = panel.selectedTasks().length;
      overlay.start(count);
      return count;
    },
    move(x, y) {
      overlay.moveChip(x, y, "Drop on a day or time slot");
    },
    drop() {
      overlay.end("Not a calendar slot. Nothing was created.");
    },
    cancel() {
      overlay.end("Drag cancelled.");
    },
  });

  layout();
  window.addEventListener("resize", layout);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", layout);
  installKeyFirewall((event) => event.composedPath().includes(host));
  pushKeyHandler((event, fromUi) => panel.handleKey(event, fromUi));
}

boot();
