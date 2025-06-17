
-- First, enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to scrape all meetup groups
CREATE OR REPLACE FUNCTION scrape_all_meetup_groups()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    group_record RECORD;
    request_result jsonb;
    group_count integer := 0;
BEGIN
    -- Loop through all groups with meetup_link
    FOR group_record IN 
        SELECT id, name FROM groups 
        WHERE meetup_link IS NOT NULL 
        ORDER BY name
    LOOP
        -- Log the scraping attempt
        RAISE NOTICE 'Starting scrape for group: % (ID: %)', group_record.name, group_record.id;
        
        -- Call the scraping function
        SELECT net.http_post(
            url := 'https://gocvjqljtcxtcrwvfwez.supabase.co/functions/v1/scrape-single-meetup',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvY3ZqcWxqdGN4dGNyd3Zmd2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NTQzMzUsImV4cCI6MjA2MzAzMDMzNX0.R0NQtfvSeekfHR-QE8l5bPf7f_vL1_ol-SFVjdWRQxI'
            ),
            body := jsonb_build_object(
                'group_id', group_record.id::text,
                'max_events', 3
            )
        ) INTO request_result;
        
        -- Log the request ID
        RAISE NOTICE 'Scrape request sent for group %, request ID: %', group_record.name, request_result;
        
        group_count := group_count + 1;
        
        -- Wait 30 seconds before processing the next group (except for the last one)
        IF group_count < (SELECT count(*) FROM groups WHERE meetup_link IS NOT NULL) THEN
            PERFORM pg_sleep(30);
        END IF;
    END LOOP;
    
    RETURN format('Daily meetup scraping completed. Processed %s groups.', group_count);
END;
$$;

-- Try to remove any existing cron job with the same name (ignore errors if it doesn't exist)
DO $$
BEGIN
    PERFORM cron.unschedule('daily-meetup-scraper');
EXCEPTION
    WHEN OTHERS THEN
        -- Job doesn't exist, that's fine
        NULL;
END $$;

-- Schedule the function to run daily at 12:00 PM UTC (6:00 AM Mountain Time)
SELECT cron.schedule(
    'daily-meetup-scraper',
    '0 12 * * *',
    'SELECT scrape_all_meetup_groups();'
);

-- You can also test the function manually by running:
-- SELECT scrape_all_meetup_groups();
