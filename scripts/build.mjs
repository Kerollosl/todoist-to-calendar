#!/usr/bin/env node
// Builds the extension into dist/ (load that folder unpacked in Chrome).
//
//   node scripts/build.mjs           one-off build
//   node scripts/build.mjs --watch   rebuild on change
//
// GOOGLE_CLIENT_ID is read from the environment or from .env. When it is set,
// dist/manifest.json gets an "oauth2" block so chrome.identity.getAuthToken can
// create events through the Calendar API. Without it the extension still works
// and falls back to opening a prefilled Google Calendar "create event" page.
import { build, context } from "esbuild";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

async function readDotEnv() {
  try {
    const text = await readFile(path.join(root, ".env"), "utf8");
    const env = {};
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && !line.trimStart().startsWith("#")) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
    return env;
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

/** Chrome derives an unpacked extension's ID from the manifest "key". */
function extensionIdFromKey(base64Key) {
  const hex = createHash("sha256").update(Buffer.from(base64Key, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16))).join("");
}

async function writeManifest() {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.base.json"), "utf8"));
  const env = { ...(await readDotEnv()), ...process.env };
  const clientId = (env.GOOGLE_CLIENT_ID || "").trim();
  if (clientId) {
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      throw new Error(`GOOGLE_CLIENT_ID does not look like an OAuth client ID: "${clientId}"`);
    }
    manifest.oauth2 = { client_id: clientId, scopes: [CALENDAR_SCOPE] };
  }
  await writeFile(path.join(dist, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { id: extensionIdFromKey(manifest.key), hasClientId: Boolean(clientId) };
}

async function copyStatic() {
  await cp(path.join(root, "icons"), path.join(dist, "icons"), { recursive: true });
  await cp(path.join(root, "src/options/options.html"), path.join(dist, "options.html"));
}

const shared = {
  bundle: true,
  target: "chrome116",
  legalComments: "none",
  logLevel: "warning",
  sourcemap: watch ? "inline" : false,
};
const entries = [
  { entryPoints: [path.join(root, "src/background/index.ts")], outfile: path.join(dist, "background.js"), format: "esm" },
  { entryPoints: [path.join(root, "src/content/index.ts")], outfile: path.join(dist, "content.js"), format: "iife" },
  { entryPoints: [path.join(root, "src/options/options.ts")], outfile: path.join(dist, "options.js"), format: "iife" },
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyStatic();
const { id, hasClientId } = await writeManifest();

if (watch) {
  for (const entry of entries) {
    const ctx = await context({ ...shared, ...entry });
    await ctx.watch();
  }
  console.log(`Watching… dist/ is ready. Extension ID: ${id}`);
} else {
  await Promise.all(entries.map((entry) => build({ ...shared, ...entry })));
  console.log(`Built dist/  ·  extension ID ${id}  ·  Google client ID ${hasClientId ? "included" : "not set (Calendar API disabled; template fallback only)"}`);
}
