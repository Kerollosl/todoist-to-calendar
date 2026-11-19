// Confirm → create the event → (optionally) complete tasks → undo.
import { buildDescription, buildEventBody, newEventId, validateDraft } from "../core/draft";
import { buildTemplateUrl } from "../core/templateUrl";
import { getSettings } from "../shared/settings";
import type { CalendarContext, CreateResult, EventDraft } from "../shared/types";
import { ApiError } from "./errors";
import * as gcal from "./gcal";

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
  void complete;

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

  return { mode: "api", event: { id: event.id, htmlLink: event.htmlLink, timeZone: zone }, closed: [], failed: [], notAttempted: [] };
}
