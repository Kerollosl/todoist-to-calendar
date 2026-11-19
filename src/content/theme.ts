// Match Google Calendar's light/dark mode by reading its rendered background,
// which follows Calendar's own theme setting rather than only the OS setting.

export type Theme = "light" | "dark";

export function luminanceIsDark(color: string): boolean | null {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(color);
  if (!m || m[4] === "0") return null;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export function detectTheme(): Theme {
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const dark = luminanceIsDark(getComputedStyle(el).backgroundColor);
    if (dark !== null) return dark ? "dark" : "light";
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export interface CalendarLook {
  theme: Theme;
  /** Background of Calendar's grid card, e.g. "rgb(19, 19, 20)" in dark mode. */
  surface: string | null;
  /** Corner radius of that card (28px as of 2026-11). */
  radius: string | null;
  font: string | null;
}

function opaque(color: string): boolean {
  const m = /rgba?\([^)]*?(?:,\s*([\d.]+))?\)$/.exec(color);
  return Boolean(m) && (m![1] === undefined || Number(m![1]) > 0.9);
}

/**
 * Read Calendar's own surface color, card radius and font so the panel matches
 * exactly in light and dark mode. FRAGILE but harmless: the first rounded,
 * opaque element (≥ 200px wide) inside [role="main"] is the grid card; if none
 * is found the CSS fallbacks in styles.ts apply.
 */
let lastCard: { theme: Theme; surface: string; radius: string } | null = null;

export function readCalendarLook(doc: Document = document): CalendarLook {
  const theme = detectTheme();
  let surface: string | null = null;
  let radius: string | null = null;
  const main = doc.querySelector('[role="main"]');
  if (main) {
    // The card spans the main column, which can be narrow while our panel is docked.
    const minWidth = Math.max(40, main.getBoundingClientRect().width - 4);
    const queue: Element[] = [main];
    for (let visited = 0; queue.length && visited < 60; visited++) {
      const el = queue.shift()!;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.borderTopRightRadius) > 0 && opaque(cs.backgroundColor) && el.getBoundingClientRect().width >= minWidth) {
        surface = cs.backgroundColor;
        radius = cs.borderTopRightRadius;
        break;
      }
      queue.push(...Array.from(el.children).slice(0, 8));
    }
  }
  if (surface && radius) lastCard = { theme, surface, radius };
  else if (lastCard?.theme === theme) ({ surface, radius } = lastCard); // keep the last good reading
  const font = doc.body ? getComputedStyle(doc.body).fontFamily || null : null;
  return { theme, surface, radius, font };
}

/** Apply a look to a `.ttc` container: theme attribute plus measured overrides. */
export function applyLook(el: HTMLElement, look: CalendarLook): void {
  el.dataset.theme = look.theme;
  const set = (name: string, value: string | null) => (value ? el.style.setProperty(name, value) : el.style.removeProperty(name));
  set("--bg", look.surface);
  set("--radius", look.radius);
  set("--font", look.font);
}
