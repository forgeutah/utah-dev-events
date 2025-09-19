-- Function to find duplicate groups based on meetup_link or luma_link
CREATE OR REPLACE FUNCTION public.find_duplicate_groups()
RETURNS TABLE(
    duplicate_type text,
    link_value text,
    group_ids uuid[],
    group_names text[],
    duplicate_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Find duplicates based on meetup_link
    RETURN QUERY
    SELECT 
        'meetup_link'::text as duplicate_type,
        g.meetup_link as link_value,
        array_agg(g.id) as group_ids,
        array_agg(g.name) as group_names,
        count(*)::integer as duplicate_count
    FROM groups g
    WHERE g.meetup_link IS NOT NULL 
    AND g.meetup_link != ''
    GROUP BY g.meetup_link
    HAVING count(*) > 1;

    -- Find duplicates based on luma_link
    RETURN QUERY
    SELECT 
        'luma_link'::text as duplicate_type,
        g.luma_link as link_value,
        array_agg(g.id) as group_ids,
        array_agg(g.name) as group_names,
        count(*)::integer as duplicate_count
    FROM groups g
    WHERE g.luma_link IS NOT NULL 
    AND g.luma_link != ''
    GROUP BY g.luma_link
    HAVING count(*) > 1;
END;
$$;

-- Function to remove duplicate groups (keeps the oldest one by created_at)
CREATE OR REPLACE FUNCTION public.remove_duplicate_groups()
RETURNS TABLE(
    removed_group_id uuid,
    removed_group_name text,
    kept_group_id uuid,
    kept_group_name text,
    duplicate_link text,
    link_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    dup_record RECORD;
    oldest_group RECORD;
    group_to_remove RECORD;
BEGIN
    -- Handle meetup_link duplicates
    FOR dup_record IN 
        SELECT meetup_link, array_agg(id ORDER BY created_at) as group_ids, array_agg(name ORDER BY created_at) as group_names
        FROM groups 
        WHERE meetup_link IS NOT NULL AND meetup_link != ''
        GROUP BY meetup_link 
        HAVING count(*) > 1
    LOOP
        -- Keep the first (oldest) group, remove the rest
        FOR i IN 2..array_length(dup_record.group_ids, 1) LOOP
            -- First, move events from duplicate group to the oldest group
            UPDATE events 
            SET group_id = dup_record.group_ids[1] 
            WHERE group_id = dup_record.group_ids[i];
            
            -- Return info about what we're removing
            RETURN QUERY
            SELECT 
                dup_record.group_ids[i] as removed_group_id,
                dup_record.group_names[i] as removed_group_name,
                dup_record.group_ids[1] as kept_group_id,
                dup_record.group_names[1] as kept_group_name,
                dup_record.meetup_link as duplicate_link,
                'meetup_link'::text as link_type;
            
            -- Delete the duplicate group
            DELETE FROM groups WHERE id = dup_record.group_ids[i];
        END LOOP;
    END LOOP;

    -- Handle luma_link duplicates
    FOR dup_record IN 
        SELECT luma_link, array_agg(id ORDER BY created_at) as group_ids, array_agg(name ORDER BY created_at) as group_names
        FROM groups 
        WHERE luma_link IS NOT NULL AND luma_link != ''
        GROUP BY luma_link 
        HAVING count(*) > 1
    LOOP
        -- Keep the first (oldest) group, remove the rest
        FOR i IN 2..array_length(dup_record.group_ids, 1) LOOP
            -- First, move events from duplicate group to the oldest group
            UPDATE events 
            SET group_id = dup_record.group_ids[1] 
            WHERE group_id = dup_record.group_ids[i];
            
            -- Return info about what we're removing
            RETURN QUERY
            SELECT 
                dup_record.group_ids[i] as removed_group_id,
                dup_record.group_names[i] as removed_group_name,
                dup_record.group_ids[1] as kept_group_id,
                dup_record.group_names[1] as kept_group_name,
                dup_record.luma_link as duplicate_link,
                'luma_link'::text as link_type;
            
            -- Delete the duplicate group
            DELETE FROM groups WHERE id = dup_record.group_ids[i];
        END LOOP;
    END LOOP;
END;
$$;