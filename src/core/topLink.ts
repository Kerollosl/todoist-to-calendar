// The optional link shown in the middle of Calendar's and Todoist's top bar.
// Pure: no DOM, no chrome.*.

export const TOP_LINK_TEXT_MAX = 60;

/**
 * Normalize a user-typed URL. Bare hosts get https://. Only http(s) is allowed,
 * so a stored value can never become javascript:, data: or similar. Returns ""
 * when the input is empty or not a usable URL.
 */
export function normalizeLinkUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (!url.hostname) return "";
  return url.href;
}

export function normalizeLinkText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, TOP_LINK_TEXT_MAX);
}

/** What to render, or null when the link is off (no valid URL). */
export function topLinkView(url: string, text: string): { href: string; label: string } | null {
  const href = normalizeLinkUrl(url);
  if (!href) return null;
  const label = normalizeLinkText(text) || new URL(href).hostname.replace(/^www\./, "");
  return { href, label };
}
