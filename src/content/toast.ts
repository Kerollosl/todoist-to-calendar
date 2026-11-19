// Result toasts with actions (Undo, Open event). Success toasts auto-dismiss;
// anything that needs attention stays until dismissed.
import { h, icon } from "./dom";

export interface ToastAction {
  label: string;
  primary?: boolean;
  run: () => void | Promise<void>;
}

export interface ToastOptions {
  message: string;
  tone: "success" | "info" | "error";
  details?: string[];
  actions?: ToastAction[];
  link?: { label: string; href: string };
  /** Auto-dismiss after this many ms; null keeps it until dismissed. */
  timeoutMs: number | null;
}

export class Toasts {
  readonly el: HTMLElement;
  private current: { node: HTMLElement; timer: number | undefined } | null = null;

  constructor() {
    this.el = h("div", { class: "toast-layer" });
  }

  show(options: ToastOptions): void {
    this.dismiss();
    const close = h("button", { class: "icon-btn", type: "button", "aria-label": "Dismiss" }, icon("close"));
    const actions = h("div", { class: "toast-actions" });
    const node = h(
      "div",
      { class: `toast ${options.tone}`, role: options.tone === "error" ? "alert" : "status", "aria-live": options.tone === "error" ? "assertive" : "polite" },
      h(
        "div",
        { class: "toast-body" },
        h("div", { class: "toast-message" }, options.message),
        options.details?.length ? h("ul", { class: "toast-details" }, ...options.details.map((d) => h("li", {}, d))) : null,
      ),
      actions,
      close,
    );
    for (const action of options.actions ?? []) {
      const button = h("button", { class: `btn ${action.primary ? "primary" : "text"}`, type: "button" }, action.label);
      button.addEventListener("click", async () => {
        for (const b of actions.querySelectorAll("button")) b.disabled = true;
        button.textContent = "Working…";
        this.pause();
        await action.run();
      });
      actions.append(button);
    }
    if (options.link) {
      const a = h("a", { class: "btn text", href: options.link.href, target: "_blank", rel: "noopener noreferrer" }, options.link.label);
      actions.append(a);
    }
    close.addEventListener("click", () => this.dismiss());

    const entry = { node, timer: undefined as number | undefined };
    this.current = entry;
    const arm = () => {
      clearTimeout(entry.timer);
      if (options.timeoutMs !== null) entry.timer = window.setTimeout(() => this.current === entry && this.dismiss(), options.timeoutMs);
    };
    // Don't vanish while the user is reading or about to click.
    node.addEventListener("pointerenter", () => this.pause());
    node.addEventListener("focusin", () => this.pause());
    node.addEventListener("pointerleave", () => {
      if (!node.contains((node.getRootNode() as ShadowRoot).activeElement)) arm();
    });
    this.el.append(node);
    arm();
  }

  dismiss(): void {
    if (!this.current) return;
    clearTimeout(this.current.timer);
    this.current.node.remove();
    this.current = null;
  }

  private pause(): void {
    if (this.current) clearTimeout(this.current.timer);
  }
}
