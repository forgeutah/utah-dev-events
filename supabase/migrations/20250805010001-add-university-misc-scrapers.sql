-- Add cron jobs for new university and misc website scrapers
-- IMPORTANT: Replace YOUR_PROJECT_ID with your actual Supabase project ID before running migration

DO $$
DECLARE
    base_url text;
BEGIN
    -- Replace YOUR_PROJECT_ID with actual project ID (found in Supabase Dashboard > Settings > General)
    base_url := 'https://YOUR_PROJECT_ID.supabase.co';
    
    -- Schedule university events scraper (daily at 1:30 PM)
    PERFORM cron.schedule(
        'university-events-scraper',
        '30 13 * * *',
        format('SELECT net.http_post(url:=''%s/functions/v1/scrape-university-events'', headers:=''{"Content-Type": "application/json", "Authorization": "Bearer %s"}''::jsonb, body:=''{}''::jsonb);', 
               base_url, 
               current_setting('app.settings.service_role_key', true))
    );
    
    -- Schedule misc websites scraper (daily at 1:45 PM)  
    PERFORM cron.schedule(
        'misc-websites-scraper',
        '45 13 * * *',
        format('SELECT net.http_post(url:=''%s/functions/v1/scrape-misc-websites'', headers:=''{"Content-Type": "application/json", "Authorization": "Bearer %s"}''::jsonb, body:=''{}''::jsonb);', 
               base_url,
               current_setting('app.settings.service_role_key', true))
    );
    
    RAISE NOTICE 'Successfully added cron jobs for university and misc website scrapers';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'ERROR: Make sure to replace YOUR_PROJECT_ID with actual Supabase project ID in this migration';
        RAISE EXCEPTION 'Cron job setup failed - check project ID';
END $$;