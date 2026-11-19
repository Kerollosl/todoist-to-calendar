// Human summaries of create/undo outcomes for the toast. Pure.
import type { CreateResult, TaskRef, UndoResult } from "../shared/types";
import { plainTitle } from "./tasks";

export interface Summary {
  tone: "success" | "info" | "error";
  message: string;
  details: string[];
}

const quote = (task: Pick<TaskRef, "content">) => `“${plainTitle(task.content)}”`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function describeCreate(result: CreateResult, tasks: readonly TaskRef[], complete: boolean): Summary {
  if (result.mode === "template") {
    return {
      tone: "info",
      message: "Opened a prefilled event in a new tab. Save it there to add it to your calendar.",
      details: complete ? ["Tasks were not checked off, because the event isn't created until you save it."] : [],
    };
  }
  if (!complete) return { tone: "success", message: "Event created", details: [] };

  const details: string[] = [];
  for (const failure of result.failed) details.push(`Couldn't check off ${quote(failure.task)}: ${failure.reason}`);
  if (result.notAttempted.length) {
    details.push(`Not attempted after that error: ${result.notAttempted.map(quote).join(", ")}`);
  }
  const problems = details.length > 0;
  for (const task of result.closed.filter((t) => t.isRecurring)) {
    details.push(`${quote(task)} is recurring, so it moved to its next date instead of being finished.`);
  }
  const closed = result.closed.length;
  return {
    tone: problems ? "error" : "success",
    message: problems
      ? `Event created · ${closed} of ${plural(tasks.length, "task")} checked off`
      : `Event created · ${plural(closed, "task")} checked off`,
    details,
  };
}

export function describeUndo(result: UndoResult, requestedDelete: boolean): Summary {
  const parts: string[] = [];
  if (result.eventDeleted) parts.push("event deleted");
  if (result.reopened.length) parts.push(`${plural(result.reopened.length, "task")} reopened`);
  const details: string[] = [];
  for (const failure of result.failed) details.push(`Couldn't reopen ${quote(failure.task)}: ${failure.reason}`);
  if (requestedDelete && !result.eventDeleted && result.eventError) details.push(`The event was not deleted: ${result.eventError}`);
  for (const task of result.skippedRecurring) {
    details.push(`${quote(task)} is recurring and keeps its new date. Move it back in Todoist if needed.`);
  }
  const problems = result.failed.length > 0 || Boolean(requestedDelete && result.eventError);
  const message = parts.length ? `Undone: ${parts.join(" and ")}` : problems ? "Undo didn't complete" : "Nothing to undo";
  return { tone: problems ? "error" : "success", message: message.charAt(0).toUpperCase() + message.slice(1), details };
}

/** Only link to Google Calendar's own pages. */
export function safeEventLink(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" && (url.hostname === "www.google.com" || url.hostname === "calendar.google.com") ? url.href : null;
  } catch {
    return null;
  }
}
