
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
  group_id: string; // Required: group ID to lookup meetup URL
  max_events?: number;
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
    const { group_id, max_events = 3 }: RequestBody = await req.json()

    if (!group_id) {
      return new Response(
        JSON.stringify({ error: 'group_id is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    console.log(`Starting event scraping for group: ${group_id}`)

    // Lookup the group and get the meetup_url
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('meetup_link, name')
      .eq('id', group_id)
      .single()

    if (groupError) {
      console.error('Error fetching group:', groupError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch group', 
          details: groupError.message 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      )
    }

    if (!group?.meetup_link) {
      return new Response(
        JSON.stringify({ 
          error: 'No meetup_link found for this group',
          group_id,
          group_name: group?.name 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    const meetup_url = group.meetup_link
    console.log(`Found meetup URL for group "${group.name}": ${meetup_url}`)

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
          group_id: group_id,
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
        group_id,
        group_name: group.name,
        meetup_url,
        max_events,
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
      console.error(`Error scraping meetup for group ${group_id}:`, scrapeError)
      return new Response(
        JSON.stringify({ 
          error: 'Scraping failed', 
          details: scrapeError.message,
          group_id,
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
