-- Add cron jobs for new university and misc website scrapers
-- This will automatically schedule the new scraping functions

DO $$
DECLARE
    base_url text;
BEGIN
    -- Get the project URL (this will need to be set to the actual Supabase project URL)
    -- For now, we'll use a placeholder that maintainers need to update
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
    
    RAISE NOTICE 'Added cron jobs for university and misc website scrapers';
    RAISE NOTICE 'IMPORTANT: Update base_url in this migration to your actual Supabase project URL';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Note: Cron jobs will need to be set up manually with correct project URL';
        RAISE NOTICE 'University scraper: 30 13 * * * (1:30 PM daily)';
        RAISE NOTICE 'Misc websites scraper: 45 13 * * * (1:45 PM daily)';
END $$;