// Options page: Todoist token, panel defaults, Google Calendar connection.
import { send } from "../shared/messages";
import { DEFAULT_SETTINGS, TOKEN_KEY, getSettings, sanitizeSettings, type Settings } from "../shared/settings";
import type { CalendarContext } from "../shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function setStatus(el: HTMLElement, text: string, tone: "ok" | "bad" | "" = ""): void {
  el.textContent = text;
  el.className = `status${tone ? ` ${tone}` : ""}`;
}

// ------------------------------------------------------------------ Todoist

const tokenInput = $<HTMLInputElement>("token");
const tokenStatus = $("token-status");

async function showTokenState(): Promise<void> {
  const stored = (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY];
  const has = typeof stored === "string" && stored.length > 0;
  tokenInput.value = "";
  tokenInput.placeholder = has ? `Saved token ending in …${(stored as string).slice(-4)}` : "Paste your token";
  $<HTMLButtonElement>("remove-token").disabled = !has;
  $<HTMLButtonElement>("test-token").disabled = !has;
}

async function testToken(): Promise<void> {
  setStatus(tokenStatus, "Testing…");
  const result = await send("todoist/test", {});
  if (result.ok) setStatus(tokenStatus, `Connected to Todoist · ${result.data.projectCount} projects.`, "ok");
  else setStatus(tokenStatus, result.error.kind === "no-token" ? "No token saved yet." : result.error.message, "bad");
}

$("save-token").addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus(tokenStatus, "Paste a token first.", "bad");
    tokenInput.focus();
    return;
  }
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
    setStatus(tokenStatus, "That doesn't look like a Todoist API token.", "bad");
    return;
  }
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
  await showTokenState();
  await testToken();
});
tokenInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("save-token").click();
});
$("test-token").addEventListener("click", () => void testToken());
$("remove-token").addEventListener("click", async () => {
  await chrome.storage.local.remove(TOKEN_KEY);
  await showTokenState();
  setStatus(tokenStatus, "Token removed.");
});

// ------------------------------------------------------------- preferences

const prefsStatus = $("prefs-status");
const fields = {
  defaultFilter: $<HTMLSelectElement>("defaultFilter"),
  customQuery: $<HTMLInputElement>("customQuery"),
  defaultTitle: $<HTMLInputElement>("defaultTitle"),
  defaultDuration: $<HTMLInputElement>("defaultDuration"),
  includeLinks: $<HTMLInputElement>("includeLinks"),
  topLinkText: $<HTMLInputElement>("topLinkText"),
  topLinkUrl: $<HTMLInputElement>("topLinkUrl"),
};
const topLinkStatus = $("toplink-status");

function fillPrefs(settings: Settings): void {
  fields.defaultFilter.value = settings.defaultFilter;
  fields.customQuery.value = settings.customQuery;
  fields.defaultTitle.value = settings.defaultTitle;
  fields.defaultDuration.value = String(settings.defaultDuration);
  fields.includeLinks.checked = settings.includeLinks;
  fields.topLinkText.value = settings.topLinkText;
  fields.topLinkUrl.value = settings.topLinkUrl;
}

