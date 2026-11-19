// Styles live inside our shadow roots, so Calendar's CSS can't leak in and ours
// can't leak out.

export const BASE_CSS = `
:host { all: initial; }
/*
 * Tokens. Surfaces/type follow Google Calendar (Material 3); task colors follow
 * Todoist. --bg, --radius and --font are overwritten at runtime with values read
 * from Calendar itself (see theme.ts), these are the fallbacks.
 */
.ttc {
  --font: "Google Sans Text", "Google Sans", Roboto, Arial, sans-serif;
  --font-display: "Google Sans", "Google Sans Text", Roboto, Arial, sans-serif;
  --bg: #ffffff; --surface: #f0f4f9; --surface-hi: #e9eef6; --menu: #f0f4f9;
  --text: #1f1f1f; --muted: #444746; --subtle: #747775;
  --divider: rgba(31, 31, 31, .08); --border: #c4c7c5;
  --hover: rgba(31, 31, 31, .08); --press: rgba(31, 31, 31, .12);
  --primary: #0b57d0; --on-primary: #ffffff; --focus: #0b57d0;
  --selected-bg: #d3e3fd; --selected-fg: #041e49;
  --accent: #dc4c3e; --accent-strong: #c3392c; --accent-soft: rgba(220, 76, 62, .12);
  --p1: #d1453b; --p2: #eb8909; --p3: #246fe0; --p4: #8e918f;
  --today: #058527; --tomorrow: #ad6200; --week: #692ec2; --overdue: #d1453b;
  --warn-bg: #fef7e0; --warn-text: #7a4f01;
  --radius: 16px;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 2px 6px 2px rgba(0, 0, 0, .15);
  font: 14px/20px var(--font);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
.ttc[data-theme="dark"] {
  --bg: #131314; --surface: #282a2c; --surface-hi: #333537; --menu: #2d2f31;
  --text: #e3e3e3; --muted: #c4c7c5; --subtle: #8e918f;
  --divider: rgba(227, 227, 227, .08); --border: #444746;
  --hover: rgba(227, 227, 227, .08); --press: rgba(227, 227, 227, .12);
  --primary: #a8c7fa; --on-primary: #062e6f; --focus: #a8c7fa;
  --selected-bg: #004a77; --selected-fg: #c2e7ff;
  --accent: #e5675a; --accent-strong: #f08a7f; --accent-soft: rgba(229, 103, 90, .2);
  --p1: #ff7066; --p2: #ff9a14; --p3: #5297ff; --p4: #8e918f;
  --today: #4caf6a; --tomorrow: #ff9a14; --week: #a970ff; --overdue: #ff7066;
  --warn-bg: #4a3a12; --warn-text: #fdd663;
  --shadow: 0 1px 3px rgba(0, 0, 0, .3), 0 4px 8px 3px rgba(0, 0, 0, .15);
}
.ttc *, .ttc *::before, .ttc *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.icon-btn {
  width: 40px; height: 40px; border-radius: 50%; border: 0; background: transparent; padding: 0;
  color: var(--muted); display: grid; place-items: center; cursor: pointer; flex: none;
  transition: background-color .15s ease, transform .12s var(--ease-out);
}
@media (hover: hover) and (pointer: fine) { .icon-btn:hover { background: var(--hover); } }
.icon-btn:active { background: var(--press); transform: scale(.94); }
.icon-btn:disabled { opacity: .38; cursor: default; background: transparent; }
.btn {
  font: 500 14px/20px var(--font-display); letter-spacing: .1px; height: 36px; padding: 0 16px; border-radius: 18px;
  border: 1px solid var(--border); background: transparent; color: var(--primary); cursor: pointer;
  white-space: nowrap; transition: background-color .15s ease, box-shadow .15s ease, transform .12s var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .btn:hover { background: color-mix(in srgb, var(--primary) 8%, transparent); }
  .btn.primary:hover { background: var(--primary); box-shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 1px 3px 1px rgba(0, 0, 0, .15); }
}
.btn:active { background: color-mix(in srgb, var(--primary) 12%, transparent); transform: scale(.97); }
.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.btn.primary:active { background: var(--primary); }
.btn.text { border-color: transparent; padding: 0 12px; }
.btn:disabled { opacity: .38; cursor: default; box-shadow: none; }
.spinner {
  width: 18px; height: 18px; border-radius: 50%; display: inline-block; vertical-align: middle;
  border: 2px solid var(--border); border-top-color: var(--primary); animation: ttc-spin .8s linear infinite;
}
@keyframes ttc-spin { to { transform: rotate(360deg); } }
.icon-btn svg.spin { animation: ttc-spin .8s linear infinite; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  /* Fewer, gentler animations: keep color/opacity feedback, drop movement and scale. */
  .ttc *, .ttc *::before, .ttc *::after { animation-duration: 0s !important; scroll-behavior: auto !important; }
  .ttc *:active { transform: none !important; }
}
`;

