// Todoist unified API v1 client (https://developer.todoist.com/api/v1/).
// Runs only in the service worker. The token is read from chrome.storage.local
// per request and is never logged or sent anywhere except api.todoist.com.
import { TOKEN_KEY } from "../shared/settings";
import type { FilterSpec, TodoistProject, TodoistTask } from "../shared/types";
import { ApiError, isOffline, retryAfterSeconds } from "./errors";

const BASE = "https://api.todoist.com/api/v1";
const PAGE_LIMIT = 200; // the API maximum for tasks, filter and projects
const MAX_PAGES = 50;

async function getToken(): Promise<string> {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const token = typeof stored[TOKEN_KEY] === "string" ? (stored[TOKEN_KEY] as string).trim() : "";
  if (!token) {
    throw new ApiError({ kind: "no-token", service: "todoist", message: "Add your Todoist API token in the extension options." });
  }
  return token;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      isOffline()
        ? { kind: "offline", service: "todoist", message: "You're offline. Reconnect and try again." }
        : { kind: "network", service: "todoist", message: "Couldn't reach Todoist. Check your connection and try again." },
    );
  }
  if (res.ok) return res;
  const body = await readJson(res);
  if (res.status === 401 || res.status === 403) {
    throw new ApiError({
      kind: "auth",
      service: "todoist",
      status: res.status,
      message: "Todoist rejected the API token. Fix it in the extension options.",
    });
  }
  if (res.status === 429) {
    const retryAfter = retryAfterSeconds(res, body);
    throw new ApiError({
      kind: "rate-limit",
      service: "todoist",
      status: 429,
      retryAfter,
      message: `Todoist rate limit reached.${retryAfter ? ` Try again in ${retryAfter}s.` : " Try again shortly."}`,
    });
  }
  const detail = typeof (body as { error?: unknown } | null)?.error === "string" ? (body as { error: string }).error : "";
  throw new ApiError({
    kind: "http",
    service: "todoist",
    status: res.status,
    message: `Todoist error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
  });
}

interface Page<T> {
  results: T[];
  next_cursor: string | null;
}

async function paginate<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ ...params, limit: String(PAGE_LIMIT) });
    if (cursor) query.set("cursor", cursor);
    const body = (await (await request(`${path}?${query}`)).json()) as Page<T>;
    out.push(...(body.results ?? []));
    cursor = body.next_cursor ?? null;
    if (!cursor) break;
  }
  return out;
}

export async function listProjects(): Promise<TodoistProject[]> {
  const projects = await paginate<TodoistProject>("/projects");
  return projects.filter((p) => !p.is_archived);
}

export async function listTasks(filter: FilterSpec, projects: readonly TodoistProject[]): Promise<TodoistTask[]> {
  switch (filter.kind) {
    case "query":
      return paginate<TodoistTask>("/tasks/filter", { query: filter.query });
    case "project":
      return paginate<TodoistTask>("/tasks", { project_id: filter.projectId });
    case "inbox": {
      const inbox = projects.find((p) => p.inbox_project);
      if (!inbox) throw new ApiError({ kind: "http", service: "todoist", message: "Couldn't find your Todoist Inbox." });
      return paginate<TodoistTask>("/tasks", { project_id: inbox.id });
    }
    case "all":
      return paginate<TodoistTask>("/tasks");
  }
}

/** POST /tasks/{id}/close → 204. Recurring tasks advance to their next occurrence. */
export async function closeTask(id: string): Promise<void> {
  await request(`/tasks/${encodeURIComponent(id)}/close`, { method: "POST" });
}

/** POST /tasks/{id}/reopen → 204. */
export async function reopenTask(id: string): Promise<void> {
  await request(`/tasks/${encodeURIComponent(id)}/reopen`, { method: "POST" });
}

export async function testConnection(): Promise<number> {
  return (await listProjects()).length;
}
