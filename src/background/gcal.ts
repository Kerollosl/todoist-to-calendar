// Google Calendar API v3 via chrome.identity.getAuthToken (OAuth client type
// "Chrome Extension", client ID baked into manifest.oauth2 at build time).
// Runs only in the service worker. Tokens are never logged.
import type { CalendarEventBody } from "../core/draft";
import { isValidZone } from "../core/time";
import { GOOGLE_DISABLED_KEY } from "../shared/settings";
import { ApiError, isOffline } from "./errors";

const BASE = "https://www.googleapis.com/calendar/v3";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const ZONE_CACHE_KEY = "calendarZone";
const ZONE_TTL_MS = 6 * 60 * 60 * 1000;

/** A 401: the request was rejected before doing anything, so a fresh token may retry it. */
class TokenRejected extends Error {}

export function isConfigured(): boolean {
  return Boolean(chrome.runtime.getManifest().oauth2?.client_id);
}

export async function isDisabled(): Promise<boolean> {
  return (await chrome.storage.local.get(GOOGLE_DISABLED_KEY))[GOOGLE_DISABLED_KEY] === true;
}

export async function setDisabled(disabled: boolean): Promise<void> {
  if (disabled) await chrome.storage.local.set({ [GOOGLE_DISABLED_KEY]: true });
  else await chrome.storage.local.remove(GOOGLE_DISABLED_KEY);
}

export async function getToken(interactive: boolean): Promise<string> {
  if (!isConfigured()) {
    throw new ApiError({
      kind: "google-not-configured",
      service: "google",
      message: "Google Calendar isn't set up. Add an OAuth client ID (see the extension options).",
    });
  }
  let token: string | undefined;
  try {
    token = (await chrome.identity.getAuthToken({ interactive, scopes: [CALENDAR_SCOPE] })).token;
  } catch {
    token = undefined;
  }
  if (!token) {
    throw new ApiError({
      kind: "google-auth",
      service: "google",
      message: interactive ? "Google sign-in was cancelled or failed." : "Not connected to Google Calendar.",
    });
  }
  return token;
}

/** Run `fn` with a token; on a 401, drop the cached token and try once more with a fresh one. */
export async function withToken<T>(interactive: boolean, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getToken(interactive);
  try {
    return await fn(token);
  } catch (error) {
    if (!(error instanceof TokenRejected)) throw error;
    await chrome.identity.removeCachedAuthToken({ token });
    const fresh = await getToken(false);
    try {
      return await fn(fresh);
    } catch (again) {
      if (again instanceof TokenRejected) {
        throw new ApiError({ kind: "google-auth", service: "google", status: 401, message: "Google rejected the sign-in. Reconnect in the extension options." });
      }
      throw again;
    }
  }
}

async function gfetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function networkError(): ApiError {
  return new ApiError(
    isOffline()
      ? { kind: "offline", service: "google", message: "You're offline. Nothing was created." }
      : { kind: "network", service: "google", message: "Couldn't reach Google Calendar. Nothing was created." },
  );
}

async function googleMessage(res: Response): Promise<{ message: string; reason: string }> {
  try {
    const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
    return { message: body.error?.message ?? "", reason: body.error?.errors?.[0]?.reason ?? "" };
  } catch {
    return { message: "", reason: "" };
  }
}

/** Definite (nothing was created) error for a non-2xx, non-ambiguous response. */
async function definiteError(res: Response, action: string): Promise<ApiError> {
  const { message, reason } = await googleMessage(res);
  if (res.status === 429 || (res.status === 403 && /rateLimit|userRateLimit|quotaExceeded/i.test(reason))) {
    return new ApiError({ kind: "rate-limit", service: "google", status: res.status, message: `Google Calendar rate limit reached. ${action} Try again in a minute.` });
  }
  if (res.status === 403) {
    return new ApiError({
      kind: "google-auth",
      service: "google",
      status: 403,
      message: `Google Calendar denied access${message ? ` (${message.slice(0, 160)})` : ""}. Reconnect in the extension options.`,
    });
  }
  return new ApiError({
    kind: "http",
    service: "google",
    status: res.status,
    message: `Google Calendar error ${res.status}${message ? `: ${message.slice(0, 200)}` : ""}. ${action}`,
  });
}