let saveTimer: number | undefined;
function savePrefs(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const settings = sanitizeSettings({
      defaultFilter: fields.defaultFilter.value,
      customQuery: fields.customQuery.value,
      defaultTitle: fields.defaultTitle.value,
      defaultDuration: fields.defaultDuration.value,
      includeLinks: fields.includeLinks.checked,
      topLinkText: fields.topLinkText.value,
      topLinkUrl: fields.topLinkUrl.value,
    });
    await chrome.storage.sync.set(settings);
    if (fields.topLinkUrl.value.trim() && !settings.topLinkUrl) {
      setStatus(topLinkStatus, "That URL isn't valid (http or https only), so the link is hidden.", "bad");
    } else {
      setStatus(topLinkStatus, settings.topLinkUrl ? "Saved." : fields.topLinkText.value.trim() ? "Saved. Add a URL to show the link." : "", settings.topLinkUrl ? "ok" : "");
    }
    if (settings.defaultFilter === "custom" && !settings.customQuery) {
      setStatus(prefsStatus, "Saved. Add a custom filter, or the panel uses Today & overdue.", "bad");
    } else {
      setStatus(prefsStatus, "Saved.", "ok");
    }
  }, 300);
}
for (const el of Object.values(fields)) {
  el.addEventListener("input", savePrefs);
  el.addEventListener("change", savePrefs);
}
// Re-show sanitized values (e.g. duration rounded to 5) when leaving a field.
for (const el of [fields.defaultDuration, fields.defaultTitle, fields.topLinkText]) {
  el.addEventListener("blur", async () => {
    await new Promise((r) => setTimeout(r, 350));
    fillPrefs(await getSettings());
  });
}

// ----------------------------------------------------------------- Google

const gStatus = $("g-status");
const clientId = chrome.runtime.getManifest().oauth2?.client_id ?? "";

function renderGoogle(ctx: CalendarContext | null): void {
  $("g-client").replaceChildren(
    clientId
      ? Object.assign(document.createElement("span"), { className: "pill ok", textContent: "Included in this build" })
      : Object.assign(document.createElement("span"), { className: "pill bad", textContent: "Not set — see setup below" }),
  );
  let conn = "Not connected";
  let tone = "bad";
  if (!clientId) conn = "Unavailable until a client ID is built in";
  else if (ctx?.googleDisabled) conn = "Disconnected (using the prefilled-page fallback)";
  else if (ctx?.googleConnected) {
    conn = "Connected";
    tone = "ok";
  }
  $("g-conn").replaceChildren(Object.assign(document.createElement("span"), { className: `pill ${tone}`, textContent: conn }));
  $("g-zone").textContent = ctx?.timeZone ?? "–";
  $<HTMLButtonElement>("g-connect").disabled = !clientId || Boolean(ctx?.googleConnected && !ctx.googleDisabled);
  $<HTMLButtonElement>("g-disconnect").disabled = !clientId || !ctx?.googleConnected || ctx.googleDisabled;
  ($("setup") as HTMLDetailsElement).open = !clientId;
}

async function refreshGoogle(): Promise<void> {
  const result = await send("calendar/context", {});
  renderGoogle(result.ok ? result.data : null);
  if (!result.ok) setStatus(gStatus, result.error.message, "bad");
}

$("g-connect").addEventListener("click", async () => {
  setStatus(gStatus, "Waiting for Google…");
  const result = await send("google/connect", {});
  if (result.ok) {
    renderGoogle(result.data);
    setStatus(gStatus, result.data.googleConnected ? "Connected to Google Calendar." : "Couldn't finish connecting.", result.data.googleConnected ? "ok" : "bad");
  } else {
    setStatus(gStatus, result.error.message, "bad");
  }
});
$("g-disconnect").addEventListener("click", async () => {
  const result = await send("google/disconnect", {});
  if (result.ok) {
    renderGoogle(result.data);
    setStatus(gStatus, "Disconnected. Drops now open a prefilled Calendar page instead.");
  } else {
    setStatus(gStatus, result.error.message, "bad");
  }
});

for (const id of ["ext-id", "ext-id-2"]) $(id).textContent = chrome.runtime.id;
$("copy-id").addEventListener("click", async () => {
  await navigator.clipboard.writeText(chrome.runtime.id);
  setStatus(gStatus, "Extension ID copied.", "ok");
});
// chrome:// links can't be followed from a page; open it as a tab instead.
$("ext-link").addEventListener("click", (event) => {
  event.preventDefault();
  void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
});

// ------------------------------------------------------------------- boot

fillPrefs(DEFAULT_SETTINGS);
void (async () => {
  fillPrefs(await getSettings());
  await showTokenState();
  renderGoogle(null);
  await refreshGoogle();
})();