export const PANEL_CSS = `
/* ---- panel shell: floating fallback; .docked sits in Calendar's own side-panel slot ---- */
.panel {
  position: fixed; top: var(--ttc-top, 64px); right: var(--ttc-right, 56px); bottom: 12px; width: 320px;
  display: flex; flex-direction: column; overflow: hidden; pointer-events: auto; z-index: 2;
  background: var(--bg); border-radius: var(--radius); box-shadow: var(--shadow);
}
.panel.docked { position: relative; inset: auto; width: 100%; height: 100%; box-shadow: none; }

/* ---- header ---- */
.head { display: flex; align-items: center; gap: 0; padding: 8px 4px 0 8px; min-height: 56px; }
.spacer { flex: 1; }
.switcher {
  display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: 220px; height: 40px;
  padding: 0 4px 0 8px; border: 0; border-radius: 20px; background: transparent; cursor: pointer; color: var(--text);
  transition: background-color .15s ease;
}
@media (hover: hover) and (pointer: fine) { .switcher:hover { background: var(--hover); } }
.switcher:active { background: var(--press); }
.switcher-icon { display: grid; place-items: center; color: var(--muted); flex: none; }
.switcher-label { font: 400 20px/28px var(--font-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.switcher-chevron { display: grid; place-items: center; color: var(--muted); flex: none; transition: transform .2s ease; }
.switcher[aria-expanded="true"] .switcher-chevron { transform: rotate(180deg); }

/* ---- view menu (Material 3 menu) ---- */
.menu {
  position: absolute; top: 56px; left: 8px; z-index: 5; width: 272px; max-height: min(420px, calc(100% - 72px));
  overflow-y: auto; padding: 8px 0; border-radius: 8px; background: var(--menu); box-shadow: var(--shadow);
  overscroll-behavior: contain; transform-origin: top left; animation: ttc-menu-in .16s var(--ease-out);
}
@keyframes ttc-menu-in { from { opacity: 0; transform: scale(.96) translateY(-4px); } }
.menu-item {
  display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 16px 0 calc(16px + var(--depth, 0) * 16px);
  cursor: pointer; color: var(--text); outline: none;
}
.menu-item:hover, .menu-item:focus-visible { background: var(--hover); }
.menu-item:focus-visible { box-shadow: inset 0 0 0 2px var(--focus); }
.menu-item[aria-selected="true"] { background: var(--selected-bg); color: var(--selected-fg); }
.menu-item[aria-selected="true"] .menu-icon { color: inherit; }
.menu-icon { display: grid; place-items: center; color: var(--muted); flex: none; }
.menu-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.menu-sep { height: 1px; margin: 8px 0; background: var(--divider); }
.menu-heading { padding: 4px 16px 6px; font: 500 12px/16px var(--font-display); letter-spacing: .3px; color: var(--subtle); }

/* ---- search (pill, like Calendar's search field) ---- */
.search { position: relative; margin: 8px 12px 4px; }
.search svg { position: absolute; left: 14px; top: 12px; color: var(--muted); pointer-events: none; }
.search input {
  width: 100%; height: 40px; padding: 0 16px 0 42px; border-radius: 20px; border: 0; outline: none;
  font: 400 14px/20px var(--font); color: var(--text); background: var(--surface); transition: background-color .15s ease;
}
.search input::placeholder { color: var(--subtle); }
.search input:hover { background: var(--surface-hi); }
.search input:focus-visible { box-shadow: inset 0 0 0 2px var(--focus); }
.search input::-webkit-search-cancel-button { filter: grayscale(1); opacity: .6; }

/* ---- section pager (Todoist board columns as Material filter chips) ---- */
.pager { display: flex; align-items: center; gap: 0; padding: 4px 0 6px; border-bottom: 1px solid var(--divider); }
.pager-btn { width: 32px; height: 32px; color: var(--muted); }
.tabs {
  flex: 1; min-width: 0; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px 2px;
  scroll-padding-inline: 20px; --fade-l: 0px; --fade-r: 0px;
  mask-image: linear-gradient(90deg, transparent 0, #000 var(--fade-l), #000 calc(100% - var(--fade-r)), transparent 100%);
}
/* Fade an edge only while more chips are hidden beyond it. */
.tabs.more-left { --fade-l: 16px; }
.tabs.more-right { --fade-r: 16px; }
.tabs::-webkit-scrollbar { display: none; }
.tab {
  flex: none; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer;
  font: 500 13px/18px var(--font-display); letter-spacing: .1px;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease, transform .12s var(--ease-out);
}
@media (hover: hover) and (pointer: fine) { .tab:hover { background: var(--hover); } }
.tab:active { transform: scale(.97); }
.tab[aria-selected="true"] { background: var(--selected-bg); border-color: transparent; color: var(--selected-fg); }
.tab-count { font-weight: 400; color: var(--subtle); font-variant-numeric: tabular-nums; }
.tab[aria-selected="true"] .tab-count { color: inherit; opacity: .8; }

/* ---- status / skeleton ---- */
.status { padding: 32px 24px; color: var(--muted); text-align: center; font-size: 14px; line-height: 20px; }
.status p { margin: 0 0 16px; }
.status .actions { display: flex; gap: 8px; justify-content: center; }
.status.skeleton { padding: 8px 12px; text-align: left; }
.skel-row { display: flex; align-items: center; gap: 12px; height: 48px; padding: 0 12px; border-bottom: 1px solid var(--divider); }
.skel-ring { width: 18px; height: 18px; border-radius: 50%; background: var(--surface-hi); flex: none; }
.skel-line { height: 10px; border-radius: 5px; background: linear-gradient(90deg, var(--surface) 0%, var(--surface-hi) 50%, var(--surface) 100%); background-size: 200% 100%; animation: ttc-shimmer 1.4s ease-in-out infinite; }
@keyframes ttc-shimmer { to { background-position: -200% 0; } }

/* ---- track + pages (horizontal scroll-snap; trackpad swipe works natively) ---- */
.track {
  flex: 1; min-height: 0; display: flex; overflow-x: auto; overflow-y: hidden; outline: none;
  scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain;
}
.track::-webkit-scrollbar { display: none; }
.track:focus-visible { outline: none; } /* the active row carries the focus ring */
.page {
  flex: 0 0 100%; min-width: 0; overflow-y: auto; scroll-snap-align: start; scroll-snap-stop: always;
  padding: 4px 8px 16px; overscroll-behavior-y: contain;
}
.group-title {
  position: sticky; top: 0; z-index: 1; display: flex; gap: 8px; align-items: baseline; padding: 12px 8px 6px;
  background: var(--bg); font: 500 14px/20px var(--font-display); color: var(--text); border-bottom: 1px solid var(--divider);
}
.group-count { font: 400 12px/16px var(--font); color: var(--subtle); }
.empty { padding: 40px 16px; text-align: center; color: var(--subtle); }
.empty p { margin: 0; }

/* ---- task rows (Todoist anatomy, Calendar selection) ---- */
.row {
  position: relative; display: grid; grid-template-columns: 12px 18px minmax(0, 1fr) 20px; column-gap: 8px; align-items: start;
  padding: 10px 6px 10px calc(2px + var(--depth, 0) * 18px); border-radius: 8px; cursor: grab;
  user-select: none; -webkit-user-select: none; touch-action: pan-y; transition: background-color .12s ease;
}
.row::after { content: ""; position: absolute; left: calc(40px + var(--depth, 0) * 18px); right: 6px; bottom: 0; height: 1px; background: var(--divider); }
@media (hover: hover) and (pointer: fine) { .row:hover { background: var(--hover); } }
.row:active { background: var(--press); }
.row[aria-selected="true"] { background: var(--selected-bg); color: var(--selected-fg); }
.row[aria-selected="true"]::after, .row:hover::after { opacity: 0; }
.track:focus-visible .row.active, .track.keyboard:focus .row.active { box-shadow: inset 0 0 0 2px var(--focus); }
.grip { display: grid; place-items: center; height: 20px; color: var(--subtle); opacity: 0; transition: opacity .12s ease; }
.row[aria-selected="true"] .grip, .track.keyboard .row.active .grip { opacity: 1; }
@media (hover: hover) and (pointer: fine) { .row:hover .grip { opacity: 1; } }
.ring {
  width: 18px; height: 18px; margin-top: 1px; border-radius: 50%; border: 1.5px solid var(--ring, var(--p4));
  background: color-mix(in srgb, var(--ring, var(--p4)) 10%, transparent);
}
.ring[data-p="1"] { --ring: var(--p1); border-width: 2px; }
.ring[data-p="2"] { --ring: var(--p2); border-width: 2px; }
.ring[data-p="3"] { --ring: var(--p3); border-width: 2px; }
.ring[data-p="4"] { background: transparent; }
.row-main { min-width: 0; }
.row-title { font: 400 14px/20px var(--font); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.row-desc { margin-top: 1px; font: 400 12px/16px var(--font); color: var(--subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row[aria-selected="true"] .row-desc, .row[aria-selected="true"] .chip { color: inherit; opacity: .85; }
.row-meta { display: flex; flex-wrap: wrap; gap: 2px 10px; margin-top: 3px; font: 400 12px/16px var(--font); color: var(--subtle); }
.chip { display: inline-flex; align-items: center; gap: 4px; }
.chip.due.today { color: var(--today); }
.chip.due.tomorrow { color: var(--tomorrow); }
.chip.due.week { color: var(--week); }
.chip.due.overdue { color: var(--overdue); }
.sel-mark {
  width: 20px; height: 20px; margin-top: 0; border-radius: 50%; display: grid; place-items: center;
  background: var(--primary); color: var(--on-primary); opacity: 0; transform: scale(.8);
  transition: opacity .15s ease, transform .18s var(--ease-out);
}
.row[aria-selected="true"] .sel-mark { opacity: 1; transform: scale(1); }

/* ---- footer ---- */
.foot {
  display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 6px 8px 6px 16px;
  border-top: 1px solid var(--divider); font: 400 12px/16px var(--font); color: var(--subtle);
}
.foot .count { flex: 1; }
.foot .count strong { color: var(--text); font: 500 13px/18px var(--font-display); }

/* ---- floating launcher (fallback when the rail is hidden) ---- */
.fab {
  position: fixed; right: 0; top: 140px; width: 44px; height: 44px; border: 0;
  border-radius: 22px 0 0 22px; background: var(--bg); box-shadow: var(--shadow);
  display: grid; place-items: center; cursor: pointer; pointer-events: auto; z-index: 3;
}
.fab.open { right: calc(var(--ttc-right, 0px) + 320px); }
.fab[aria-pressed="true"] { background: var(--selected-bg); }
.list.dragging, .list.dragging .row, .track.dragging, .track.dragging .row { cursor: grabbing; }
`;

