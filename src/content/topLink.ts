// A user-set link centered in the top bar of Google Calendar and Todoist.
// Separate content script (topLink.js) so it runs on both hosts without the
// Calendar-only panel code. Lives in its own closed shadow root, fixed to the
// viewport, so it relies on no page DOM except the header heights below.
//
// FRAGILE but harmless (verified 2026-11-19): Calendar's header is 64px tall;
// Todoist's view header row is ~56px. Wrong values only shift the link up/down.
import { topLinkView } from "../core/topLink";
import { getSettings } from "../shared/settings";
import { detectTheme } from "./theme";

const BAR_HEIGHT = location.hostname === "calendar.google.com" ? 64 : 56;

const CSS = `
:host { all: initial; position: fixed; top: 0; left: 50%; transform: translateX(-50%); height: ${BAR_HEIGHT}px;
  display: flex; align-items: center; z-index: 999; pointer-events: none; }
a { pointer-events: auto; display: inline-block; max-width: 28vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font: 500 14px/20px "Google Sans", Roboto, system-ui, sans-serif; text-decoration: none; padding: 6px 14px; border-radius: 16px;
  color: var(--fg); background: var(--bg); border: 1px solid var(--border);
  animation: in 160ms cubic-bezier(0.22, 1, 0.36, 1); transition: background-color 120ms ease-out; }
a:hover { background: var(--hover); }
a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
:host([data-theme="light"]) { --fg: #1f1f1f; --bg: #f0f4f9; --hover: #e1e7ef; --border: transparent; --focus: #0b57d0; }
:host([data-theme="dark"]) { --fg: #e3e3e3; --bg: #282a2c; --hover: #333537; --border: transparent; --focus: #a8c7fa; }
@keyframes in { from { opacity: 0; transform: translateY(-4px); } }
@media (prefers-reduced-motion: reduce) { @keyframes in { from { opacity: 0; } } }
@media (max-width: 900px) { :host { display: none; } }
`;

const host = document.createElement("ttc-toplink");
const root = host.attachShadow({ mode: "closed" });
const style = document.createElement("style");
style.textContent = CSS;
const link = document.createElement("a");
link.target = "_blank";
link.rel = "noopener noreferrer";
root.append(style, link);

function syncTheme(): void {
  const theme = detectTheme();
  if (host.dataset.theme !== theme) host.dataset.theme = theme;
}

async function render(): Promise<void> {
  const settings = await getSettings();
  const view = topLinkView(settings.topLinkUrl, settings.topLinkText);
  if (!view) {
    host.remove();
    return;
  }
  link.href = view.href;
  link.textContent = view.label; // textContent only
  link.title = view.href;
  syncTheme();
  if (!host.isConnected) document.documentElement.append(host);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && ("topLinkUrl" in changes || "topLinkText" in changes)) void render();
});
// Both apps switch theme without a reload; a cheap poll keeps the pill matching.
setInterval(() => host.isConnected && syncTheme(), 3000);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncTheme);
void render();
