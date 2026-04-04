---
title: "RSS/iCal feeds produce Invalid Date due to double-seconds in time formatting"
date: 2026-04-04
category: logic-errors
module: feed-generation
problem_type: logic_error
component: tooling
symptoms:
  - "Every <pubDate> in the RSS feed renders as Invalid Date"
  - "iCal DTSTART/DTEND values are malformed, causing calendar clients to reject events"
  - "RSS dates displayed in UTC instead of Mountain Time after partial fix"
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags:
  - rss
  - ical
  - timezone
  - mountain-time
  - date-formatting
  - edge-functions
  - postgresql
  - intl-datetimeformat
---

# RSS/iCal feeds produce Invalid Date due to double-seconds in time formatting

## Problem

The RSS and iCal feeds produced `Invalid Date` entries for every event because PostgreSQL `time` columns return `HH:MM:SS` (e.g. `19:00:00`), and the formatting functions blindly appended `:00` for seconds, creating unparseable strings like `2026-04-07T19:00:00:00`.

## Symptoms

- Every `<pubDate>` in the RSS feed rendered as `Invalid Date`
- iCal DTSTART/DTEND values were malformed, causing calendar clients to reject or silently drop events
- The bug was introduced in commit 666e0a3 ("Fix RSS feed timezone") which added Mountain Time support but lacked time-string normalization

## What Didn't Work

1. **`slice(0, 5)` + `toUTCString()`** — Fixed the Invalid Date crash but emitted UTC times, losing the Mountain Time intent. Utah events at 7 PM displayed as 1 AM the next day in some readers.

2. **Manual RFC 2822 with hardcoded `-0600`** — Correct during MDT but wrong half the year; MST is `-0700`. Hardcoding an offset ignores DST transitions.

3. **`Intl.DateTimeFormat` with `Date.UTC()` input** — The formatter converts *from* UTC *to* the target timezone, so feeding it `18:30 UTC` produced `12:30 MDT`. The conversion went the wrong direction: we already had wall-clock Mountain Time and needed to keep it, not re-convert it.

## Solution

Extracted formatting into a shared `lib/feedUtils.ts`. The key insight: use `Intl.DateTimeFormat` only to resolve the correct UTC offset for a given calendar date in `America/Denver`, then stitch the original wall-clock time together with that offset.

**Before (inline in generate-rss):**
```ts
function formatRssDate(date: string, time?: string): string {
  const timeStr = time || '00:00';
  const dateTimeStr = `${date}T${timeStr}:00`; // "2026-04-07T19:00:00:00" — broken
  const dateObj = new Date(dateTimeStr);
  return dateObj.toUTCString();
}
```

**After (lib/feedUtils.ts):**
```ts
const MOUNTAIN_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Denver',
  timeZoneName: 'longOffset',
});

function getMountainOffset(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const parts = MOUNTAIN_OFFSET_FORMATTER.formatToParts(d);
  const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT-06:00';
  return tz.replace('GMT', '').replace(':', '');
}

export function formatRssDate(date: string, time?: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return '';
  const timeStr = time ? time.slice(0, 5) : '00:00'; // normalize HH:MM:SS -> HH:MM
  const [hours, minutes] = timeStr.split(':');
  // ... build RFC 2822 with original wall-clock time + resolved offset
  const offset = getMountainOffset(year, month, day);
  return `${dayName}, ${dd} ${monthName} ${year} ${hh}:${mm}:00 ${offset}`;
}
```

**iCal fix — same normalization pattern:**
```ts
// Before: time.padStart(5, '0') — no-op on "19:00:00" (already > 5 chars)
// After:  time.slice(0, 5)      — reliably yields "19:00"
export function formatICalDate(date: string, time?: string): string {
  const timeStr = time ? time.slice(0, 5) : '00:00';
  return `${date}T${timeStr}:00`.replace(/[-:]/g, '');
}
```

## Why This Works

The database stores event times as wall-clock Mountain Time (the organizer's local time). The old code treated these values as if they needed timezone conversion, or failed to account for the `HH:MM:SS` format at all. The fix does two things:

1. **Normalizes the time string** with `slice(0, 5)` so it is always `HH:MM` regardless of whether Postgres returns `HH:MM` or `HH:MM:SS`. This eliminates the double-seconds bug.

2. **Preserves wall-clock time** by never passing it through `new Date()` for conversion. Instead, `Intl.DateTimeFormat` with `timeZoneName: 'longOffset'` is used solely to look up whether a given calendar date falls in MST (`-0700`) or MDT (`-0600`), and that offset is appended to the already-correct local time.

## Prevention

1. **Normalize at the boundary.** Any function that accepts a time string from the database should immediately call `time.slice(0, 5)` before doing anything else. This makes the code immune to Postgres returning `HH:MM` vs `HH:MM:SS` vs `HH:MM:SS.sss`.

2. **Test with realistic database values.** The original code was likely tested with `"19:00"` (two-segment) inputs. Always include three-segment times:
   ```ts
   it('handles HH:MM:SS time format from Postgres', () => {
     expect(formatRssDate('2026-04-07', '19:00:00'))
       .toBe(formatRssDate('2026-04-07', '19:00'));
   });
   ```

3. **Test DST boundaries.** Offset bugs are invisible for half the year. Pin tests to known transition dates:
   ```ts
   expect(formatRssDate('2026-03-07', '19:00')).toMatch(/-0700$/); // MST
   expect(formatRssDate('2026-03-08', '19:00')).toMatch(/-0600$/); // MDT
   ```

4. **Share formatting logic.** The duplicate implementations in `generate-rss` and `generate-ical` drifted independently. Extracting to `lib/feedUtils.ts` with a single test suite ensures both feeds stay consistent.

5. **Validate output format in CI.** A smoke test that fetches the live RSS feed and asserts no `<pubDate>` contains `"Invalid Date"` would catch this class of bug immediately.

## Related Issues

- Commit 666e0a3 ("Fix RSS feed timezone") — introduced the bug while adding Mountain Time support
- No existing docs in `docs/solutions/` — this is the first documented solution
