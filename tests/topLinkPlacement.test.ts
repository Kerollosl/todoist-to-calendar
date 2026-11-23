// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

it("keeps the top link in the Calendar banner through edits, dialogs, and header changes", async () => {
  const location = new URL("https://calendar.google.com/calendar/u/1/r/week/2026/11/20");
  const navigation = new EventTarget();
  vi.stubGlobal("location", location);
  vi.stubGlobal("navigation", navigation);
  vi.stubGlobal("chrome", {
    storage: {
      sync: { get: async () => ({ topLinkUrl: "https://example.com", topLinkText: "Goals" }) },
      onChanged: { addListener: vi.fn() },
    },
  });
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(80);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(34);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.localName === "ttc-toplink") {
      return new DOMRect(parseFloat(this.style.left), parseFloat(this.style.top), 80, 34);
    }
    const box = this.getAttribute("data-box")?.split(",").map(Number);
    return new DOMRect(...(box ?? []));
  });

  document.body.innerHTML = `
    <header role="banner" data-box="0,20,1200,64">
      <button data-box="12,24,80,40">Today</button>
    </header>
  `;
  const banner = document.querySelector("header")!;
  const mountedLink = () => document.querySelector<HTMLElement>("ttc-toplink");
  const navigate = (path: string) => {
    location.pathname = path;
    navigation.dispatchEvent(new Event("currententrychange"));
  };

  await import("../src/content/topLink");
  await vi.waitFor(() => expect(mountedLink()?.hasAttribute("data-visible")).toBe(true));
  expect(mountedLink()?.parentElement).toBe(banner);
  expect(mountedLink()?.style.top).toBe("35px");

  navigate("/calendar/u/1/r/eventedit/example");
  await vi.waitFor(() => expect(mountedLink()).toBeNull());
  navigate("/calendar/u/1/r/settings");
  await vi.waitFor(() => expect(mountedLink()).toBeNull());

  navigate("/calendar/u/1/r/month/2026/11/20");
  await vi.waitFor(() => expect(mountedLink()?.hasAttribute("data-visible")).toBe(true));

  const search = document.createElement("input");
  search.setAttribute("data-box", "385,24,430,40");
  banner.append(search);
  await vi.waitFor(() => expect(mountedLink()?.hasAttribute("data-visible")).toBe(false));
  search.remove();
  await vi.waitFor(() => expect(mountedLink()?.hasAttribute("data-visible")).toBe(true));

  const dialog = document.createElement("dialog");
  dialog.open = true;
  document.body.append(dialog);
  await vi.waitFor(() => expect(mountedLink()).toBeNull());
  dialog.remove();
  await vi.waitFor(() => expect(mountedLink()?.hasAttribute("data-visible")).toBe(true));

  const replacement = document.createElement("header");
  replacement.setAttribute("role", "banner");
  replacement.setAttribute("data-box", "0,0,1200,64");
  banner.replaceWith(replacement);
  await vi.waitFor(() => expect(mountedLink()?.parentElement).toBe(replacement));
  expect(mountedLink()?.style.top).toBe("15px");
});
