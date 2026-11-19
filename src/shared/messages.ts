// Typed request/response protocol between the content script / options page
// and the service worker. Every network call goes through the worker so tokens
// never reach a web page context.
import type {
  CalendarContext,
  CreateResult,
  ErrorInfo,
  EventDraft,
  FilterSpec,
  TodoistProject,
  TodoistTask,
  UndoRequest,
  UndoResult,
} from "./types";

export interface Api {
  "tasks/list": { req: { filter: FilterSpec }; res: { tasks: TodoistTask[]; projects: TodoistProject[] } };
  "todoist/test": { req: Record<string, never>; res: { projectCount: number } };
  "calendar/context": { req: Record<string, never>; res: CalendarContext };
  "google/connect": { req: Record<string, never>; res: CalendarContext };
  "google/disconnect": { req: Record<string, never>; res: CalendarContext };
  "event/create": { req: { draft: EventDraft; complete: boolean }; res: CreateResult };
  "undo": { req: UndoRequest; res: UndoResult };
  "options/open": { req: Record<string, never>; res: null };
}

export type ApiType = keyof Api;
export type ApiRequest<K extends ApiType = ApiType> = { type: K } & Api[K]["req"];
export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorInfo };

const TYPES: ReadonlySet<string> = new Set<ApiType>([
  "tasks/list",
  "todoist/test",
  "calendar/context",
  "google/connect",
  "google/disconnect",
  "event/create",
  "undo",
  "options/open",
]);

export function isApiRequest(message: unknown): message is ApiRequest {
  return typeof message === "object" && message !== null && TYPES.has((message as { type?: unknown }).type as string);
}

export const STALE_MESSAGE = "Todoist → Calendar was updated. Reload this tab to keep using it.";

/**
 * False once the extension has been reloaded or updated: this content script
 * keeps running in the tab but can no longer reach chrome.* APIs.
 */
export function isContextAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

/** Send a request to the service worker. Never throws: failures come back as `{ ok: false }`. */
export async function send<K extends ApiType>(type: K, payload: Api[K]["req"]): Promise<Result<Api[K]["res"]>> {
  if (!isContextAlive()) return { ok: false, error: { kind: "stale", message: STALE_MESSAGE } };
  try {
    const response = (await chrome.runtime.sendMessage({ type, ...payload })) as Result<Api[K]["res"]> | undefined;
    if (!response) return { ok: false, error: { kind: "bad-request", message: "No response from the extension." } };
    return response;
  } catch (error) {
    // Typically "Extension context invalidated" after the extension was reloaded.
    const message = error instanceof Error ? error.message : String(error);
    if (/context invalidated/i.test(message) || !isContextAlive()) {
      return { ok: false, error: { kind: "stale", message: STALE_MESSAGE } };
    }
    return { ok: false, error: { kind: "bad-request", message } };
  }
}
