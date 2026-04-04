// Shared feed formatting utilities used by generate-rss, generate-ical, and tests.
// Keep this file free of project-specific types so it can be imported by Deno.

/**
 * Format a date + optional time for RSS <pubDate> (RFC 2822).
 * `time` may arrive as "HH:MM" or "HH:MM:SS" from PostgreSQL.
 */
export function formatRssDate(date: string, time?: string): string {
  const timeStr = time ? time.slice(0, 5) : '00:00';
  const dateTimeStr = `${date}T${timeStr}:00`;

  const dateObj = new Date(dateTimeStr);

  if (isNaN(dateObj.getTime())) {
    const fallback = new Date(date);
    if (!isNaN(fallback.getTime())) return fallback.toUTCString();
    return '';
  }

  return dateObj.toUTCString();
}

/**
 * Format a date + optional time for iCal DTSTART/DTEND (yyyyMMddTHHmmss).
 * `time` may arrive as "HH:MM" or "HH:MM:SS" from PostgreSQL.
 */
export function formatICalDate(date: string, time?: string): string {
  const timeStr = time ? time.slice(0, 5) : '00:00';
  const dateStr = `${date}T${timeStr}:00`;
  return dateStr.replace(/[-:]/g, '');
}
