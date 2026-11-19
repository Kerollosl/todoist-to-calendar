// User preferences (chrome.storage.sync). The Todoist token is NOT here: it lives
// in chrome.storage.local under TOKEN_KEY and is only read by the service worker.
import type { FilterPreset } from "../core/filters";
import { normalizeLinkText, normalizeLinkUrl } from "../core/topLink";

export interface Settings {
  defaultFilter: FilterPreset;
  customQuery: string;
  defaultDuration: number; // minutes, used when no selected task has a duration
  includeLinks: boolean; // append each task's Todoist URL to its description line
  defaultTitle: string;
  topLinkUrl: string; // "" = no link in the top bar
  topLinkText: string; // "" = show the URL's host
}

export const TOKEN_KEY = "todoistToken";
export const GOOGLE_DISABLED_KEY = "googleDisabled";

export const DEFAULT_SETTINGS: Settings = {
  defaultFilter: "inbox",
  customQuery: "",
  defaultDuration: 30,
  includeLinks: false,
  defaultTitle: "Todoist",
  topLinkUrl: "",
  topLinkText: "",
};

const PRESETS: readonly FilterPreset[] = ["default", "today", "overdue", "upcoming", "inbox", "all", "custom"];

export function sanitizeSettings(raw: Partial<Record<keyof Settings, unknown>>): Settings {
  const duration = Number(raw.defaultDuration);
  return {
    defaultFilter: PRESETS.includes(raw.defaultFilter as FilterPreset)
      ? (raw.defaultFilter as FilterPreset)
      : DEFAULT_SETTINGS.defaultFilter,
    customQuery: typeof raw.customQuery === "string" ? raw.customQuery.trim() : "",
    defaultDuration:
      Number.isFinite(duration) && duration >= 5 && duration <= 24 * 60
        ? Math.round(duration / 5) * 5
        : DEFAULT_SETTINGS.defaultDuration,
    includeLinks: raw.includeLinks === true,
    defaultTitle:
      typeof raw.defaultTitle === "string" && raw.defaultTitle.trim()
        ? raw.defaultTitle.trim().slice(0, 200)
        : DEFAULT_SETTINGS.defaultTitle,
    topLinkUrl: normalizeLinkUrl(raw.topLinkUrl),
    topLinkText: normalizeLinkText(raw.topLinkText),
  };
}

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>);
  return sanitizeSettings(raw);
}
