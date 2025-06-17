
-- First, remove all existing cron jobs to start fresh
DO $$
DECLARE
    job_record RECORD;
BEGIN
    -- Loop through all existing cron jobs and remove them
    FOR job_record IN 
        SELECT jobname FROM cron.job
    LOOP
        PERFORM cron.unschedule(job_record.jobname);
        RAISE NOTICE 'Removed cron job: %', job_record.jobname;
    END LOOP;
END $$;

-- Create a function to setup individual cron jobs for each group
CREATE OR REPLACE FUNCTION setup_individual_group_crons()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    group_record RECORD;
    job_name text;
    cron_schedule text;
    minute_offset integer := 0;
    jobs_created integer := 0;
BEGIN
    -- Loop through all groups with meetup_link
    FOR group_record IN 
        SELECT id, name FROM groups 
        WHERE meetup_link IS NOT NULL 
        ORDER BY name
    LOOP
        -- Create a unique job name for each group
        job_name := format('scrape-group-%s', replace(group_record.id::text, '-', ''));
        
        -- Stagger the jobs every 2 minutes starting from 12:00 PM UTC
        -- This spreads the load and avoids hitting rate limits
        cron_schedule := format('%s %s * * *', minute_offset, 12);
        
        -- Create the cron job for this specific group
        PERFORM cron.schedule(
            job_name,
            cron_schedule,
            format('SELECT net.http_post(
                url := ''https://gocvjqljtcxtcrwvfwez.supabase.co/functions/v1/scrape-single-meetup'',
                headers := jsonb_build_object(
                    ''Content-Type'', ''application/json'',
                    ''Authorization'', ''Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvY3ZqcWxqdGN4dGNyd3Zmd2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NTQzMzUsImV4cCI6MjA2MzAzMDMzNX0.R0NQtfvSeekfHR-QE8l5bPf7f_vL1_ol-SFVjdWRQxI''
                ),
                body := jsonb_build_object(
                    ''group_id'', ''%s'',
                    ''max_events'', 3
                )
            );', group_record.id)
        );
        
        RAISE NOTICE 'Created cron job % for group % (%) - Schedule: %', 
            job_name, group_record.name, group_record.id, cron_schedule;
        
        jobs_created := jobs_created + 1;
        minute_offset := minute_offset + 2; -- Stagger by 2 minutes
        
        -- Reset minute offset if it goes beyond 58 minutes
        IF minute_offset >= 60 THEN
            minute_offset := 0;
        END IF;
    END LOOP;
    
    RETURN format('Individual cron jobs setup completed. Created %s jobs.', jobs_created);
END;
$$;

-- Create a function to list all active cron jobs
CREATE OR REPLACE FUNCTION list_group_cron_jobs()
RETURNS TABLE(job_name text, schedule text, command text, active boolean)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        j.jobname::text,
        j.schedule::text,
        j.command::text,
        j.active
    FROM cron.job j
    WHERE j.jobname LIKE 'scrape-group-%'
    ORDER BY j.jobname;
END;
$$;

-- Run the setup function to create individual cron jobs
SELECT setup_individual_group_crons();

-- Show the created jobs
SELECT * FROM list_group_cron_jobs();
