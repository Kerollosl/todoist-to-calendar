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
