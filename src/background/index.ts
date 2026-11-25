// Service worker: the only place that talks to Todoist or Google. The content
// script and options page reach it through chrome.runtime messages (see
// src/shared/messages.ts); tokens never leave this context.
import { isApiRequest, type Api, type ApiType, type Result } from "../shared/messages";
import type { TodoistProject } from "../shared/types";
import { ApiError, toErrorInfo } from "./errors";
import * as flow from "./flow";
import * as todoist from "./todoist";

const PROJECTS_CACHE_KEY = "projectsCache";
const PROJECTS_TTL_MS = 60_000;

async function cachedProjects(): Promise<TodoistProject[]> {
  try {
    const { [PROJECTS_CACHE_KEY]: hit } = await chrome.storage.session.get(PROJECTS_CACHE_KEY);
    const cached = hit as { at: number; projects: TodoistProject[] } | undefined;
    if (cached && Array.isArray(cached.projects) && Date.now() - cached.at < PROJECTS_TTL_MS) return cached.projects;
  } catch {
    /* session storage unavailable: fall through to the network */
  }
  const projects = await todoist.listProjects();
  void chrome.storage.session.set({ [PROJECTS_CACHE_KEY]: { at: Date.now(), projects } }).catch(() => {});
  return projects;
}

type Handler<K extends ApiType> = (req: Api[K]["req"], sender: chrome.runtime.MessageSender) => Promise<Api[K]["res"]>;

const handlers: { [K in ApiType]?: Handler<K> } = {
  "tasks/list": async ({ filter }) => {
    // Projects are cached briefly so paging/refreshing doesn't refetch them each time,
    // while renamed or new projects still show up within a minute.
    const projects: TodoistProject[] = await cachedProjects();
    const sectionsFor = todoist.sectionProjectId(filter, projects);
    const [tasks, sections] = await Promise.all([
      todoist.listTasks(filter, projects),
      sectionsFor ? todoist.listSections(sectionsFor) : Promise.resolve([]),
    ]);
    return { tasks, projects, sections };
  },
  "todoist/test": async () => ({ projectCount: await todoist.testConnection() }),
  "calendar/context": () => flow.calendarContext(),
  "google/connect": () => flow.connectGoogle(),
  "google/disconnect": () => flow.disconnectGoogle(),
  "event/create": ({ draft, complete }) => flow.createEvent(draft, complete === true),
  "undo": (req) => flow.undo(req),
  "options/open": async () => {
    await chrome.runtime.openOptionsPage();
    return null;
  },
  "dev/reload": async () => {
    if (!__TTC_DEV__) throw new ApiError({ kind: "bad-request", message: "Not a dev build." });
    setTimeout(() => chrome.runtime.reload(), 50);
    return null;
  },
};

/** Only our own content script on calendar.google.com and our own extension pages may call in. */
function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const url = sender.url ?? "";
  if (url.startsWith(chrome.runtime.getURL(""))) return true;
  try {
    return sender.tab !== undefined && new URL(url).origin === "https://calendar.google.com";
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, respond: (r: Result<unknown>) => void) => {
  if (!isTrustedSender(sender) || !isApiRequest(message)) return false;
  const handler = handlers[message.type] as Handler<ApiType> | undefined;
  if (!handler) {
    respond({ ok: false, error: { kind: "bad-request", message: `Unsupported request: ${message.type}` } });
    return false;
  }
  handler(message as never, sender)
    .then((data) => respond({ ok: true, data }))
    .catch((error: unknown) => {
      const info = toErrorInfo(error);
      if (!(error instanceof ApiError)) console.warn("Todoist → Calendar:", info.message);
      respond({ ok: false, error: info });
    });
  return true; // keep the channel open for the async response
});

/**
 * One-time settings migration: the default view used to be "Today & overdue"
 * ("default"). If that old default was saved, switch it to the Inbox.
 */
const SETTINGS_VERSION = 2;
async function migrateSettings(): Promise<void> {
  const stored = await chrome.storage.sync.get(["settingsVersion", "defaultFilter"]);
  if (stored.settingsVersion === SETTINGS_VERSION) return;
  if (stored.defaultFilter === "default") await chrome.storage.sync.set({ defaultFilter: "inbox" });
  await chrome.storage.sync.set({ settingsVersion: SETTINGS_VERSION });
}
chrome.runtime.onInstalled.addListener(() => void migrateSettings());
chrome.runtime.onStartup.addListener(() => void migrateSettings());

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
