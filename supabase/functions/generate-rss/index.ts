
import { serve } from "https://deno.land/std@0.171.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to escape XML content
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper function to format date for RSS
function formatRssDate(date: string, time?: string): string {
  const dateObj = new Date(date);
  if (time) {
    const [hours, minutes] = time.split(':');
    dateObj.setHours(parseInt(hours), parseInt(minutes));
  }
  return dateObj.toUTCString();
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

    console.log('RSS Feed requested with filters:', { selectedGroups, selectedTags });

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
        link,
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

    console.log(`Fetched ${events?.length || 0} events from database`);

    // Filter events based on the specified logic
    const filteredEvents = events?.filter((event: any) => {
      // Only show event if group is null (unlisted) or group.status is approved
      if (event.groups && event.groups.status !== "approved") {
        console.log('Event filtered out due to group status:', event.title);
        return false;
      }
      
      // If no filters are selected, show all events
      if (selectedGroups.length === 0 && selectedTags.length === 0) {
        return true;
      }
      
      // Check if event matches any selected group
      const matchesGroup = event.group_id && selectedGroups.includes(event.group_id);
      
      // Check if event matches any selected tag
      // Use event tags if available, otherwise fall back to group tags
      const eventTagsToCheck = event.tags && event.tags.length > 0 
        ? event.tags 
        : (event.groups?.tags || []);
      
      const matchesTag = eventTagsToCheck.some((tag: string) => selectedTags.includes(tag));
      
      // Apply filtering logic based on what filters are selected
      let shouldInclude = false;
      
      if (selectedGroups.length > 0 && selectedTags.length > 0) {
        // Both filters selected: show events from selected groups OR events with selected tags
        shouldInclude = matchesGroup || matchesTag;
      } else if (selectedGroups.length > 0) {
        // Only group filters selected: show events from selected groups
        shouldInclude = matchesGroup;
      } else if (selectedTags.length > 0) {
        // Only tag filters selected: show events with selected tags
        shouldInclude = matchesTag;
      }
      
      console.log('Filter check for event:', event.title, {
        groupId: event.group_id,
        eventTags: event.tags,
        groupTags: event.groups?.tags,
        selectedGroups,
        selectedTags,
        matchesGroup,
        matchesTag,
        finalResult: shouldInclude
      });
      
      return shouldInclude;
    }) || [];

    console.log(`Filtered down to ${filteredEvents.length} events after applying filters`);

    // Generate RSS items
    const rssItems = filteredEvents.map((event: any) => {
      const eventDate = formatRssDate(event.event_date, event.start_time);
      const groupName = event.groups?.name || 'Unlisted Group';
      const description = event.description ? escapeXml(event.description) : '';
      const location = event.location ? escapeXml(event.location) : '';
      const title = escapeXml(event.title);
      const eventUrl = event.link || `https://utahdevevents.com/#event-${event.id}`;

      return `    <item>
      <title>${title}</title>
      <link>${escapeXml(eventUrl)}</link>
      <description>${description}${location ? `\n\nLocation: ${location}` : ''}${event.tags ? `\n\nTags: ${event.tags.join(', ')}` : ''}\n\nGroup: ${groupName}</description>
      <pubDate>${eventDate}</pubDate>
      <guid isPermaLink="false">${event.id}</guid>
      <category>Utah Developer Events</category>
    </item>`;
    }).join('\n');

    const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Utah Dev Events</title>
    <link>https://utahdevevents.com</link>
    <description>Utah Developer Community Events</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://gocvjqljtcxtcrwvfwez.supabase.co/functions/v1/generate-rss" rel="self" type="application/rss+xml"/>
${rssItems}
  </channel>
</rss>`;

    console.log('Generated RSS feed with', filteredEvents.length, 'events');

    return new Response(rssContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/rss+xml; charset=utf-8",
      },
    });
  } catch (err) {
    console.error("Error generating RSS:", err);
    return new Response(
      JSON.stringify({ message: "Failed to generate RSS", error: err.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
