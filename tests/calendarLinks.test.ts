import { describe, it, expect } from "vitest";
import {
  buildGoogleCalendarUrl,
  getCalendarLocation,
  getEventEndTime,
  toGooglePayload,
  validateHttpUrl,
  type CalendarEvent,
} from "../src/utils/calendarLinks";
import { buildEventIcalUrl } from "../src/utils/eventUrls";

const baseEvent: CalendarEvent = {
  id: "216a13d3-99dd-4266-9ec6-ccdc119423c9",
  title: "UtahJS SLC Meetup - Intro to WASM",
  event_date: "2026-06-17",
  start_time: "19:00:00",
  end_time: "21:00:00",
  venue_name: "Software Technology Group",
  address_line_1: "555 S 300 E",
  city: "Salt Lake City",
  state_province: "UT",
  postal_code: "84111",
  country: "USA",
  link: "https://www.meetup.com/utahjs/events/307276974",
  description: "Join us in person or on Zoom!",
};

describe("validateHttpUrl", () => {
  it("accepts https URLs", () => {
    expect(validateHttpUrl("https://example.com")).toBe("https://example.com");
  });
  it("accepts http URLs", () => {
    expect(validateHttpUrl("http://example.com")).toBe("http://example.com");
  });
  it("rejects javascript: URLs", () => {
    expect(validateHttpUrl("javascript:alert(1)")).toBe("");
  });
  it("rejects data: URLs", () => {
    expect(validateHttpUrl("data:text/html,<script>alert(1)</script>")).toBe("");
  });
  it("rejects file: URLs", () => {
    expect(validateHttpUrl("file:///etc/passwd")).toBe("");
  });
  it("handles null/undefined", () => {
    expect(validateHttpUrl(null)).toBe("");
    expect(validateHttpUrl(undefined)).toBe("");
    expect(validateHttpUrl("")).toBe("");
  });
});

describe("getEventEndTime", () => {
  it("slices HH:MM:SS to HH:MM when end_time provided", () => {
    expect(getEventEndTime("19:00:00", "21:00:00")).toBe("21:00");
  });
  it("falls back to start+1h when end_time missing", () => {
    expect(getEventEndTime("19:00:00", undefined)).toBe("20:00");
  });
  it("handles HH:MM:SS input without double-seconds corruption", () => {
    // The RSS/iCal double-seconds regression (2026-04-04):
    // ensure we don't produce "20:00:00:00" from "19:00:00" input.
    const result = getEventEndTime("19:00:00", undefined);
    expect(result).toBe("20:00");
    expect(result).not.toMatch(/:\d+:\d+:\d+/);
  });
  it("produces same result for HH:MM and HH:MM:SS inputs", () => {
    expect(getEventEndTime("19:00", undefined)).toBe(getEventEndTime("19:00:00", undefined));
  });
  it("wraps past midnight", () => {
    expect(getEventEndTime("23:30:00", undefined)).toBe("00:30");
  });
  it("returns undefined when start_time missing", () => {
    expect(getEventEndTime(undefined, undefined)).toBeUndefined();
  });
});

describe("toGooglePayload", () => {
  it("builds timed payload for events with start_time", () => {
    const payload = toGooglePayload(baseEvent);
    expect(payload.kind).toBe("timed");
    if (payload.kind === "timed") {
      expect(payload.start).toBe("20260617T190000");
      expect(payload.end).toBe("20260617T210000");
      expect(payload.tz).toBe("America/Denver");
    }
  });

  it("builds allDay payload for events without start_time", () => {
    const payload = toGooglePayload({ ...baseEvent, start_time: undefined });
    expect(payload.kind).toBe("allDay");
    if (payload.kind === "allDay") {
      expect(payload.start).toBe("20260617");
      expect(payload.end).toBe("20260618");
    }
  });

  it("handles HH:MM:SS start_time without double-seconds", () => {
    const payload = toGooglePayload({ ...baseEvent, start_time: "19:00:00", end_time: undefined });
    if (payload.kind === "timed") {
      expect(payload.start).toBe("20260617T190000");
      expect(payload.end).toBe("20260617T200000");
    }
  });
});

