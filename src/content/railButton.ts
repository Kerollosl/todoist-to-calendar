// The launcher: a Todoist button in Calendar's right-hand side-panel rail
// (Keep / Tasks / Contacts / Maps), or a floating tab on the right edge when
// the rail isn't available (hidden side panel, layout change, slow load).
//
// FRAGILE: Calendar markup (inspected 2026-11-18)
//   [role="complementary"]              the side panel ("Side panel" label is localized; not used)
//     [role="tablist"]                  the rail
//       [role="tab"][data-guest-app-id] Keep, Tasks, Contacts, Maps  ← we insert after the last one
import { icon } from "./dom";
import { RAIL_CSS } from "./styles";
import type { Theme } from "./theme";

const RAIL_TAB_SELECTOR = '[role="tablist"] [role="tab"][data-guest-app-id]';
const FALLBACK_AFTER_MS = 5000;
const TICK_MS = 1000;

export type LauncherMode = "pending" | "rail" | "floating";

export interface Launcher {
  readonly mode: LauncherMode;
  /** Left edge of the rail in viewport px when docked in the rail, else null. */
  railLeft(): number | null;
  setPressed(open: boolean): void;
  setTheme(theme: Theme): void;
}

/** The top-level child of the rail's tablist that holds the last built-in app tab. */
export function findRailAnchor(doc: Document = document): Element | null {
  const tabs = doc.querySelectorAll(RAIL_TAB_SELECTOR);
  const last = tabs[tabs.length - 1];
  const tablist = last?.closest('[role="tablist"]');
  if (!last || !tablist) return null;
  const rect = tablist.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null; // side panel hidden
  let child: Element = last;
  while (child.parentElement && child.parentElement !== tablist) child = child.parentElement;
  return child;
}

export function createLauncher(opts: {
  floatingButton: HTMLButtonElement;
  onToggle: () => void;
  onLayoutChange: () => void;
}): Launcher {
  const host = document.createElement("ttc-rail-button");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = RAIL_CSS;
  const button = document.createElement("button");
  button.type = "button";
  button.title = "Todoist tasks";
  button.setAttribute("aria-label", "Todoist tasks");
  button.setAttribute("aria-pressed", "false");
  button.append(icon("logo"));
  shadow.append(style, button);

  // Keep Calendar's own rail handlers from reacting to our button.
  for (const type of ["pointerdown", "mousedown", "mouseup", "click", "dblclick"]) {
    button.addEventListener(type, (event) => event.stopPropagation());
  }
  button.addEventListener("click", () => opts.onToggle());
  opts.floatingButton.addEventListener("click", () => opts.onToggle());

  const startedAt = Date.now();
  let mode: LauncherMode = "pending";
  let lastLeft: number | null = null;
  let observed: Element | null = null;
  const observer = new MutationObserver(() => tick());

  function setMode(next: LauncherMode) {
    if (next === mode) return;
    mode = next;
    opts.floatingButton.hidden = next !== "floating";
    opts.onLayoutChange();
  }

  function tick() {
    const anchor = findRailAnchor();
    if (anchor) {
      if (anchor.nextElementSibling !== host) anchor.after(host);
      const tablist = anchor.parentElement;
      if (tablist && observed !== tablist) {
        observer.disconnect();
        observer.observe(tablist, { childList: true });
        observed = tablist;
      }
      setMode("rail");
      const left = Math.round(tablist?.getBoundingClientRect().left ?? 0);
      if (left !== lastLeft) {
        lastLeft = left;
        opts.onLayoutChange();
      }
      return;
    }
    if (host.isConnected) host.remove();
    observer.disconnect();
    observed = null;
    lastLeft = null;
    if (mode === "rail" || Date.now() - startedAt > FALLBACK_AFTER_MS) setMode("floating");
  }

  tick();
  setInterval(tick, TICK_MS);
  window.addEventListener("resize", () => tick());

  return {
    get mode() {
      return mode;
    },
    railLeft() {
      if (mode !== "rail" || !host.isConnected) return null;
      return host.parentElement?.getBoundingClientRect().left ?? null;
    },
    setPressed(open) {
      button.setAttribute("aria-pressed", String(open));
      opts.floatingButton.setAttribute("aria-pressed", String(open));
      opts.floatingButton.classList.toggle("open", open);
    },
    setTheme(theme) {
      host.dataset.theme = theme;
    },
  };
}
