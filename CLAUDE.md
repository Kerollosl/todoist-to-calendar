# Todoist → Calendar — Chrome Extension

MV3 extension (TypeScript + esbuild + Vitest). Drag Todoist tasks onto Google Calendar to create one event, then optionally complete the tasks.

## Commands

```bash
npm run build      # → dist/ (load unpacked from dist/, not the repo root)
npm run watch
npm test           # vitest; single file: npx vitest run tests/geometry.test.ts
npm run typecheck
npm run check      # typecheck + test + build; run before every commit
```

Extension ID is fixed (`dbpjookphadmnhcajloppmfhifjglbhi`) via the `key` in `manifest.base.json`. The private key lives outside the repo at `~/.config/todoist-to-calendar/key.pem` and is not needed for unpacked loads. `GOOGLE_CLIENT_ID` comes from `.env` (gitignored) and is injected into `dist/manifest.json` as `oauth2` by `scripts/build.mjs`.

## Architecture

- `src/background/`: the service worker, the only place with network access and tokens. `index.ts` routes messages (sender-checked), `todoist.ts` is the API v1 client, `gcal.ts` handles Calendar API v3 via `chrome.identity.getAuthToken`, and `flow.ts` runs create → close → undo.
- `src/content/`: everything on calendar.google.com, inside one closed shadow root. `keys.ts` is a window-capture key firewall so Calendar's single-key shortcuts never see keys typed into our UI.
- `src/core/`: pure, unit-tested logic. Keep it free of DOM and `chrome.*`.
- `src/shared/`: the typed message protocol (`messages.ts`), types and settings.

## Invariants (don't break)

- Complete Todoist tasks **only after** `events.insert` is confirmed. Never retry mutations blindly. An ambiguous insert is resolved with `events.get` on our client-chosen event ID. Close failures are reported per task, and a rate limit, auth error or offline state stops the run.
- Times are wall-clock strings until `toRfc3339(wall, zone)`. The zone is the primary calendar's (`events.list` → `timeZone`), never hardcoded.
- Task text is rendered with `textContent` only. Tokens are never logged or passed to the content script.
- Permissions stay as they are: `storage`, `identity`, plus hosts calendar.google.com, api.todoist.com, www.googleapis.com.

## Fragile selectors

All Calendar DOM knowledge lives in `src/content/calendarGeometry.ts` (grid/day columns/all-day band/month cells/datekey encoding) and `src/content/railButton.ts` (side-panel rail). Both have header comments that list exactly what they rely on, verified 2026-11-18. When something breaks, re-inspect the live DOM and validate the time mapping against Calendar's own event positions before changing the math.
