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
  grip: `<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="2.5" cy="3" r="1.3"/><circle cx="7.5" cy="3" r="1.3"/><circle cx="2.5" cy="8" r="1.3"/><circle cx="7.5" cy="8" r="1.3"/><circle cx="2.5" cy="13" r="1.3"/><circle cx="7.5" cy="13" r="1.3"/></g></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  calendar: `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  clock: `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 13.5 6.2 6a1.5 1.5 0 0 1 1.4-1h8.8a1.5 1.5 0 0 1 1.4 1L20 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 13.5h4.5l1 2h5l1-2H20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  hash: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9.5 4 8 20M16 4l-1.5 16M4.5 9h15M4 15h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  today: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 9.5h16" stroke="currentColor" stroke-width="1.7"/><text x="12" y="17.6" text-anchor="middle" font-size="7.5" font-family="Arial, sans-serif" font-weight="700" fill="currentColor">${new Date().getDate()}</text></svg>`,
  upcoming: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 9.5h16M8 13h2M12 13h2M16 13h0M8 16.5h2M12 16.5h2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 6h14l-5.5 6.5V18l-3 1.5v-7Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3.5 2.5 20h19L12 3.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
} as const;

export function icon(name: keyof typeof ICONS): SVGElement {
  return svg(ICONS[name]);
}
