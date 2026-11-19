// Shapes shared by the service worker, content script and options page.

/** Todoist API v1 `due` object (https://developer.todoist.com/api/v1/). */
export interface TodoistDue {
  date: string; // YYYY-MM-DD, or a full datetime for some legacy tasks
  datetime?: string | null;
  string?: string;
  is_recurring: boolean;
  timezone?: string | null;
  lang?: string;
}

export interface TodoistDuration {
  amount: number;
  unit: "minute" | "day";
}

export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id?: string | null;
  parent_id?: string | null;
  priority: number; // 1 (normal) … 4 (urgent); the API's 4 is the app's "P1"
  due: TodoistDue | null;
  duration: TodoistDuration | null;
  child_order: number;
  day_order?: number;
  labels?: string[];
}

export interface TodoistProject {
  id: string;
  name: string;
  color?: string;
  child_order: number;
  parent_id?: string | null;
  inbox_project?: boolean;
  is_archived?: boolean;
}

/** What the panel asks the service worker to list. */
export type FilterSpec =
  | { kind: "query"; query: string }
  | { kind: "project"; projectId: string }
  | { kind: "inbox" }
  | { kind: "all" };

/** Minimal task info carried from the panel into an event draft. */
export interface TaskRef {
  id: string;
  content: string;
  isRecurring: boolean;
}

/**
 * An event as the user confirmed it in the popover. Times are wall-clock
 * strings in the calendar's own time zone ("YYYY-MM-DDTHH:MM"), or plain dates
 * ("YYYY-MM-DD") for all-day events, where `end` is inclusive.
 */
export interface EventDraft {
  draftId: string;
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  tasks: TaskRef[];
}

export type ErrorKind =
  | "no-token" // Todoist token missing
  | "auth" // token rejected (401/403)
  | "rate-limit" // 429
  | "offline" // no network
  | "network" // request failed in flight
  | "http" // any other non-2xx
  | "uncertain" // a mutation may or may not have happened
  | "google-not-configured" // no OAuth client ID built into the manifest
  | "google-auth" // could not get a Google token
  | "bad-request"; // invalid message / input

export interface ErrorInfo {
  kind: ErrorKind;
  service?: "todoist" | "google";
  message: string;
  retryAfter?: number; // seconds, for rate limits
  status?: number;
}

export interface CloseFailure {
  task: TaskRef;
  reason: string;
}

export interface CreateResult {
  mode: "api" | "template";
  /** Present when mode === "api". */
  event?: { id: string; htmlLink?: string; timeZone: string };
  closed: TaskRef[];
  failed: CloseFailure[];
  /** Tasks never attempted because a hard stop (rate limit, auth, offline) happened first. */
  notAttempted: TaskRef[];
}

export interface UndoRequest {
  eventId?: string;
  tasks: TaskRef[];
  deleteEvent: boolean;
}

export interface UndoResult {
  reopened: TaskRef[];
  failed: CloseFailure[];
  /** Recurring tasks are skipped: closing advanced their date and reopening cannot move it back. */
  skippedRecurring: TaskRef[];
  eventDeleted: boolean;
  eventError?: string;
}

export interface CalendarContext {
  googleConfigured: boolean;
  googleConnected: boolean;
  googleDisabled: boolean;
  timeZone: string | null;
}
