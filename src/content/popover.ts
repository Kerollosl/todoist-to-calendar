// Confirmation popover shown at the drop point: edit the title and times,
// review the numbered tasks, then choose how to create the event.
import { convertTimes, validateDraft } from "../core/draft";
import { formatDuration, plainTitle } from "../core/tasks";
import { addDays, addMinutes, wallDiffMinutes } from "../core/time";
import type { EventDraft, TaskRef } from "../shared/types";
import { h, icon } from "./dom";

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export type SubmitOutcome = { ok: true } | { ok: false; message: string; retryable: boolean };

export interface PopoverRequest {
  x: number;
  y: number;
  title: string;
  times: Pick<EventDraft, "allDay" | "start" | "end">;
  tasks: TaskRef[];
  defaultDuration: number;
  includeLinks: boolean;
  /** Extra notes, e.g. a time-zone mismatch. */
  notes: string[];
  submit: (draft: EventDraft, complete: boolean) => Promise<SubmitOutcome>;
}

export class ConfirmPopover {
  readonly el: HTMLElement;
  private readonly backdrop: HTMLElement;
  private card: HTMLElement | null = null;
  private busy = false;
  private onClose: (() => void) | null = null;

  constructor() {
    this.backdrop = h("div", { class: "backdrop", hidden: true });
    this.el = h("div", { class: "popover-layer" }, this.backdrop);
    this.backdrop.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (!this.busy) this.close();
    });
  }

  get isOpen(): boolean {
    return this.card !== null;
  }

  open(req: PopoverRequest, onClose: () => void): void {
    this.close();
    this.onClose = onClose;
    let times = { ...req.times };

    const titleInput = h("input", {
      class: "title-input",
      type: "text",
      value: req.title,
      placeholder: "Add title",
      maxlength: "200",
      required: true,
      autocomplete: "off",
      "aria-label": "Event title",
    });
    const allDayInput = h("input", { type: "checkbox" });
    const startInput = h("input", { required: true, "aria-label": "Start" });
    const endInput = h("input", { required: true, "aria-label": "End" });
    const durationHint = h("span", { class: "hint" });
    const error = h("div", { class: "error", role: "alert", hidden: true });
    const primary = h("button", { class: "btn primary", type: "submit" }, "Create & check off tasks");
    const eventOnly = h("button", { class: "btn", type: "button" }, "Create event only");
    const cancel = h("button", { class: "btn", type: "button" }, "Cancel");
    const buttons = [primary, eventOnly, cancel];

    const syncInputs = () => {
      allDayInput.checked = times.allDay;
      startInput.type = endInput.type = times.allDay ? "date" : "datetime-local";
      startInput.value = times.start;
      endInput.value = times.end;
      if (times.allDay) {
        const days = Math.round((Date.parse(times.end) - Date.parse(times.start)) / 86_400_000) + 1;
        durationHint.textContent = days > 1 ? `All day · ${days} days` : "All day";
      } else {
        const minutes = wallDiffMinutes(times.start, times.end);
        durationHint.textContent = minutes > 0 ? formatDuration(minutes) : "";
      }
    };

    allDayInput.addEventListener("change", () => {
      times = convertTimes(times, allDayInput.checked, req.defaultDuration);
      syncInputs();
    });
    startInput.addEventListener("change", () => {
      const value = startInput.value;
      if (!value) return;
      if (times.allDay) {
        const span = Math.round((Date.parse(times.end) - Date.parse(times.start)) / 86_400_000);
        times = { allDay: true, start: value, end: addDays(value, Math.max(0, span)) };
      } else {
        // Keep the duration when the start moves, like Calendar does.
        const duration = wallDiffMinutes(times.start, times.end);
        const start = value.slice(0, 16);
        times = { allDay: false, start, end: addMinutes(start, duration > 0 ? duration : req.defaultDuration) };
      }
      syncInputs();
    });
    endInput.addEventListener("change", () => {
      if (endInput.value) times = { ...times, end: times.allDay ? endInput.value : endInput.value.slice(0, 16) };
      syncInputs();
    });

    const recurring = req.tasks.filter((t) => t.isRecurring);
    const warnings: HTMLElement[] = [];
    if (recurring.length) {
      const names = recurring.map((t) => `“${plainTitle(t.content)}”`).join(", ");
      warnings.push(
        h(
          "div",
          { class: "warn" },
          icon("warning"),
          h("span", {}, `${recurring.length === 1 ? "Recurring task" : "Recurring tasks"}: ${names}. Checking off moves ${recurring.length === 1 ? "it" : "them"} to the next date instead of finishing ${recurring.length === 1 ? "it" : "them"}.`),
        ),
      );
    }
    for (const note of req.notes) warnings.push(h("div", { class: "warn" }, icon("warning"), h("span", {}, note)));

    const list = h("ol", { class: "preview" });
    for (const task of req.tasks) list.append(h("li", {}, plainTitle(task.content)));

    const form = h(
      "form",
      { novalidate: true },
      h("h3", { id: "ttc-pop-title", class: "sr-only" }, "Create calendar event"),
      titleInput,
      h(
        "div",
        { class: "prow" },
        h("span", { class: "picon" }, icon("schedule")),
        h(
          "div",
          { class: "when" },
          h("label", {}, h("span", {}, "Starts"), startInput),
          h("label", {}, h("span", {}, "Ends"), endInput),
        ),
      ),
      h("div", { class: "row-inline" }, h("label", { class: "toggle" }, allDayInput, "All day"), durationHint),
      ...warnings,
      h(
        "div",
        { class: "prow" },
        h("span", { class: "picon" }, icon("notes")),
        h(
          "div",
          {},
          h(
            "div",
            { class: "preview-head" },
            h("span", {}, `${req.tasks.length} task${req.tasks.length === 1 ? "" : "s"} in the description`),
            req.includeLinks ? h("span", { class: "hint" }, "with links") : null,
          ),
          list,
        ),
      ),
      error,
      h("div", { class: "actions" }, cancel, eventOnly, primary),
    );
    const card = h("div", { class: "popover", role: "dialog", "aria-modal": "true", "aria-labelledby": "ttc-pop-title" }, form);
    this.card = card;
    syncInputs();

    const showError = (message: string) => {
      error.textContent = message;
      error.hidden = false;
    };
    const setBusy = (busy: boolean, label?: string) => {
      this.busy = busy;
      for (const b of buttons) b.disabled = busy;
      for (const input of [titleInput, allDayInput, startInput, endInput]) input.disabled = busy;
      primary.textContent = busy && label ? label : "Create & check off tasks";
    };
    const run = async (complete: boolean) => {
      if (this.busy) return;
      const draft: EventDraft = {
        draftId: crypto.randomUUID(),
        title: titleInput.value.trim(),
        allDay: times.allDay,
        start: times.start,
        end: times.end,
        tasks: req.tasks,
      };
      const problem = validateDraft(draft);
      if (problem) {
        showError(problem);
        return;
      }
      error.hidden = true;
      setBusy(true, complete ? "Creating…" : undefined);
      if (!complete) eventOnly.textContent = "Creating…";
      const outcome = await req.submit(draft, complete);
      if (this.card !== card) return; // closed meanwhile
      if (outcome.ok) {
        this.close();
        return;
      }
      setBusy(false);
      eventOnly.textContent = "Create event only";
      showError(outcome.message);
      if (!outcome.retryable) {
        primary.hidden = true;
        eventOnly.hidden = true;
        cancel.textContent = "Close";
      }
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void run(true);
    });
    eventOnly.addEventListener("click", () => void run(false));
    cancel.addEventListener("click", () => {
      if (!this.busy) this.close();
    });

    this.backdrop.hidden = false;
    this.el.append(card);
    this.position(card, req.x, req.y);
    // Grow out of the drop point (origin-aware), quick ease-out.
    card.animate(
      reducedMotion()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }],
      { duration: 180, easing: EASE_OUT },
    );
    titleInput.focus();
    titleInput.select();
  }

  close(): void {
    if (!this.card) return;
    const card = this.card;
    // Exit faster than enter; remove only after the fade.
    const exit = card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion() ? 0 : 120, easing: EASE_OUT, fill: "forwards" });
    card.style.pointerEvents = "none";
    exit.finished.then(() => card.remove(), () => card.remove());
    this.card = null;
    this.busy = false;
    this.backdrop.hidden = true;
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  /** Esc cancels; Tab stays inside the dialog. */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.card) return false;
    if (event.key === "Escape") {
      if (!this.busy) this.close();
      return true;
    }
    if (event.key === "Tab") {
      const focusables = [...this.card.querySelectorAll<HTMLElement>("input, button")].filter((el) => !el.hidden && !(el as HTMLButtonElement).disabled);
      if (focusables.length === 0) return true;
      const root = this.card.getRootNode() as ShadowRoot;
      const index = focusables.indexOf(root.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : index === focusables.length - 1 ? 0 : index + 1;
      focusables[next]?.focus();
      return true;
    }
    return false;
  }

  /** Beside the drop point, flipped and clamped to stay on screen. */
  private position(card: HTMLElement, x: number, y: number): void {
    const margin = 12;
    const { width, height } = card.getBoundingClientRect();
    let left = x + margin;
    if (left + width > window.innerWidth - margin) left = x - margin - width;
    left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - width - margin));
    const top = Math.min(Math.max(margin, y - 60), Math.max(margin, window.innerHeight - height - margin));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    card.style.transformOrigin = `${Math.round(x - left)}px ${Math.round(y - top)}px`;
  }
}
