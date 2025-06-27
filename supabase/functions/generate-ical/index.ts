
import { serve } from "https://deno.land/std@0.171.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to format date for iCal
function formatICalDate(date: string, time?: string): string {
  const dateObj = new Date(date);
  if (time) {
    const [hours, minutes] = time.split(':');
    dateObj.setHours(parseInt(hours), parseInt(minutes));
  }
  return dateObj.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Helper function to escape iCal text
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const selectedGroups = url.searchParams.get('groups')?.split(',').filter(Boolean) || [];
    const selectedTags = url.searchParams.get('tags')?.split(',').filter(Boolean) || [];

    const supabase = createClient(
      "https://gocvjqljtcxtcrwvfwez.supabase.co",
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

    // Filter events based on selected groups and tags using OR logic
    const filteredEvents = events?.filter((event: any) => {
      // Only show event if group is null (unlisted) or group.status is approved
      if (event.groups && event.groups.status !== "approved") {
        return false;
      }
      
      // If no filters are selected, show all events
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
    const icalEvents = filteredEvents.map((event: any) => {
      const startDate = formatICalDate(event.event_date, event.start_time);
      const endDate = event.end_time 
        ? formatICalDate(event.event_date, event.end_time)
        : formatICalDate(event.event_date, event.start_time ? `${parseInt(event.start_time.split(':')[0]) + 1}:${event.start_time.split(':')[1]}` : '23:59');
      
      const groupName = event.groups?.name || 'Unlisted Group';
      const description = event.description ? escapeICalText(event.description) : '';
      const location = event.location ? escapeICalText(event.location) : '';
      const prefixedTitle = escapeICalText(`${groupName}: ${event.title}`);

      return `BEGIN:VEVENT
UID:${event.id}@utahdevevents.com
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${prefixedTitle}
DESCRIPTION:${description}\\n\\nGroup: ${groupName}${event.tags ? `\\n\\nTags: ${event.tags.join(', ')}` : ''}
LOCATION:${location}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT`;
    }).join('\n');

    const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Utah Dev Events//Utah Dev Events Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Utah Dev Events
X-WR-CALDESC:Utah Developer Community Events
X-WR-TIMEZONE:America/Denver
${icalEvents}
END:VCALENDAR`;

    return new Response(icalContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=utah-dev-events.ics",
      },
    });
  } catch (err) {
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
