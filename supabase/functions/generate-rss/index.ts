
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

// Helper function to format date for RSS with proper Mountain Time handling
function formatRssDate(date: string, time?: string): string {
  // Parse the date and time in Mountain Time context
  const timeStr = time || '00:00';
  const dateTimeStr = `${date}T${timeStr}:00`;
  
  // Create a date object and format it for Mountain Time
  const dateObj = new Date(dateTimeStr);
  
  // Use toLocaleString to get the date in Mountain Time, then convert to RFC 2822 format
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Denver',
    weekday: 'short',
    day: '2-digit',
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  };
  
  const formatted = dateObj.toLocaleString('en-US', options);
  // Convert to RFC 2822 format: "Wed, 02 Oct 2002 13:00:00 GMT"
  return formatted.replace(/,/g, '').replace(/(\w{3}) (\d{2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) (.+)/, '$1, $2 $3 $4 $5:$6:$7 $8');
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
    const selectedRegions = url.searchParams.get('regions')?.split(',').filter(Boolean) || [];
    const excludeOnline = url.searchParams.get('excludeOnline') === 'true';

    console.log('RSS Feed requested with filters:', { selectedGroups, selectedTags, selectedRegions, excludeOnline });

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
      .eq("status", "approved")
      .gte("event_date", sevenDaysAgoString)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });

    const { data: events, error } = await query;

    if (error) {
      throw error;
    }

    console.log(`Fetched ${events?.length || 0} events from database`);

    // Helper functions for region filtering
    const categorizeEventByRegion = (event: any): string => {
      const SALT_LAKE_COUNTY = [
        'salt lake city', 'west valley city', 'west jordan', 'sandy', 'murray', 
        'taylorsville', 'south salt lake', 'millcreek', 'draper', 'riverton',
        'cottonwood heights', 'holladay', 'midvale', 'south jordan', 'herriman',
        'bluffdale', 'alta', 'magna', 'kearns', 'west valley'
      ];

      const UTAH_COUNTY = [
        'provo', 'orem', 'american fork', 'lehi', 'pleasant grove', 'springville',
        'spanish fork', 'payson', 'lindon', 'highland', 'alpine', 'cedar hills',
        'saratoga springs', 'eagle mountain', 'mapleton', 'vineyard', 'salem',
        'santaquin', 'elk ridge', 'genola', 'goshen'
      ];

      const NORTHERN_UTAH = [
        'ogden', 'layton', 'bountiful', 'roy', 'clearfield', 'kaysville', 'clinton',
        'north salt lake', 'centerville', 'farmington', 'woods cross', 'west point',
        'syracuse', 'logan', 'brigham city', 'tremonton', 'hyrum', 'smithfield',
        'richmond', 'providence', 'north logan', 'river heights', 'nibley'
      ];

      const SOUTHERN_UTAH = [
        'st george', 'saint george', 'cedar city', 'hurricane', 'washington', 'ivins',
        'santa clara', 'leeds', 'la verkin', 'toquerville', 'enterprise', 'veyo',
        'summit', 'dammeron valley', 'springdale', 'rockville', 'virgin', 'hildale',
        'orderville', 'glendale', 'alton', 'duck creek village', 'brian head',
        'parowan', 'paragonah', 'enoch', 'minersville', 'beaver', 'milford'
      ];

      const locationText = [
        event.location,
        event.venue_name,
        event.city,
        event.address_line_1,
        event.address_line_2
      ].filter(Boolean).join(' ').toLowerCase();

      if (!locationText) return 'Unknown';

      if (SALT_LAKE_COUNTY.some(city => locationText.includes(city))) return 'Salt Lake County';
      if (UTAH_COUNTY.some(city => locationText.includes(city))) return 'Utah County';
      if (NORTHERN_UTAH.some(city => locationText.includes(city))) return 'Northern Utah';
      if (SOUTHERN_UTAH.some(city => locationText.includes(city))) return 'Southern Utah';
      return 'Unknown';
    };

    const isOnlineEvent = (event: any): boolean => {
      const ONLINE_INDICATORS = [
        'online', 'virtual', 'remote', 'zoom', 'meet', 'teams', 'webinar',
        'livestream', 'stream', 'digital', 'internet', 'web-based', 'video call',
        'video conference', 'teleconference', 'hangout', 'discord'
      ];
      
      const textToCheck = [
        event.location,
        event.venue_name,
        event.description,
        event.title
      ].filter(Boolean).join(' ').toLowerCase();

      return ONLINE_INDICATORS.some(indicator => textToCheck.includes(indicator));
    };

    // Filter events based on the specified logic
    const filteredEvents = events?.filter((event: any) => {
      // Only show event if group is null (unlisted) or group.status is approved
      if (event.groups && event.groups.status !== "approved") {
        console.log('Event filtered out due to group status:', event.title);
        return false;
      }

      // Apply region filtering
      if (selectedRegions.length > 0) {
        const eventRegion = categorizeEventByRegion(event);
        if (!selectedRegions.includes(eventRegion)) {
          console.log('Event filtered out due to region:', event.title, 'Region:', eventRegion);
          return false;
        }
      }

      // Apply online exclusion filter
      if (excludeOnline && isOnlineEvent(event)) {
        console.log('Event filtered out due to online exclusion:', event.title);
        return false;
      }
      
      // If no group/tag filters are selected, show all events (after region/online filtering)
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
      const originalTitle = escapeXml(event.title);
      const prefixedTitle = escapeXml(`${groupName}: ${event.title}`);
      const eventUrl = event.link || `https://utahdevevents.com/#event-${event.id}`;

      return `    <item>
      <title>${prefixedTitle}</title>
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