export const RAIL_CSS = `
:host { all: initial; display: block; width: 56px; height: 56px; }
button {
  width: 40px; height: 40px; margin: 8px; border-radius: 50%; border: 0; padding: 0;
  background: transparent; display: grid; place-items: center; cursor: pointer;
  transition: background-color .15s ease, transform .12s cubic-bezier(0.23, 1, 0.32, 1);
}
@media (hover: hover) and (pointer: fine) {
  button:hover { background: rgba(68, 71, 70, .08); }
  :host([data-theme="dark"]) button:hover { background: rgba(227, 227, 227, .08); }
}
button:active { transform: scale(.94); }
/* Selected = Calendar's own blue selected container, like an open Tasks/Keep panel. */
button[aria-pressed="true"] { background: #d3e3fd; }
:host([data-theme="dark"]) button[aria-pressed="true"] { background: #004a77; }
button:focus-visible { outline: 2px solid #0b57d0; outline-offset: 0; }
:host([data-theme="dark"]) button:focus-visible { outline-color: #a8c7fa; }
@media (prefers-reduced-motion: reduce) { button:active { transform: none; } }
`;

export const DRAG_CSS = `
.drag-layer { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 3; }
/* The "Todoist · N tasks" chip uses Todoist red: it's the one place the brand shows. */
.chip {
  position: fixed; left: 0; top: 0; display: flex; flex-direction: column; gap: 1px; padding: 6px 12px;
  border-radius: 8px; background: var(--accent); color: #fff; box-shadow: var(--shadow);
  font: 500 13px/18px var(--font-display); white-space: nowrap; will-change: transform;
}
.ttc[data-theme="dark"] .chip { color: #1e1f20; }
.chip-hint { font: 400 12px/16px var(--font); opacity: .92; }
.chip-hint:empty { display: none; }
.ghost {
  position: fixed; border-radius: 4px; border-left: 4px solid var(--accent); padding: 2px 6px; overflow: hidden;
  background: color-mix(in srgb, var(--accent) 30%, var(--bg)); box-shadow: var(--shadow);
}
.ghost-label { font: 500 12px/16px var(--font-display); color: var(--text); white-space: nowrap; }
`;

