// Fallback when the Calendar API isn't available: a prefilled "create event"
// page (https://calendar.google.com/calendar/render?action=TEMPLATE…). Pure.
import { addDays } from "./time";

export interface TemplateInput {
  title: string;
  details: string;
  allDay: boolean;
  /** "YYYY-MM-DDTHH:MM" wall time, or "YYYY-MM-DD" when allDay. */
  start: string;
  /** Same format as start; inclusive for all-day. */
  end: string;
  /**
   * Zone of the wall times. Leave undefined to let Calendar read them in the
   * user's own Calendar time zone, which matches the grid they dropped onto.
   */
  timeZone?: string;
}

const compact = (value: string) => value.replace(/[-:]/g, "");

export function buildTemplateUrl(input: TemplateInput): string {
  const dates = input.allDay
    ? `${compact(input.start)}/${compact(addDays(input.end, 1))}`
    : `${compact(input.start)}00/${compact(input.end)}00`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: input.title, details: input.details, dates });
  if (!input.allDay && input.timeZone) params.set("ctz", input.timeZone);
  return `https://calendar.google.com/calendar/render?${params}`;
}
