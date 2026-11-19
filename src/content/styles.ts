// Styles live inside our shadow roots, so Calendar's CSS can't leak in and ours
// can't leak out.

export const BASE_CSS = `
:host { all: initial; }
.ttc {
  --bg: #ffffff; --surface: #f0f4f9; --text: #1f1f1f; --muted: #444746; --subtle: #747775;
  --border: #c4c7c5; --hover: rgba(31, 31, 31, .06); --focus: #0b57d0;
  --accent: #dc4c3e; --accent-strong: #c3392c; --accent-soft: rgba(220, 76, 62, .12);
  --overdue: #d1453b; --today: #058527; --warn-bg: #fef7e0; --warn-text: #7a4f01;
  --shadow: 0 2px 6px rgba(0, 0, 0, .12), 0 8px 24px rgba(0, 0, 0, .14);
  font: 14px/1.4 "Google Sans Text", "Google Sans", Roboto, Arial, sans-serif;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
.ttc[data-theme="dark"] {
  --bg: #1e1f20; --surface: #282a2c; --text: #e3e3e3; --muted: #c4c7c5; --subtle: #8e918f;
  --border: #444746; --hover: rgba(227, 227, 227, .08); --focus: #a8c7fa;
  --accent: #e5675a; --accent-strong: #f08a7f; --accent-soft: rgba(229, 103, 90, .2);
  --overdue: #f28b82; --today: #81c995; --warn-bg: #4a3a12; --warn-text: #fdd663;
  --shadow: 0 2px 6px rgba(0, 0, 0, .4), 0 8px 24px rgba(0, 0, 0, .5);
}
.ttc *, .ttc *::before, .ttc *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; }
.icon-btn {
  width: 32px; height: 32px; border-radius: 50%; border: 0; background: transparent;
  color: var(--muted); display: grid; place-items: center; cursor: pointer; flex: none;
}
.icon-btn:hover { background: var(--hover); }
.icon-btn:disabled { opacity: .4; cursor: default; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.btn {
  font-weight: 500; font-size: 13px; height: 32px; padding: 0 14px; border-radius: 16px;
  border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer;
  white-space: nowrap;
}
.btn:hover { background: var(--hover); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.primary:hover { background: var(--accent-strong); border-color: var(--accent-strong); }
.ttc[data-theme="dark"] .btn.primary { color: #1e1f20; }
.btn.text { border-color: transparent; color: var(--accent); padding: 0 8px; }
.btn:disabled { opacity: .5; cursor: default; }
.spinner {
  width: 18px; height: 18px; border-radius: 50%; display: inline-block; vertical-align: middle;
  border: 2px solid var(--border); border-top-color: var(--accent); animation: ttc-spin .8s linear infinite;
}
@keyframes ttc-spin { to { transform: rotate(360deg); } }
.icon-btn svg.spin { animation: ttc-spin .8s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .ttc *, .ttc *::before, .ttc *::after { animation-duration: 0s !important; transition: none !important; }
}
`;

export const PANEL_CSS = `
.panel {
  position: fixed; top: var(--ttc-top, 64px); right: var(--ttc-right, 56px); bottom: 12px; width: 320px;
  display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--border);
  border-radius: 16px; box-shadow: var(--shadow); overflow: hidden; pointer-events: auto; z-index: 2;
}
.head { display: flex; align-items: center; gap: 6px; padding: 10px 8px 2px 16px; }
.head h2 { margin: 0; flex: 1; font: 500 16px/24px "Google Sans", Roboto, Arial, sans-serif; display: flex; align-items: center; gap: 8px; }
.controls { display: grid; gap: 8px; padding: 8px 16px 10px; }
.controls select, .controls input {
  width: 100%; height: 36px; font: inherit; color: var(--text); background: var(--surface);
  border: 1px solid transparent; border-radius: 8px; padding: 0 10px;
}
.controls select:focus-visible, .controls input:focus-visible { outline: 2px solid var(--focus); outline-offset: -1px; }
.search { position: relative; }
.search svg { position: absolute; left: 10px; top: 10px; color: var(--subtle); pointer-events: none; }
.search input { padding-left: 34px; }
.status { padding: 28px 20px; color: var(--muted); text-align: center; font-size: 13px; line-height: 1.5; }
.status p { margin: 0 0 12px; }
.status .actions { display: flex; gap: 8px; justify-content: center; }
.list { flex: 1; overflow-y: auto; padding: 0 8px 8px; overscroll-behavior: contain; outline: none; }
.group-title {
  position: sticky; top: 0; z-index: 1; background: var(--bg); display: flex; justify-content: space-between;
  font-size: 12px; font-weight: 500; color: var(--muted); padding: 10px 8px 4px;
}
.row {
  display: flex; gap: 10px; align-items: flex-start; margin: 1px 0; padding: 7px 8px 7px 8px;
  border-radius: 8px; border-left: 3px solid var(--prio, transparent); cursor: grab; user-select: none;
  -webkit-user-select: none; touch-action: none;
}
.row:hover { background: var(--hover); }
.row[aria-selected="true"] { background: var(--accent-soft); }
.list:focus-visible .row.active, .list.keyboard .row.active { box-shadow: inset 0 0 0 2px var(--focus); }
.check {
  flex: none; width: 16px; height: 16px; margin-top: 2px; border-radius: 4px; border: 2px solid var(--subtle);
  display: grid; place-items: center; color: transparent;
}
.row[aria-selected="true"] .check { background: var(--accent); border-color: var(--accent); color: #fff; }
.row-main { min-width: 0; flex: 1; }
.row-title {
  line-height: 20px; overflow-wrap: anywhere; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
.row-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; margin-top: 2px; font-size: 12px; color: var(--subtle); }
.row-meta span { display: inline-flex; align-items: center; gap: 3px; }
.due.overdue { color: var(--overdue); }
.due.today { color: var(--today); }
.foot {
  display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 8px 12px 8px 16px;
  border-top: 1px solid var(--border); font-size: 13px; color: var(--muted);
}
.foot .count { flex: 1; }
.foot .count strong { color: var(--text); font-weight: 500; }
.fab {
  position: fixed; right: 0; top: 140px; width: 44px; height: 44px; border: 1px solid var(--border);
  border-right: 0; border-radius: 22px 0 0 22px; background: var(--bg); box-shadow: var(--shadow);
  display: grid; place-items: center; cursor: pointer; pointer-events: auto; z-index: 3;
}
.fab.open { right: calc(var(--ttc-right, 0px) + 320px); }
.fab[aria-pressed="true"] { background: var(--accent-soft); }
`;

export const RAIL_CSS = `
:host { all: initial; display: block; width: 56px; height: 56px; }
button {
  width: 40px; height: 40px; margin: 8px; border-radius: 50%; border: 0; padding: 0;
  background: transparent; display: grid; place-items: center; cursor: pointer;
}
button:hover { background: rgba(68, 71, 70, .08); }
:host([data-theme="dark"]) button:hover { background: rgba(227, 227, 227, .08); }
button[aria-pressed="true"] { background: rgba(220, 76, 62, .16); }
button:focus-visible { outline: 2px solid #0b57d0; outline-offset: 0; }
:host([data-theme="dark"]) button:focus-visible { outline-color: #a8c7fa; }
`;
