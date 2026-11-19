// Event drafts → Calendar API request bodies. Pure.
import type { EventDraft, TaskRef } from "../shared/types";
import { plainTitle, taskUrl } from "./tasks";
import { addDays, addMinutes, parseDate, parseWall, toRfc3339, toWall, wallDiffMinutes } from "./time";

/**
 * Plain-text event description, one numbered task per line:
 *   1. Task title
 *   2. Task title — https://app.todoist.com/app/task/…   (when includeLinks)
 */
export function buildDescription(tasks: readonly Pick<TaskRef, "id" | "content">[], includeLinks: boolean): string {
  return tasks.map((task, i) => `${i + 1}. ${plainTitle(task.content)}${includeLinks ? ` — ${taskUrl(task.id)}` : ""}`).join("\n");
}

/** Initial start/end for a drop target. All-day `end` is inclusive. */
export function initialTimes(
  target: { kind: "timed"; date: string; minutes: number } | { kind: "allday"; date: string },
  durationMinutes: number,
): Pick<EventDraft, "allDay" | "start" | "end"> {
  if (target.kind === "allday") return { allDay: true, start: target.date, end: target.date };
  const start = toWall(target.date, target.minutes);
  return { allDay: false, start, end: addMinutes(start, durationMinutes) };
}

/** Switch a draft between timed and all-day, keeping the date and duration sensible. */
export function convertTimes(
  times: Pick<EventDraft, "allDay" | "start" | "end">,
  toAllDay: boolean,
  durationMinutes: number,
): Pick<EventDraft, "allDay" | "start" | "end"> {
  if (times.allDay === toAllDay) return times;
  if (toAllDay) {
    const startDate = times.start.slice(0, 10);
    // An end at exactly midnight belongs to the previous day.
    const endWall = times.end.endsWith("T00:00") ? addMinutes(times.end, -1) : times.end;
    const endDate = endWall.slice(0, 10) < startDate ? startDate : endWall.slice(0, 10);
    return { allDay: true, start: startDate, end: endDate };
  }
  const start = `${times.start}T09:00`;
  return { allDay: false, start, end: addMinutes(start, durationMinutes) };
}

export function validateDraft(draft: Pick<EventDraft, "title" | "allDay" | "start" | "end" | "tasks">): string | null {
  if (!draft.title.trim()) return "Add a title.";
  if (draft.tasks.length === 0) return "No tasks selected.";
  if (draft.allDay) {
    if (!parseDate(draft.start) || !parseDate(draft.end)) return "Enter valid dates.";
    if (draft.end < draft.start) return "The end date is before the start date.";
    return null;
  }
  if (!parseWall(draft.start) || !parseWall(draft.end)) return "Enter a valid start and end.";
  const minutes = wallDiffMinutes(draft.start, draft.end);
  if (minutes <= 0) return "The end must be after the start.";
  if (minutes > 14 * 24 * 60) return "That's longer than two weeks. Check the end time.";
  return null;
}

export interface CalendarEventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface CalendarEventBody {
  id: string;
  summary: string;
  description: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
}

/**
 * The events.insert body. Timed events carry RFC 3339 times with an explicit
 * offset plus the timeZone field; all-day events use dates, end exclusive.
 * `eventId` is ours (base32hex), so a lost response can be checked with
 * events.get instead of guessing.
 */
export function buildEventBody(draft: EventDraft, zone: string, includeLinks: boolean, eventId: string): CalendarEventBody {
  const base = { id: eventId, summary: draft.title.trim(), description: buildDescription(draft.tasks, includeLinks) };
  if (draft.allDay) return { ...base, start: { date: draft.start }, end: { date: addDays(draft.end, 1) } };
  return {
    ...base,
    start: { dateTime: toRfc3339(draft.start, zone), timeZone: zone },
    end: { dateTime: toRfc3339(draft.end, zone), timeZone: zone },
  };
}

/** Calendar event IDs must be 5–1024 chars of base32hex (0-9, a-v); a UUID's hex digits qualify. */
export function newEventId(uuid: string): string {
  return `ttc${uuid.replace(/-/g, "").toLowerCase()}`;
}
