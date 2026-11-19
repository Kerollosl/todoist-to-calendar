# Todoist → Calendar — Chrome Extension

MV3 extension (TypeScript + esbuild + Vitest). Drag Todoist tasks onto Google Calendar to create one event, then optionally complete the tasks.

## Commands

```bash
npm run build      # → dist/ (load unpacked from dist/, not the repo root)
npm run dev        # dev build; once loaded, open Calendar tabs reload the extension + themselves on every later `npm run dev`
npm run watch
npm test           # vitest; single file: npx vitest run tests/geometry.test.ts
npm run typecheck
npm run check      # typecheck + test + build; run before every commit
```

Extension ID is fixed (`dbpjookphadmnhcajloppmfhifjglbhi`) via the `key` in `manifest.base.json`. The private key lives outside the repo at `~/.config/todoist-to-calendar/key.pem` and is not needed for unpacked loads. `GOOGLE_CLIENT_ID` comes from `.env` (gitignored) and is injected into `dist/manifest.json` as `oauth2` by `scripts/build.mjs`.

## Architecture

- `src/background/`: the service worker, the only place with network access and tokens. `index.ts` routes messages (sender-checked), `todoist.ts` is the API v1 client, `gcal.ts` handles Calendar API v3 via `chrome.identity.getAuthToken`, and `flow.ts` runs create → close → undo.
- `src/content/`: everything on calendar.google.com, in closed shadow roots: `ttc-root` (fixed overlay: popover, toast, drag layer, floating panel) and `ttc-dock` (the docked panel). `keys.ts` is a window-capture key firewall, so Calendar's single-key shortcuts never see keys typed into our UI. Its `isFromUi` must include both hosts.
- Boot order matters: `index.ts` declares `launcher` before anything that can call `layout()`. `createLauncher` runs its first check in a microtask. A TDZ crash here once left the panel blank.
- `src/content/topLink.ts`: separate content script (`topLink.js`, on Calendar and app.todoist.com) that shows the user's optional top-bar link (`topLinkUrl`/`topLinkText`, http(s) only via `core/topLink.ts`).
- `src/core/`: pure, unit-tested logic. Keep it free of DOM and `chrome.*`.
- `src/shared/`: the typed message protocol (`messages.ts`), types and settings.

## Invariants (don't break)

- Complete Todoist tasks **only after** `events.insert` is confirmed. Never retry mutations blindly. An ambiguous insert is resolved with `events.get` on our client-chosen event ID. Close failures are reported per task, and a rate limit, auth error or offline state stops the run.
- Times are wall-clock strings until `toRfc3339(wall, zone)`. The zone is the primary calendar's (`events.list` → `timeZone`), never hardcoded.
- Task text is rendered with `textContent` only. Tokens are never logged or passed to the content script.
- Permissions stay as they are: `storage`, `identity`, plus hosts calendar.google.com, api.todoist.com, www.googleapis.com. The only other page access is the `topLink.js` content script on app.todoist.com.
- The default view is the Inbox, paged by section (`core/sections.ts`). The background migrates a saved old default ("default" = Today & overdue) to "inbox" once (`settingsVersion`).
- Motion: no animation on keyboard-triggered actions; custom ease-out; exits faster than entrances; `prefers-reduced-motion` keeps fades only.

## Fragile selectors

All Calendar DOM knowledge lives in `src/content/calendarGeometry.ts` (grid, day columns, all-day band, month cells, datekey encoding), `src/content/railButton.ts` (side-panel rail), `src/content/dock.ts` (the flex row the rail lives in) `src/content/theme.ts` (the grid card's surface, radius and font) and `src/content/topLink.ts` (Calendar and Todoist header heights). Each has header comments that list exactly what it relies on, verified 2026-11-18. When something breaks, re-inspect the live DOM and validate the time mapping against Calendar's own event positions before changing the math.
