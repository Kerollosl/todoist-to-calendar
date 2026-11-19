# Todoist → Calendar

A Chrome extension (Manifest V3) that lets you drag Todoist tasks onto Google Calendar and turn them into **one** calendar event. You can then check the tasks off in Todoist, with Undo.

- A Todoist button in Calendar's right-hand rail (next to Keep, Tasks and Contacts) opens a 320px side panel. If the rail is hidden, a floating tab on the right edge does the same.
- The panel lists your tasks:
  - Filters: Today & overdue (default), Today, Overdue, Upcoming, Inbox, All, any project, or your own Todoist filter.
  - Search, grouping by project, priority color, due date and duration.
- Multi-select:
  - Click toggles a task, shift-click selects a range, and cmd/ctrl-click adds one.
  - Keyboard: ↑/↓ moves, Space toggles, shift+↑/↓ extends the range, ⌘/Ctrl+A selects all, Esc clears.
- Dragging any selected task drags the whole selection. A ghost event shows where the event will land:
  - Day and week views snap to 15 minutes.
  - The header band above the grid creates an all-day event.
  - Month view creates all-day events.
- A confirmation popover lets you edit the title (default "Todoist") and the times, and shows the numbered task list. It warns about recurring tasks. Then choose **Create & check off tasks** or **Create event only**.
- The event description is plain text, one numbered task per line, with optional Todoist links:
  ```
  1. Task title
  2. Task title
  ```

Unofficial. Not affiliated with Todoist (Doist) or Google.

## How it behaves when things go wrong

- **Tasks are completed only after Google confirms the event exists.** If event creation fails, nothing in Todoist changes.
- **Uncertain outcomes are checked, not retried.** Each event gets a client-chosen ID. If the insert's response is lost (network error, 5xx), the extension looks the event up by that ID. If it still can't tell, it completes nothing and tells you to check your calendar.
- **Tasks are closed one at a time and never retried silently.** A rate limit, auth error or lost connection stops the run. The toast names every task that failed or wasn't attempted.
- **Undo** reopens the completed tasks and deletes the event. **Reopen tasks only** keeps the event. Recurring tasks can't be un-advanced: completing one moves it to its next date, and the toast says so.
- **Without Google access**, a drop opens a prefilled `calendar.google.com/calendar/render?action=TEMPLATE` page instead, and tasks are never checked off, because the event isn't real until you save it.
- **Time zones:** times are sent as RFC 3339 with an explicit offset plus a `timeZone` field. The zone is your primary calendar's own zone, read from the Calendar API, not hardcoded. If the grid's GMT label disagrees with that zone, the popover says so.

## Build and load

Requirements: Node 22+ and Google Chrome.

```bash
git clone https://github.com/Kerollosl/todoist-to-calendar.git
cd todoist-to-calendar
npm install
npm run build        # writes dist/ and prints the extension ID
```

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the **`dist/`** folder (not the repo root).
3. The extension ID is always `dbpjookphadmnhcajloppmfhifjglbhi`, because `manifest.base.json` contains a fixed public key.
4. Click the extension's toolbar icon to open **Options**, paste your Todoist API token (Todoist → Settings → Integrations → Developer), and click **Save token**.
5. Open [Google Calendar](https://calendar.google.com) and click the Todoist button in the right-hand rail.

After any code change, run `npm run build` (or `npm run watch`), then click the reload icon on the extension card and refresh the Calendar tab.

## Google Calendar setup

Creating events through the API needs your own OAuth client ID. Without one, the extension uses the prefilled-page fallback described above.

1. In the [Google Cloud console](https://console.cloud.google.com/projectcreate), create a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **Google Auth Platform** (OAuth consent screen) → **Get started**: app name, your email, audience **External**.
4. **Audience** → add your Google account as a **test user**, and leave the app in Testing.
5. **Data access** → **Add or remove scopes** → add `https://www.googleapis.com/auth/calendar.events`.
6. **Clients** → **Create client** → type **Chrome Extension** → **Item ID** `dbpjookphadmnhcajloppmfhifjglbhi` → **Create**. Copy the Client ID.
7. Copy `.env.example` to `.env`, set `GOOGLE_CLIENT_ID=…apps.googleusercontent.com`, then run `npm run build`.
8. Reload the extension in `chrome://extensions`, open Options and click **Connect Google Calendar**.

`chrome.identity.getAuthToken` signs in with the Google account of your Chrome profile. In Testing mode Google may ask you to approve access again about once a week.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Todoist token (`chrome.storage.local`) and preferences (`chrome.storage.sync`) |
| `identity` | Google OAuth token for the Calendar API |
| `https://calendar.google.com/*` | The panel and drag-and-drop on Calendar |
| `https://api.todoist.com/*` | Todoist API v1 (list, close and reopen tasks) |
| `https://www.googleapis.com/*` | Calendar API (insert, get and delete events; read the calendar's time zone) |

All network calls happen in the background service worker. The content script never sees either token.

## Development

```bash
npm run watch       # rebuild on change
npm test            # Vitest unit tests (geometry, time zones, selection, description, flow)
npm run typecheck   # tsc --noEmit
npm run check       # typecheck + test + build
npm run package     # zip dist/ for the Chrome Web Store
```

| Path | What |
| --- | --- |
| `src/content/calendarGeometry.ts` | **The fragile part.** Cursor → day/time from Calendar's DOM. Every selector it relies on is documented at the top of the file. |
| `src/content/railButton.ts` | Rail launcher and floating-tab fallback |
| `src/content/panel.ts`, `drag.ts`, `dragSession.ts`, `popover.ts`, `toast.ts` | In-page UI (closed Shadow DOM) |
| `src/core/` | Pure, unit-tested logic: selection, time/RFC 3339, description, filters, template URL, results |
| `src/background/` | Service worker: Todoist and Calendar clients, create → close → undo flow |
| `src/options/` | Options page |

If Google changes Calendar's markup, start with `calendarGeometry.ts` and `railButton.ts`.