export const POPOVER_CSS = `
/* Modeled on Calendar's quick-create event dialog (Material 3). */
.popover-layer { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 4; }
.backdrop { position: fixed; inset: 0; pointer-events: auto; background: transparent; }
.popover {
  position: fixed; width: 380px; max-height: calc(100vh - 24px); overflow: auto; pointer-events: auto;
  background: var(--menu); color: var(--text); border-radius: 28px; box-shadow: var(--shadow);
  padding: 20px 24px 20px; will-change: transform, opacity;
}
.title-input {
  display: block; width: 100%; margin: 4px 0 16px; padding: 4px 0 6px; border: 0; border-bottom: 1px solid var(--border);
  background: transparent; color: var(--text); font: 400 22px/28px var(--font-display); outline: none; border-radius: 0;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.title-input::placeholder { color: var(--subtle); }
.title-input:focus { border-bottom-color: var(--primary); box-shadow: 0 1px 0 0 var(--primary); }
.prow { display: grid; grid-template-columns: 24px minmax(0, 1fr); column-gap: 16px; align-items: start; margin-bottom: 12px; }
.prow > .picon { display: grid; place-items: center; height: 36px; color: var(--muted); }
.when { display: grid; gap: 4px; }
.when label { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; font: 400 12px/16px var(--font); color: var(--subtle); }
.when input {
  height: 36px; width: 100%; padding: 0 8px; border: 0; border-radius: 4px; background: transparent;
  font: 400 14px/20px var(--font); color: var(--text); color-scheme: light; transition: background-color .15s ease;
}
.ttc[data-theme="dark"] .when input { color-scheme: dark; }
@media (hover: hover) and (pointer: fine) { .when input:hover { background: var(--hover); } }
.when input:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.row-inline { display: flex; justify-content: space-between; align-items: center; margin: 2px 0 0 52px; min-height: 32px; font: 400 14px/20px var(--font); }
.toggle { display: inline-flex; gap: 10px; align-items: center; cursor: pointer; }
.toggle input { accent-color: var(--primary); width: 18px; height: 18px; margin: 0; }
.hint { color: var(--subtle); font: 400 12px/16px var(--font); font-variant-numeric: tabular-nums; }
.warn {
  display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 10px; align-items: start; margin: 4px 0 12px; padding: 10px 12px;
  border-radius: 12px; background: var(--warn-bg); color: var(--warn-text); font: 400 13px/18px var(--font);
}
.warn svg { margin-top: 1px; }
.preview-head { display: flex; justify-content: space-between; align-items: baseline; min-height: 36px; padding-top: 8px; font: 500 14px/20px var(--font-display); color: var(--text); }
.preview {
  margin: 0; padding: 8px 12px 8px 30px; max-height: 176px; overflow: auto; border-radius: 12px;
  background: var(--surface); font: 400 13px/20px var(--font); color: var(--muted);
}
.preview li { overflow-wrap: anywhere; padding-left: 2px; }
.preview li::marker { color: var(--subtle); font-variant-numeric: tabular-nums; }
.error {
  margin: 4px 0 12px; padding: 10px 12px; border-radius: 12px; font: 400 13px/18px var(--font);
  background: color-mix(in srgb, var(--overdue) 14%, transparent); color: var(--overdue);
}
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.actions .primary { flex: 1 0 100%; height: 40px; border-radius: 20px; }
.actions .btn:not(.primary) { border-color: transparent; }
`;