/** The primary calendar's own time zone (events.list response field; works with calendar.events scope). */
export async function calendarTimeZone(token: string): Promise<string> {
  const cached = (await chrome.storage.session.get(ZONE_CACHE_KEY))[ZONE_CACHE_KEY] as { zone: string; at: number } | undefined;
  if (cached && Date.now() - cached.at < ZONE_TTL_MS && isValidZone(cached.zone)) return cached.zone;
  let res: Response;
  try {
    res = await gfetch(token, "/calendars/primary/events?maxResults=1&fields=timeZone");
  } catch {
    throw networkError();
  }
  if (res.status === 401) throw new TokenRejected();
  if (!res.ok) throw await definiteError(res, "Nothing was created.");
  const zone = ((await res.json()) as { timeZone?: string }).timeZone ?? "";
  if (!isValidZone(zone)) throw new ApiError({ kind: "http", service: "google", message: "Couldn't read your calendar's time zone. Nothing was created." });
  await chrome.storage.session.set({ [ZONE_CACHE_KEY]: { zone, at: Date.now() } });
  return zone;
}

export interface CreatedEvent {
  id: string;
  htmlLink?: string;
}

/** events.get: the event, null when it doesn't exist, or throws if we can't tell. */
async function findEvent(token: string, id: string): Promise<CreatedEvent | null> {
  let res: Response;
  try {
    res = await gfetch(token, `/calendars/primary/events/${encodeURIComponent(id)}?fields=id,status,htmlLink`);
  } catch {
    throw new Error("unreachable");
  }
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`status ${res.status}`);
  const event = (await res.json()) as { id: string; status?: string; htmlLink?: string };
  return event.status === "cancelled" ? null : { id: event.id, htmlLink: event.htmlLink };
}

/**
 * events.insert, never retried blindly. If the outcome is ambiguous (network
 * failure, 5xx, 409), look the event up by its client-chosen ID to learn what
 * happened. If even that fails, report "uncertain" so the caller completes no
 * tasks and tells the user to check their calendar.
 */
export async function insertEvent(token: string, body: CalendarEventBody): Promise<CreatedEvent> {
  let res: Response | null = null;
  try {
    res = await gfetch(token, "/calendars/primary/events?fields=id,htmlLink", { method: "POST", body: JSON.stringify(body) });
  } catch {
    res = null; // ambiguous: the request may or may not have reached Google
  }
  if (res?.ok) {
    const event = (await res.json()) as { id: string; htmlLink?: string };
    return { id: event.id, htmlLink: event.htmlLink };
  }
  if (res?.status === 401) throw new TokenRejected();
  if (res && res.status < 500 && res.status !== 409) throw await definiteError(res, "Nothing was created.");

  try {
    const existing = await findEvent(token, body.id);
    if (existing) return existing;
  } catch {
    throw new ApiError({
      kind: "uncertain",
      service: "google",
      message: "Couldn't confirm whether the event was created. Check your calendar before trying again. No tasks were checked off.",
    });
  }
  if (!res) throw networkError();
  throw await definiteError(res, "Nothing was created.");
}

export async function deleteEvent(token: string, id: string): Promise<void> {
  let res: Response;
  try {
    res = await gfetch(token, `/calendars/primary/events/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    throw new ApiError({ kind: "network", service: "google", message: "Couldn't reach Google Calendar to delete the event." });
  }
  if (res.ok || res.status === 404 || res.status === 410) return;
  if (res.status === 401) throw new TokenRejected();
  throw await definiteError(res, "The event was not deleted.");
}