describe("buildGoogleCalendarUrl", () => {
  it("includes action=TEMPLATE and text", () => {
    const url = buildGoogleCalendarUrl(baseEvent);
    expect(url).toContain("calendar.google.com/calendar/render");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=UtahJS+SLC+Meetup+-+Intro+to+WASM");
  });

  it("includes ctz=America/Denver for timed events", () => {
    const url = buildGoogleCalendarUrl(baseEvent);
    expect(url).toContain("ctz=America%2FDenver");
  });

  it("omits ctz for all-day events", () => {
    const url = buildGoogleCalendarUrl({ ...baseEvent, start_time: undefined });
    expect(url).not.toContain("ctz=");
  });

  it("preserves unencoded slash in dates param", () => {
    const url = buildGoogleCalendarUrl(baseEvent);
    expect(url).toMatch(/dates=20260617T190000\/20260617T210000/);
  });

  it("uses exclusive end date for all-day events", () => {
    const url = buildGoogleCalendarUrl({ ...baseEvent, start_time: undefined });
    expect(url).toMatch(/dates=20260617\/20260618/);
  });

  it("routes physical address into location", () => {
    const url = buildGoogleCalendarUrl(baseEvent);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("location")).toContain("Salt Lake City");
  });

  it("routes event.link into location for online-only events", () => {
    const onlineEvent: CalendarEvent = {
      ...baseEvent,
      venue_name: "Zoom",
      address_line_1: undefined,
      city: undefined,
      state_province: undefined,
      postal_code: undefined,
      country: undefined,
      location: "Zoom",
      link: "https://zoom.us/j/abc123",
    };
    const url = buildGoogleCalendarUrl(onlineEvent);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("location")).toBe("https://zoom.us/j/abc123");
  });

  it("does not embed javascript: URLs", () => {
    const maliciousEvent: CalendarEvent = {
      ...baseEvent,
      link: "javascript:alert(1)",
    };
    const url = buildGoogleCalendarUrl(maliciousEvent);
    expect(url).not.toContain("javascript");
    expect(decodeURIComponent(url)).not.toContain("javascript:");
  });

  it("URL-encodes commas and ampersands in title", () => {
    const url = buildGoogleCalendarUrl({
      ...baseEvent,
      title: "Dinner, Drinks & Code",
    });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("text")).toBe("Dinner, Drinks & Code");
  });

  it("truncates description to 1500 chars", () => {
    const longDescription = "x".repeat(2000);
    const url = buildGoogleCalendarUrl({ ...baseEvent, description: longDescription });
    const decoded = decodeURIComponent(url);
    const detailsMatch = decoded.match(/details=([^&]*)/);
    expect(detailsMatch).not.toBeNull();
    // 1500 x's plus the source URL and a blank line
    expect(detailsMatch![1].length).toBeLessThan(2000);
  });
});

describe("getCalendarLocation", () => {
  it("returns full address for in-person events", () => {
    expect(getCalendarLocation(baseEvent)).toBe("555 S 300 E, Salt Lake City, UT, 84111, USA");
  });

  it("returns validated link for online-only events", () => {
    const online: CalendarEvent = {
      ...baseEvent,
      venue_name: "Zoom",
      address_line_1: undefined,
      city: undefined,
      state_province: undefined,
      postal_code: undefined,
      country: undefined,
      location: "Zoom",
    };
    expect(getCalendarLocation(online)).toBe(baseEvent.link);
  });

  it("returns empty string for online event with invalid link", () => {
    const online: CalendarEvent = {
      ...baseEvent,
      venue_name: "Zoom",
      address_line_1: undefined,
      city: undefined,
      state_province: undefined,
      postal_code: undefined,
      country: undefined,
      location: "Zoom",
      link: "javascript:alert(1)",
    };
    expect(getCalendarLocation(online)).toBe("");
  });
});

describe("buildEventIcalUrl", () => {
  it("builds a URL pointing at the generate-ical function with event param", () => {
    const url = buildEventIcalUrl("abc-123");
    expect(url).toContain("/functions/v1/generate-ical?event=abc-123");
  });

  it("URL-encodes the event id", () => {
    const url = buildEventIcalUrl("abc&def");
    expect(url).toContain("event=abc%26def");
  });
});
