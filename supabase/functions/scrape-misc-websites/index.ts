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

// Misc website event sources (corporate, coworking, community)
const MISC_WEBSITE_SOURCES = [
  {
    name: "Kiln Coworking Space",
    url: "https://kiln.utah.gov/events/",
    group_name: "Kiln Coworking",
    tags: ['coworking', 'government', 'entrepreneurship']
  },
  {
    name: "WeWork Salt Lake City",
    url: "https://www.wework.com/l/salt-lake-city--UT/events",
    group_name: "WeWork SLC",
    tags: ['coworking', 'networking', 'business']
  },
  {
    name: "Silicon Slopes Events",
    url: "https://siliconslopestechsummit.com/events/",
    group_name: "Silicon Slopes",
    tags: ['conference', 'networking', 'summit']
  },
  {
    name: "Utah Geek Events",
    url: "https://utahgeekevents.com/events/",
    group_name: "Utah Geek Events",
    tags: ['community', 'technology', 'developer']
  }
]

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

async function getOrCreateGroup(supabase: any, groupName: string, tags: string[]) {
  // Check if group exists
  const { data: existingGroups, error: checkError } = await supabase
    .from('groups')
    .select('id')
    .eq('name', groupName)
    .limit(1)

  if (checkError) {
    console.error('Error checking existing group:', checkError)
    throw checkError
  }

  if (existingGroups && existingGroups.length > 0) {
    return existingGroups[0].id
  }

  // Create new group
  const { data: newGroup, error: insertError } = await supabase
    .from('groups')
    .insert([{
      name: groupName,
      status: 'approved', // Auto-approve misc website groups
      tags: tags
    }])
    .select('id')
    .single()

  if (insertError) {
    console.error('Error creating group:', insertError)
    throw insertError
  }

  console.log(`Created new group: ${groupName}`)
  return newGroup.id
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

    console.log('Starting misc websites event scraping process...')

    let totalEventsProcessed = 0
    let totalEventsCreated = 0
    let totalEventsUpdated = 0

    // Process each misc website source
    for (const source of MISC_WEBSITE_SOURCES) {
      console.log(`Processing misc website source: ${source.name}`)

      try {
        // Get or create group for this source
        const groupId = await getOrCreateGroup(supabase, source.group_name, source.tags)

        // Call the scraping service with graceful error handling
        let scrapeData: ScrapeResponse | null = null
        
        try {
          const scrapeResponse = await fetch('https://utah-dev-events-839851813394.us-west3.run.app/scrape-events', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url: source.url,
              max_events: 5
            })
          })

          if (!scrapeResponse.ok) {
            console.error(`Failed to scrape events for ${source.name}: ${scrapeResponse.status} - ${scrapeResponse.statusText}`)
            continue // Skip this source but continue with others
          }

          scrapeData = await scrapeResponse.json()
          console.log(`Scraped ${scrapeData?.events?.length || 0} events for ${source.name}`)
          
        } catch (fetchError) {
          console.error(`Network error scraping ${source.name}:`, fetchError)
          continue // Skip this source but continue with others
        }

        if (!scrapeData || !scrapeData.events || scrapeData.events.length === 0) {
          console.log(`No events found for ${source.name}, continuing with other sources`)
          continue
        }

        // Process each scraped event with individual error handling
        for (const scrapedEvent of scrapeData.events || []) {
          try {
            totalEventsProcessed++

            // Validate required fields
            if (!scrapedEvent.url || !scrapedEvent.title) {
              console.warn(`Skipping invalid event from ${source.name}: missing URL or title`)
              continue
            }

            // Convert UTC datetime to Mountain Time
            const { eventDate, startTime } = convertUtcToMountainTime(scrapedEvent.time)
            console.log(`Converted UTC time ${scrapedEvent.time} to Mountain Time: ${eventDate} ${startTime}`)

            // DEDUPLICATION: Check if event already exists (by URL - primary dedup method)
            const { data: existingEvents, error: checkError } = await supabase
              .from('events')
              .select('id')
              .eq('link', scrapedEvent.url)
              .limit(1)

            if (checkError) {
              console.error('Error checking existing event:', checkError)
              continue
            }

            // DEDUPLICATION: Also check for similar titles on same date as secondary dedup
            if (!existingEvents || existingEvents.length === 0) {
              const { data: similarEvents, error: similarError } = await supabase
                .from('events')
                .select('id, title')
                .eq('event_date', eventDate)
                .ilike('title', `%${scrapedEvent.title.substring(0, 20)}%`)
                .limit(3)

              if (similarError) {
                console.warn('Error checking for similar events:', similarError)
              } else if (similarEvents && similarEvents.length > 0) {
                console.log(`Found ${similarEvents.length} potentially similar events for "${scrapedEvent.title}" on ${eventDate}`)
                // Continue anyway - let the main dedup logic handle it
              }
            }

          const eventData = {
            group_id: groupId,
            title: scrapedEvent.title,
            description: scrapedEvent.description,
            event_date: eventDate,
            start_time: startTime,
            location: scrapedEvent.venue_address,
            venue_name: scrapedEvent.venue_name,
            link: scrapedEvent.url,
            image: scrapedEvent.image_url,
            status: 'approved', // Auto-approve misc website events
            tags: source.tags
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
          
          } catch (eventError) {
            console.error(`Error processing individual event from ${source.name}:`, eventError)
            // Continue with next event
            continue
          }
        }
      } catch (error) {
        console.error(`Error processing misc website source ${source.name}:`, error)
        continue
      }
    }

    const summary = {
      totalSources: MISC_WEBSITE_SOURCES.length,
      totalEventsProcessed,
      totalEventsCreated,
      totalEventsUpdated,
      message: 'Misc websites event scraping completed successfully'
    }

    console.log('Misc websites scraping summary:', summary)

    return new Response(
      JSON.stringify(summary),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in scrape-misc-websites function:', error)
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