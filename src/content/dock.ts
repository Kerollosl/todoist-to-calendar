// dock.ts: put the panel *into* Calendar's layout, the way its own Tasks and
// Keep side panels open, so the grid shrinks and every day stays visible and
// droppable.
//
// FRAGILE: Calendar markup (inspected 2026-11-18)
//   [role="complementary"] holding the rail's [role="tablist"] is a child of a
//   flex row:  [left sidebar] [main column] … [0-width slot for Calendar's
//   own panels] [rail] [bottom]. We insert <ttc-dock> right before the rail.
//   Being a fixed-width flex item, it narrows the main column (verified:
//   408px → 88px in a 736px window, restored on removal).
// If the row can't be found, or Calendar keeps removing our element, we fall
// back to the floating panel.
import type { CalendarLook } from "./theme";
import { applyLook } from "./theme";

const DOCK_WIDTH = 320;
const GAP = 16; // Calendar's gap between its cards and the rail
const MAX_REINSERTS = 6;

export interface Dock {
  readonly host: HTMLElement;
  readonly docked: boolean;
  setOpen(open: boolean): void;
  setLook(look: CalendarLook): void;
}

export function findDockRow(doc: Document = document): { row: HTMLElement; rail: HTMLElement } | null {
  const rail = doc.querySelector('[role="complementary"] [role="tablist"]')?.closest<HTMLElement>('[role="complementary"]');
  const row = rail?.parentElement;
  if (!rail || !row || !getComputedStyle(row).display.includes("flex")) return null;
  if (rail.getBoundingClientRect().width === 0) return null; // side panel hidden
  return { row, rail };
}

export function createDock(opts: { panel: HTMLElement; floatingRoot: HTMLElement; css: string; onChange: () => void }): Dock {
  const host = document.createElement("ttc-dock");
  host.style.cssText = `all: initial; display: block; flex: 0 0 ${DOCK_WIDTH + GAP}px; width: ${DOCK_WIDTH + GAP}px; align-self: stretch; box-sizing: border-box; padding: 0 ${GAP}px ${GAP}px 0; min-height: 0;`;
  const shadow = host.attachShadow({ mode: "closed" });
  const wrapper = document.createElement("div");
  wrapper.className = "ttc";
  wrapper.style.cssText = "height: 100%;";
  const style = document.createElement("style");
  style.textContent = opts.css;
  shadow.append(style, wrapper);

  let open = false;
  let docked = false;
  let reinserts = 0;
  let observer: MutationObserver | null = null;
  let timer = 0;

  const nudgeCalendar = () => window.dispatchEvent(new Event("resize")); // let Calendar re-measure its grid

  function float(): void {
    docked = false;
    observer?.disconnect();
    host.remove();
    opts.panel.classList.remove("docked");
    if (opts.panel.parentElement !== opts.floatingRoot) opts.floatingRoot.prepend(opts.panel);
  }

  function dock(): boolean {
    const found = findDockRow();
    if (!found) return false;
    if (host.parentElement !== found.row || host.nextElementSibling !== found.rail) found.rail.before(host);
    if (opts.panel.parentElement !== wrapper) wrapper.append(opts.panel);
    opts.panel.classList.add("docked");
    if (!docked) {
      observer?.disconnect();
      observer = new MutationObserver(() => {
        if (!open || host.isConnected) return;
        if (++reinserts > MAX_REINSERTS) {
          float();
          opts.onChange();
          return;
        }
        if (!dock()) float();
        opts.onChange();
      });
      observer.observe(found.row, { childList: true });
    }
    docked = true;
    return true;
  }

  function check(): void {
    if (!open) return;
    // The row itself may be replaced on some navigations; re-find it.
    if (docked && !host.isConnected && !dock()) {
      float();
      opts.onChange();
    }
  }

  return {
    host,
    get docked() {
      return docked;
    },
    setOpen(next) {
      if (next === open) return;
      open = next;
      if (open) {
        reinserts = 0;
        if (!dock()) float();
        timer = window.setInterval(check, 1000);
      } else {
        window.clearInterval(timer);
        observer?.disconnect();
        observer = null;
        host.remove(); // give Calendar its full width back
        docked = false;
      }
      nudgeCalendar();
      opts.onChange();
    },
    setLook(look) {
      applyLook(wrapper, look);
    },
  };
}
