
import { serve } from "https://deno.land/std@0.171.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { categorizeEventByRegion, isOnlineOnlyEvent } from "../../../lib/locationUtils.ts";
import { formatICalDate } from "../../../lib/feedUtils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper function to escape iCal text
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function validateHttpUrl(url: string | null | undefined): string {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : "";
}

// Render a single VEVENT block. Kept identical to the bulk branch's rendering so
// subscribers see the same output for an event regardless of which endpoint
// produced it.
function renderVEvent(event: any): string {
  const startDate = formatICalDate(event.event_date, event.start_time);
  const endDate = event.end_time
    ? formatICalDate(event.event_date, event.end_time)
    : formatICalDate(event.event_date, event.start_time ? `${parseInt(event.start_time.split(':')[0]) + 1}:${event.start_time.split(':')[1]}` : '23:59');

  const groupName = event.groups?.name || 'Unlisted Group';
  const description = event.description ? escapeICalText(event.description) : '';
  const location = event.location ? escapeICalText(event.location).replace(/https?:\/\/[^\s]+/g, '') : '';
  const prefixedTitle = escapeICalText(`${groupName}: ${event.title}`);

  return `BEGIN:VEVENT
UID:${event.id}@utahdevevents.com
DTSTART;TZID=us-mountain:${startDate}
DTEND;TZID=us-mountain:${endDate}
SUMMARY:${prefixedTitle}
DESCRIPTION:${description}\\n\\nGroup: ${groupName}${event.tags ? `\\n\\nTags: ${event.tags.join(', ')}` : ''}
LOCATION:${location}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT`;
}

function wrapVCalendar(vevents: string): string {
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Utah Dev Events//Utah Dev Events Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Utah Dev Events
X-WR-CALDESC:Utah Developer Community Events
X-WR-TIMEZONE:us-mountain
BEGIN:VTIMEZONE
TZID:us-mountain
BEGIN:DAYLIGHT
TZOFFSETFROM:-0700
TZOFFSETTO:-0600
TZNAME:MDT
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0600
TZOFFSETTO:-0700
TZNAME:MST
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
${vevents}
END:VCALENDAR`;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get("event");

    // Single-event branch: return a per-event .ics. Used by "Add to Apple
    // Calendar" / "Download .ics" menu items on each event card. Requires a
    // real HTTPS endpoint (not blob/data URI) so iOS Safari can hand the file
    // to Calendar.app.
    if (eventId !== null) {
      if (eventId.length > 36 || !UUID_RE.test(eventId)) {
        return new Response("Bad Request", { status: 400, headers: corsHeaders });
      }

      const supabase = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY") || ""
      );

      const { data: event, error } = await supabase
        .from("events")
        .select(`
          id,
          title,
          event_date,
          start_time,
          end_time,
          location,
          venue_name,
          city,
          address_line_1,
          address_line_2,
          description,
          tags,
          link,
          group_id,
          groups (
            name,
            status,
            tags
          )
        `)
        .eq("id", eventId)
        .eq("status", "approved")
        .maybeSingle();

      if (error || !event) {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      // Parity with bulk path: reject unapproved groups (only null group is acceptable)
      if (event.groups && event.groups.status !== "approved") {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      // Strip unsafe link URLs before they land in any calendar field
      const safeEvent = { ...event, link: validateHttpUrl(event.link) };

      const ics = wrapVCalendar(renderVEvent(safeEvent));

      return new Response(ics, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="${event.id}.ics"`,
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
        },
      });
    }

    const selectedGroups = url.searchParams.get('groups')?.split(',').filter(Boolean) || [];
    const selectedTags = url.searchParams.get('tags')?.split(',').filter(Boolean) || [];
    const selectedRegions = url.searchParams.get('regions')?.split(',').filter(Boolean) || [];
    const excludeOnline = url.searchParams.get('excludeOnline') === 'true';

    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY') || ""
    );

    // Calculate the date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoString = sevenDaysAgo.toISOString().split('T')[0];

    // Build query with date filter for events not older than 7 days
    let query = supabase
      .from("events")
      .select(`
        id,
        title,
        event_date,
        start_time,
        end_time,
        location,
        venue_name,
        city,
        address_line_1,
        address_line_2,
        description,
        tags,
        group_id,
        groups (
          name,
          status,
          tags
        )
      `)
      .eq("status", "approved")
      .gte("event_date", sevenDaysAgoString)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });

    const { data: events, error } = await query;

    if (error) {
      throw error;
    }

    // Filter events based on selected groups, tags, and regions using OR logic
    const filteredEvents = events?.filter((event: any) => {
      // Only show event if group is null (unlisted) or group.status is approved
      if (event.groups && event.groups.status !== "approved") {
        return false;
      }

      // Apply region filtering
      if (selectedRegions.length > 0) {
        const eventRegion = categorizeEventByRegion(event);
        if (!selectedRegions.includes(eventRegion)) {
          return false;
        }
      }

      // Apply online exclusion filter
      if (excludeOnline && isOnlineOnlyEvent(event)) {
        return false;
      }

      // If no group/tag filters are selected, show all events (after region/online filtering)
      if (selectedGroups.length === 0 && selectedTags.length === 0) {
        return true;
      }

      // Check if event matches any selected group
      const matchesGroup = selectedGroups.length === 0 ||
        (event.group_id && selectedGroups.includes(event.group_id));

      // Check if event matches any selected tag
      // Use event tags if available, otherwise fall back to group tags
      const eventTagsToCheck = event.tags && event.tags.length > 0
        ? event.tags
        : (event.groups?.tags || []);

      const matchesTag = selectedTags.length === 0 ||
        eventTagsToCheck.some((tag: string) => selectedTags.includes(tag));

      // Return true if event matches ANY of the selected groups OR ANY of the selected tags
      return matchesGroup || matchesTag;
    }) || [];

    // Generate iCal content
    const icalEvents = filteredEvents.map(renderVEvent).join('\n');
    const icalContent = wrapVCalendar(icalEvents);

    return new Response(icalContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=utah-dev-events.ics",
      },
    });
  } catch (err: any) {
    console.error("Error generating iCal:", err);
    return new Response(
      JSON.stringify({ message: "Failed to generate iCal", error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
