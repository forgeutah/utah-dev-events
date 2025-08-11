
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

    console.log('Starting event scraping process...')

    // Fetch all groups with event platform links from database
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, meetup_link, luma_link, eventbrite_link')
      .or('meetup_link.not.is.null,luma_link.not.is.null,eventbrite_link.not.is.null')
      .eq('status', 'approved') // Only scrape approved groups

    if (groupsError) {
      console.error('Error fetching groups:', groupsError)
      throw groupsError
    }

    console.log(`Found ${groups?.length || 0} groups with event links`)

    let totalEventsProcessed = 0
    let totalEventsCreated = 0
    let totalEventsUpdated = 0

    // Process each group
    for (const group of groups || []) {
      // Process Meetup, Luma, and Eventbrite links for each group
      const eventSources = []
      if (group.meetup_link) {
        eventSources.push({ type: 'Meetup', url: group.meetup_link })
      }
      if (group.luma_link) {
        eventSources.push({ type: 'Luma', url: group.luma_link })
      }
      if (group.eventbrite_link) {
        eventSources.push({ type: 'Eventbrite', url: group.eventbrite_link })
      }

      if (eventSources.length === 0) continue

      for (const source of eventSources) {
        console.log(`Processing group: ${group.name} (${source.type}: ${source.url})`)

        try {
          // Call the scraping service (no auth needed now)
          const scrapeResponse = await fetch('https://utah-dev-events-839851813394.us-west3.run.app/scrape-events', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url: source.url,
              max_events: 3
            })
          })

          if (!scrapeResponse.ok) {
            console.error(`Failed to scrape events for group ${group.name} from ${source.type}: ${scrapeResponse.status}`)
            continue
          }

          const scrapeData: ScrapeResponse = await scrapeResponse.json()
          console.log(`Scraped ${scrapeData.events?.length || 0} events for group ${group.name} from ${source.type}`)

            // Process each scraped event
            for (const scrapedEvent of scrapeData.events || []) {
              totalEventsProcessed++

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
                group_id: group.id,
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
                  totalEventsUpdated++
                  console.log(`Updated event: ${scrapedEvent.title}`)
                }
              } else {
                // Create new event
                const { error: insertError } = await supabase
                  .from('events')
                  .insert([eventData])

                if (insertError) {
                  console.error('Error creating event:', insertError)
                } else {
                  totalEventsCreated++
                  console.log(`Created event: ${scrapedEvent.title}`)
                }
              }
            }
        } catch (error) {
          console.error(`Error processing group ${group.name} from ${source.type}:`, error)
          continue
        }
      }
    }

    const summary = {
      totalGroups: groups?.length || 0,
      totalEventsProcessed,
      totalEventsCreated,
      totalEventsUpdated,
      message: 'Event scraping completed successfully'
    }

    console.log('Scraping summary:', summary)

    return new Response(
      JSON.stringify(summary),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in scrape-meetup-events function:', error)
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
