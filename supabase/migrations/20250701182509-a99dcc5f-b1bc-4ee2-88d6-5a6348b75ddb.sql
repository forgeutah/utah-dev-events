-- Allow group_id to be nullable for events that don't belong to any group
ALTER TABLE public.events ALTER COLUMN group_id DROP NOT NULL;