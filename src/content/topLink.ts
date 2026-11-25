// The optional link belongs to the current app header. Keep it out of alternate
// screens and let native controls use the center whenever they need it.
import { topLinkView } from "../core/topLink";
import { getSettings } from "../shared/settings";
import { detectTheme } from "./theme";

const IS_CALENDAR = location.hostname === "calendar.google.com";
const CALENDAR_VIEW = /^\/calendar\/(?:u\/\d+\/)?r(?:\/(?:day|week|month|year|agenda|customday)(?:\/\d+){0,3})?\/?$/;
const BAR_SELECTOR = IS_CALENDAR
  ? 'header[role="banner"]'
  : '#content header, main header, [role="main"] header, .view_header';
const HEADER_CONTENT =
  'button, a, input, select, textarea, [role="button"], [role="link"], [role="combobox"], [contenteditable="true"], [tabindex]:not([tabindex="-1"]), img, svg';
const GAP = 8;

const CSS = `
:host { all: initial; position: fixed; display: block; width: max-content; visibility: hidden; pointer-events: none; }
:host([data-visible]) { visibility: visible; }
a { pointer-events: auto; display: block; max-width: 28vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font: 500 14px/20px "Google Sans", Roboto, system-ui, sans-serif; text-decoration: none; padding: 6px 14px; border-radius: 16px;
  color: var(--fg); background: var(--bg); border: 1px solid var(--border);
  transition: background-color 120ms ease-out; }
a:hover { background: var(--hover); }
a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
:host([data-theme="light"]) { --fg: #1f1f1f; --bg: #f0f4f9; --hover: #e1e7ef; --border: transparent; --focus: #0b57d0; }
:host([data-theme="dark"]) { --fg: #e3e3e3; --bg: #282a2c; --hover: #333537; --border: transparent; --focus: #a8c7fa; }
`;

const host = document.createElement("ttc-toplink");
const root = host.attachShadow({ mode: "closed" });
const style = document.createElement("style");
style.textContent = CSS;
const link = document.createElement("a");
link.target = "_blank";
link.rel = "noopener noreferrer";
root.append(style, link);

function isVisible(element: Element): boolean {
  return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
}

function findBar(): Element | undefined {
  if (IS_CALENDAR ? !CALENDAR_VIEW.test(location.pathname) : !/^\/app(?:\/|$)/.test(location.pathname)) return;
  if ([...document.querySelectorAll('dialog[open], [aria-modal="true"]')].some(isVisible)) return;
  return [...document.querySelectorAll(BAR_SELECTOR)].find((element) => {
    if (element.closest('aside, nav, [role="dialog"], [aria-hidden="true"], [inert]') || !isVisible(element)) return false;
    const { top, bottom } = element.getBoundingClientRect();
    return top < (IS_CALENDAR ? window.innerHeight : 56) && bottom > 0;
  });
}

function hasRoom(bar: Element, pill: DOMRect): boolean {
  const overlaps = (rect: DOMRect) =>
    rect.width > 0 && rect.height > 0 &&
    rect.left < pill.right + GAP && rect.right > pill.left - GAP &&
    rect.top < pill.bottom + GAP && rect.bottom > pill.top - GAP;

  for (const element of bar.querySelectorAll(HEADER_CONTENT)) {
    if (overlaps(element.getBoundingClientRect()) && isVisible(element)) return false;
  }

  // Date ranges and breadcrumbs may be plain text inside full-width containers.
  // Measure the text itself so the container's empty space stays available.
  const walker = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.textContent?.trim() || !text.parentElement || !isVisible(text.parentElement)) continue;
    range.selectNodeContents(text);
    if ([...range.getClientRects()].some(overlaps)) return false;
  }
  return true;
}

let observedBar: Element | undefined;
const resizeObserver = new ResizeObserver(schedulePlacement);

function placeLink(): void {
  const bar = link.hasAttribute("href") ? findBar() : undefined;
  if (bar !== observedBar) {
    resizeObserver.disconnect();
    observedBar = bar;
    observeLayout(bar);
    if (bar) {
      resizeObserver.observe(bar);
      resizeObserver.observe(link);
    }
  }
  if (!bar) {
    host.remove();
    return;
  }

  if (host.parentElement !== bar) {
    host.removeAttribute("data-visible");
    bar.append(host);
  }
  const bounds = bar.getBoundingClientRect();
  const left = Math.max(bounds.left, 0);
  const right = Math.min(bounds.right, document.documentElement.clientWidth);
  const width = link.offsetWidth;
  const height = link.offsetHeight;
  const x = (left + right - width) / 2;
  const y = (bounds.top + bounds.bottom - height) / 2;
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;

  const pill = host.getBoundingClientRect();
  host.toggleAttribute("data-visible",
    width > 0 && height > 0 &&
    pill.left >= left + GAP && pill.right <= right - GAP &&
    pill.top >= Math.max(0, bounds.top) && pill.bottom <= bounds.bottom &&
    hasRoom(bar, pill));
}

let placementFrame = 0;
function schedulePlacement(): void {
  if (placementFrame || !link.hasAttribute("href")) return;
  placementFrame = requestAnimationFrame(() => {
    placementFrame = 0;
    placeLink();
  });
}

const layoutObserver = new MutationObserver((records) => {
  if (records.some((record) => record.target !== host)) schedulePlacement();
});

const LAYOUT_ATTRS = ["class", "style", "hidden", "aria-hidden", "aria-modal", "inert", "open"];

// Watch the header itself once it is found; elsewhere only the rare signals that can
// hide it (dialogs opening, hidden/inert toggles). Until a header is found, fall back
// to watching the whole document. Header removal is caught by the ResizeObserver.
function observeLayout(bar: Element | undefined): void {
  layoutObserver.disconnect();
  if (!link.hasAttribute("href")) return;
  if (!bar) {
    layoutObserver.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: LAYOUT_ATTRS,
    });
    return;
  }
  layoutObserver.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: LAYOUT_ATTRS });
  layoutObserver.observe(document.documentElement, {
    subtree: true, attributes: true, attributeFilter: ["hidden", "aria-hidden", "aria-modal", "inert", "open"],
  });
  if (document.body) layoutObserver.observe(document.body, { childList: true });
}

function syncTheme(): void {
  const theme = detectTheme();
  if (host.dataset.theme !== theme) host.dataset.theme = theme;
}

async function render(): Promise<void> {
  const settings = await getSettings();
  const view = topLinkView(settings.topLinkUrl, settings.topLinkText);
  if (!view) {
    link.removeAttribute("href");
    layoutObserver.disconnect();
    placeLink();
    return;
  }
  link.href = view.href;
  link.textContent = view.label; // textContent only
  link.title = view.href;
  syncTheme();
  observeLayout(observedBar);
  schedulePlacement();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && ("topLinkUrl" in changes || "topLinkText" in changes)) void render();
});
window.navigation?.addEventListener("currententrychange", schedulePlacement);
window.addEventListener("resize", schedulePlacement);
document.addEventListener("scroll", schedulePlacement, { capture: true, passive: true });
// Both apps switch theme without a reload by changing html/body class or style.
const themeObserver = new MutationObserver(() => host.isConnected && syncTheme());
for (const el of [document.documentElement, document.body]) {
  if (el) themeObserver.observe(el, { attributes: true, attributeFilter: ["class", "style"] });
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncTheme);
void render();
