import { formatICalDate } from "../../lib/feedUtils";
import { isOnlineOnlyEvent } from "../../lib/locationUtils";

export interface CalendarEvent {
  id: string;
  title: string;
  event_date: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  venue_name?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  link?: string;
  description?: string;
}

export function validateHttpUrl(url: string | null | undefined): string {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : "";
}

export function buildFullAddress(event: CalendarEvent): string {
  return [
    event.address_line_1,
    event.address_line_2,
    event.city,
    event.state_province,
    event.postal_code,
    event.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function getCalendarLocation(event: CalendarEvent): string {
  if (isOnlineOnlyEvent(event)) {
    return validateHttpUrl(event.link);
  }
  const address = buildFullAddress(event);
  if (address) return address;
  return event.venue_name || event.location || "";
}

export function getEventEndTime(startTime: string | undefined, endTime: string | undefined): string | undefined {
  if (endTime) return endTime.slice(0, 5);
  if (!startTime) return undefined;
  const [hStr, mStr] = startTime.slice(0, 5).split(":");
  const hours = Number(hStr);
  const minutes = Number(mStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  const nextHour = (hours + 1) % 24;
  return `${String(nextHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatGoogleDate(dateYmd: string): string {
  return dateYmd.replace(/-/g, "");
}

function addOneDay(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

type GoogleCalPayload =
  | { kind: "timed"; start: string; end: string; tz: "America/Denver" }
  | { kind: "allDay"; start: string; end: string };

export function toGooglePayload(event: CalendarEvent): GoogleCalPayload {
  if (!event.start_time) {
    const start = formatGoogleDate(event.event_date);
    const end = addOneDay(event.event_date);
    return { kind: "allDay", start, end };
  }

  const start = formatICalDate(event.event_date, event.start_time);
  const end = formatICalDate(event.event_date, getEventEndTime(event.start_time, event.end_time));
  return { kind: "timed", start, end, tz: "America/Denver" };
}

export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const payload = toGooglePayload(event);
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", event.title);

  const datesValue =
    payload.kind === "timed"
      ? `${payload.start}/${payload.end}`
      : `${payload.start}/${payload.end}`;
  params.set("dates", datesValue);

  if (payload.kind === "timed") {
    params.set("ctz", payload.tz);
  }

  const location = getCalendarLocation(event);
  if (location) params.set("location", location);

  const sourceUrl = validateHttpUrl(event.link);
  const detailParts: string[] = [];
  if (sourceUrl) detailParts.push(sourceUrl);
  if (event.description) detailParts.push(event.description.slice(0, 1500));
  if (detailParts.length > 0) {
    params.set("details", detailParts.join("\n\n"));
  }

  // URLSearchParams encodes `/` as `%2F`; Google accepts both in `dates`, but the
  // raw `/` is canonical. Restore it so the URL matches documented examples.
  return `https://calendar.google.com/calendar/render?${params.toString().replace(
    /dates=([^&]+)/,
    (_, v: string) => `dates=${v.replace(/%2F/g, "/")}`
  )}`;
}
