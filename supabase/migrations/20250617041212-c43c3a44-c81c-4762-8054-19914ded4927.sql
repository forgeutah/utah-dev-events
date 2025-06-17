
-- First, enable the pg_net extension if it's not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to call the scrape-single-meetup edge function
CREATE OR REPLACE FUNCTION test_scrape_single_meetup(target_group_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    result jsonb;
    request_id bigint;
BEGIN
    -- Make the HTTP POST request to the edge function
    SELECT net.http_post(
        url := 'https://gocvjqljtcxtcrwvfwez.supabase.co/functions/v1/scrape-single-meetup',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvY3ZqcWxqdGN4dGNyd3Zmd2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NTQzMzUsImV4cCI6MjA2MzAzMDMzNX0.R0NQtfvSeekfHR-QE8l5bPf7f_vL1_ol-SFVjdWRQxI'
        ),
        body := jsonb_build_object(
            'group_id', target_group_id::text,
            'max_events', 3
        )
    ) INTO request_id;
    
    -- Return the request ID for tracking
    RETURN jsonb_build_object('request_id', request_id);
END;
$$;

-- Example usage with a real group ID from your database
-- First, let's see what groups we have available
-- SELECT id, name, meetup_link FROM groups WHERE meetup_link IS NOT NULL LIMIT 5;

-- To call the function with a specific group ID, use:
-- SELECT test_scrape_single_meetup('your-group-id-here');

-- You can also make a direct call without the wrapper function:
-- SELECT net.http_post(
--     url := 'https://gocvjqljtcxtcrwvfwez.supabase.co/functions/v1/scrape-single-meetup',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvY3ZqcWxqdGN4dGNyd3Zmd2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NTQzMzUsImV4cCI6MjA2MzAzMDMzNX0.R0NQtfvSeekfHR-QE8l5bPf7f_vL1_ol-SFVjdWRQxI"}'::jsonb,
--     body := '{"group_id": "your-group-id-here", "max_events": 3}'::jsonb
-- );