export const TOAST_CSS = `
/* Calendar's snackbar: bottom-left, inverse surface, blue text actions. */
.toast-layer { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 5; }
.toast {
  position: fixed; left: 24px; bottom: 24px; pointer-events: auto;
  display: flex; gap: 4px; align-items: flex-start; min-width: 344px; max-width: min(560px, calc(100vw - 48px));
  padding: 6px 4px 6px 16px; border-radius: 4px; box-shadow: var(--shadow);
  background: #303030; color: #f2f2f2; --inverse-primary: #a8c7fa; will-change: transform, opacity;
  font: 400 14px/20px var(--font);
}
.ttc[data-theme="dark"] .toast { background: #e3e3e3; color: #1f1f1f; --inverse-primary: #0b57d0; }
.toast.error { box-shadow: inset 4px 0 0 #f28b82, var(--shadow); }
.ttc[data-theme="dark"] .toast.error { box-shadow: inset 4px 0 0 #b3261e, var(--shadow); }
.toast-body { flex: 1; min-width: 0; padding: 8px 0; }
.toast-message { font: 400 14px/20px var(--font); }
.toast-details { margin: 6px 0 0; padding-left: 18px; font: 400 13px/18px var(--font); opacity: .86; }
.toast-details li { overflow-wrap: anywhere; }
.toast-actions { display: flex; flex-wrap: wrap; gap: 0; align-items: center; align-self: center; }
.toast .btn.text { color: var(--inverse-primary); padding: 0 10px; }
@media (hover: hover) and (pointer: fine) {
  .toast .btn.text:hover { background: color-mix(in srgb, var(--inverse-primary) 12%, transparent); }
  .toast .icon-btn:hover { background: rgba(127, 127, 127, .16); }
}
.toast .icon-btn { color: inherit; opacity: .8; }
a.btn { display: inline-flex; align-items: center; text-decoration: none; }
`;
