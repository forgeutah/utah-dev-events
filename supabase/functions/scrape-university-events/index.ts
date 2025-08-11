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

// University event sources
const UNIVERSITY_SOURCES = [
  {
    name: "BYU Computer Science Department",
    url: "https://cs.byu.edu/events/",
    group_name: "BYU CS Department"
  },
  {
    name: "University of Utah CS Department", 
    url: "https://www.cs.utah.edu/events/",
    group_name: "U of U CS Department"
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

async function getOrCreateGroup(supabase: any, groupName: string) {
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
      status: 'approved', // Auto-approve university groups
      tags: ['university', 'education', 'computer-science']
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

    console.log('Starting university event scraping process...')

    let totalEventsProcessed = 0
    let totalEventsCreated = 0
    let totalEventsUpdated = 0

    // Process each university source
    for (const source of UNIVERSITY_SOURCES) {
      console.log(`Processing university source: ${source.name}`)

      try {
        // Get or create group for this university source
        const groupId = await getOrCreateGroup(supabase, source.group_name)

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
            group_id: groupId,
            title: scrapedEvent.title,
            description: scrapedEvent.description,
            event_date: eventDate,
            start_time: startTime,
            location: scrapedEvent.venue_address,
            venue_name: scrapedEvent.venue_name,
            link: scrapedEvent.url,
            image: scrapedEvent.image_url,
            status: 'approved', // Auto-approve university events
            tags: ['university', 'education', 'computer-science']
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
        console.error(`Error processing university source ${source.name}:`, error)
        continue
      }
    }

    const summary = {
      totalSources: UNIVERSITY_SOURCES.length,
      totalEventsProcessed,
      totalEventsCreated,
      totalEventsUpdated,
      message: 'University event scraping completed successfully'
    }

    console.log('University scraping summary:', summary)

    return new Response(
      JSON.stringify(summary),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in scrape-university-events function:', error)
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