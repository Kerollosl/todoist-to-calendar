// Confirm → create the event → (optionally) complete tasks → undo.
import { buildDescription, buildEventBody, newEventId, validateDraft } from "../core/draft";
import { buildTemplateUrl } from "../core/templateUrl";
import { getSettings } from "../shared/settings";
import type { CalendarContext, CloseFailure, CreateResult, EventDraft, TaskRef, UndoRequest, UndoResult } from "../shared/types";
import { ApiError, toErrorInfo } from "./errors";
import * as gcal from "./gcal";
import * as todoist from "./todoist";

/** Errors after which further Todoist calls would fail too: stop instead of hammering. */
const HARD_STOPS = new Set(["rate-limit", "auth", "no-token", "offline"]);

function failureReason(error: unknown): { reason: string; hardStop: boolean } {
  const info = toErrorInfo(error);
  if (info.kind === "network") {
    return { reason: "No response from Todoist, so it may or may not have changed. Not retried; check it in Todoist.", hardStop: false };
  }
  return { reason: info.message, hardStop: HARD_STOPS.has(info.kind) };
}

/** Complete tasks one by one. Nothing is retried; every failure is reported by name. */
async function closeAll(tasks: readonly TaskRef[]): Promise<Pick<CreateResult, "closed" | "failed" | "notAttempted">> {
  const closed: TaskRef[] = [];
  const failed: CloseFailure[] = [];
  const notAttempted: TaskRef[] = [];
  for (const [index, task] of tasks.entries()) {
    try {
      await todoist.closeTask(task.id);
      closed.push(task);
    } catch (error) {
      const { reason, hardStop } = failureReason(error);
      failed.push({ task, reason });
      if (hardStop) {
        notAttempted.push(...tasks.slice(index + 1));
        break;
      }
    }
  }
  return { closed, failed, notAttempted };
}

/** Draft IDs already submitted, so a repeated message can't create a second event. */
const submitted = new Set<string>();

function assertDraft(draft: EventDraft): void {
  const ok =
    draft &&
    typeof draft.draftId === "string" &&
    typeof draft.title === "string" &&
    typeof draft.allDay === "boolean" &&
    typeof draft.start === "string" &&
    typeof draft.end === "string" &&
    Array.isArray(draft.tasks) &&
    draft.tasks.every((t) => t && typeof t.id === "string" && typeof t.content === "string");
  if (!ok) throw new ApiError({ kind: "bad-request", message: "Invalid event request." });
  const problem = validateDraft(draft);
  if (problem) throw new ApiError({ kind: "bad-request", message: problem });
}

export async function calendarContext(): Promise<CalendarContext> {
  const googleConfigured = gcal.isConfigured();
  const googleDisabled = await gcal.isDisabled();
  if (!googleConfigured || googleDisabled) return { googleConfigured, googleDisabled, googleConnected: false, timeZone: null };
  try {
    const timeZone = await gcal.withToken(false, (token) => gcal.calendarTimeZone(token));
    return { googleConfigured, googleDisabled, googleConnected: true, timeZone };
  } catch (error) {
    const connected = !(error instanceof ApiError && (error.info.kind === "google-auth" || error.info.kind === "google-not-configured"));
    return { googleConfigured, googleDisabled, googleConnected: connected, timeZone: null };
  }
}

export async function connectGoogle(): Promise<CalendarContext> {
  await gcal.getToken(true);
  await gcal.setDisabled(false);
  return calendarContext();
}

export async function disconnectGoogle(): Promise<CalendarContext> {
  await gcal.setDisabled(true);
  await chrome.identity.clearAllCachedAuthTokens();
  return calendarContext();
}

async function openTemplate(draft: EventDraft, includeLinks: boolean): Promise<CreateResult> {
  const url = buildTemplateUrl({
    title: draft.title.trim(),
    details: buildDescription(draft.tasks, includeLinks),
    allDay: draft.allDay,
    start: draft.start,
    end: draft.end,
  });
  await chrome.tabs.create({ url });
  // The prefilled page may never be saved, so tasks are never completed in this mode.
  return { mode: "template", closed: [], failed: [], notAttempted: [] };
}

export async function createEvent(draft: EventDraft, complete: boolean): Promise<CreateResult> {
  assertDraft(draft);
  if (submitted.has(draft.draftId)) throw new ApiError({ kind: "bad-request", message: "This event was already submitted." });
  submitted.add(draft.draftId);

  const settings = await getSettings();
  if (!gcal.isConfigured() || (await gcal.isDisabled())) return openTemplate(draft, settings.includeLinks);

  // Not signed in yet? The user just clicked Create, so an interactive prompt is expected.
  let interactive = false;
  try {
    await gcal.getToken(false);
  } catch {
    interactive = true;
  }
  let event: gcal.CreatedEvent;
  let zone: string;
  try {
    ({ event, zone } = await gcal.withToken(interactive, async (token) => {
      const zone = await gcal.calendarTimeZone(token);
      const body = buildEventBody(draft, zone, settings.includeLinks, newEventId(crypto.randomUUID()));
      return { event: await gcal.insertEvent(token, body), zone };
    }));
  } catch (error) {
    if (error instanceof ApiError && error.info.kind === "google-auth" && interactive) {
      return openTemplate(draft, settings.includeLinks); // not authorised → prefilled-page fallback
    }
    throw error;
  }

  // Only now that the event exists do we touch Todoist.
  const outcome = complete ? await closeAll(draft.tasks) : { closed: [], failed: [], notAttempted: [] };
  return { mode: "api", event: { id: event.id, htmlLink: event.htmlLink, timeZone: zone }, ...outcome };
}

/**
 * Undo: reopen the tasks we completed and optionally delete the event.
 * Recurring tasks are skipped: completing one moved it to its next date, and
 * reopening can't move it back.
 */
export async function undo(req: UndoRequest): Promise<UndoResult> {
  if (!req || !Array.isArray(req.tasks) || !req.tasks.every((t) => t && typeof t.id === "string")) {
    throw new ApiError({ kind: "bad-request", message: "Invalid undo request." });
  }
  const reopened: TaskRef[] = [];
  const failed: CloseFailure[] = [];
  const skippedRecurring: TaskRef[] = [];
  let stopReason: string | null = null;
  for (const task of req.tasks) {
    if (task.isRecurring) {
      skippedRecurring.push(task);
      continue;
    }
    if (stopReason) {
      failed.push({ task, reason: `Not attempted: ${stopReason}` });
      continue;
    }
    try {
      await todoist.reopenTask(task.id);
      reopened.push(task);
    } catch (error) {
      const { reason, hardStop } = failureReason(error);
      failed.push({ task, reason });
      if (hardStop) stopReason = reason;
    }
  }
  let eventDeleted = false;
  let eventError: string | undefined;
  if (req.deleteEvent && typeof req.eventId === "string") {
    try {
      await gcal.withToken(false, (token) => gcal.deleteEvent(token, req.eventId!));
      eventDeleted = true;
    } catch (error) {
      eventError = toErrorInfo(error).message;
    }
  }
  return { reopened, failed, skippedRecurring, eventDeleted, eventError };
}
