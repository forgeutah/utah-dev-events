
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ScrapedEvent {
  url: string;
  title: string;
  description: string;
  time: string; // ISO datetime string
  venue_name: string;
  venue_url?: string;
  venue_address: string;
  image_url?: string;
}

interface ScrapeResponse {
  events: ScrapedEvent[];
}

interface RequestBody {
  meetup_url: string;
  max_events?: number;
  group_id?: string; // Optional: if provided, will link events to this group
}

// Function to convert UTC to Mountain Time
function convertUtcToMountainTime(utcDateTimeString: string): { eventDate: string; startTime: string } {
  const utcDate = new Date(utcDateTimeString);
  
  // Create a new date in Mountain Time
  // Mountain Time is UTC-7 (MDT) or UTC-8 (MST)
  // We'll use Intl.DateTimeFormat to handle DST automatically
  const mountainTimeString = utcDate.toLocaleString("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  // Parse the formatted string to extract date and time
  const [datePart, timePart] = mountainTimeString.split(", ");
  const [month, day, year] = datePart.split("/");
  const eventDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const startTime = timePart;

  return { eventDate, startTime };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse request body
    const { meetup_url, max_events = 3, group_id }: RequestBody = await req.json()

    if (!meetup_url) {
      return new Response(
        JSON.stringify({ error: 'meetup_url is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    console.log(`Starting event scraping for: ${meetup_url}`)

    let targetGroupId = group_id;

    // If no group_id provided, try to find existing group by meetup_link
    if (!targetGroupId) {
      const { data: existingGroups, error: groupError } = await supabase
        .from('groups')
        .select('id')
        .eq('meetup_link', meetup_url)
        .limit(1)

      if (groupError) {
        console.error('Error checking for existing group:', groupError)
      } else if (existingGroups && existingGroups.length > 0) {
        targetGroupId = existingGroups[0].id
        console.log(`Found existing group: ${targetGroupId}`)
      } else {
        console.log('No existing group found for this meetup URL')
      }
    }

    try {
      // Call the scraping service
      const scrapeResponse = await fetch('https://utah-dev-events-839851813394.us-west3.run.app/scrape-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: meetup_url,
          max_events
        })
      })

      if (!scrapeResponse.ok) {
        console.error(`Failed to scrape events: ${scrapeResponse.status}`)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to scrape events', 
            details: `Scraping service returned ${scrapeResponse.status}` 
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        )
      }

      const scrapeData: ScrapeResponse = await scrapeResponse.json()
      console.log(`Scraped ${scrapeData.events?.length || 0} events`)

      let eventsCreated = 0
      let eventsUpdated = 0
      const processedEvents = []

      // Process each scraped event
      for (const scrapedEvent of scrapeData.events || []) {
        // Convert UTC datetime to Mountain Time
        const { eventDate, startTime } = convertUtcToMountainTime(scrapedEvent.time)
        console.log(`Converted UTC time ${scrapedEvent.time} to Mountain Time: ${eventDate} ${startTime}`)

        // Check if event already exists (by URL)
        const { data: existingEvents, error: checkError } = await supabase
          .from('events')
          .select('id')
          .eq('link', scrapedEvent.url)
          .limit(1)

        if (checkError) {
          console.error('Error checking existing event:', checkError)
          continue
        }

        const eventData = {
          group_id: targetGroupId,
          title: scrapedEvent.title,
          description: scrapedEvent.description,
          event_date: eventDate,
          start_time: startTime,
          location: scrapedEvent.venue_address,
          venue_name: scrapedEvent.venue_name,
          link: scrapedEvent.url,
          image: scrapedEvent.image_url,
          status: 'approved' // Auto-approve scraped events
        }

        if (existingEvents && existingEvents.length > 0) {
          // Update existing event
          const { error: updateError } = await supabase
            .from('events')
            .update(eventData)
            .eq('id', existingEvents[0].id)

          if (updateError) {
            console.error('Error updating event:', updateError)
          } else {
            eventsUpdated++
            console.log(`Updated event: ${scrapedEvent.title}`)
            processedEvents.push({ ...eventData, id: existingEvents[0].id, action: 'updated' })
          }
        } else {
          // Create new event
          const { data: insertData, error: insertError } = await supabase
            .from('events')
            .insert([eventData])
            .select('id')

          if (insertError) {
            console.error('Error creating event:', insertError)
          } else {
            eventsCreated++
            console.log(`Created event: ${scrapedEvent.title}`)
            processedEvents.push({ ...eventData, id: insertData[0]?.id, action: 'created' })
          }
        }
      }

      const summary = {
        meetup_url,
        max_events,
        group_id: targetGroupId,
        eventsScraped: scrapeData.events?.length || 0,
        eventsCreated,
        eventsUpdated,
        processedEvents,
        message: 'Single meetup scraping completed successfully'
      }

      console.log('Scraping summary:', summary)

      return new Response(
        JSON.stringify(summary),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )

    } catch (scrapeError) {
      console.error(`Error scraping meetup ${meetup_url}:`, scrapeError)
      return new Response(
        JSON.stringify({ 
          error: 'Scraping failed', 
          details: scrapeError.message,
          meetup_url 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

  } catch (error) {
    console.error('Error in scrape-single-meetup function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
