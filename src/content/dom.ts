// Tiny DOM helpers. All text goes through textContent; nothing is parsed as HTML
// except our own static SVG icons.

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "class") el.className = String(value);
    else el.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

const svgParser = new DOMParser();
/** Parse one of OUR static SVG strings (never user content). */
export function svg(markup: string): SVGElement {
  // Without the SVG namespace the XML parser yields inert, unrendered elements.
  const withNs = markup.includes("xmlns=") ? markup : markup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  const doc = svgParser.parseFromString(withNs, "image/svg+xml");
  return document.importNode(doc.documentElement, true) as unknown as SVGElement;
}

export const ICONS = {
  logo: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="#dc4c3e"/><path d="M6.5 8.2h11M6.5 7.2v9.3a1.3 1.3 0 0 0 1.3 1.3h8.4a1.3 1.3 0 0 0 1.3-1.3V7.2a1.3 1.3 0 0 0-1.3-1.3H7.8a1.3 1.3 0 0 0-1.3 1.3Z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="m9.3 13.2 1.9 1.8 3.6-3.7" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  check: `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m3.5 8.3 3 2.9 6-6.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  recurring: `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M12.5 6A5 5 0 0 0 3.6 4.8M3.5 10a5 5 0 0 0 8.9 1.2M3.2 2.5v2.6h2.6M12.8 13.5v-2.6h-2.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3.5 2.5 20h19L12 3.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
} as const;

export function icon(name: keyof typeof ICONS): SVGElement {
  return svg(ICONS[name]);
}
