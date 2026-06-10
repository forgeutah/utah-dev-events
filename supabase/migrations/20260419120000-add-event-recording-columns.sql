-- Add recording_url + recording_status to events for user-submitted video recordings.
-- Submissions flow through the submit-recording Edge Function (service-role),
-- which enforces URL allowlisting, duplicate-of-event-link checks, and
-- "already-approved" guards. Admin approves by flipping recording_status to
-- 'approved' via the Supabase dashboard.

ALTER TABLE public.events
  ADD COLUMN recording_url text,
  ADD COLUMN recording_status text;

-- Enum-like gate on status values. CHECK passes on NULL by default; the explicit
-- IS NULL branch is documentation.
ALTER TABLE public.events
  ADD CONSTRAINT events_recording_status_check
  CHECK (recording_status IS NULL OR recording_status IN ('pending', 'approved'));

-- Paired nullability: either both fields are set, or neither.
ALTER TABLE public.events
  ADD CONSTRAINT events_recording_consistency_check
  CHECK (
    (recording_status IS NULL AND recording_url IS NULL)
    OR (recording_status IS NOT NULL AND recording_url IS NOT NULL)
  );

-- Server-side URL shape guard. Client + Edge Function validation is advisory;
-- this is binding.
ALTER TABLE public.events
  ADD CONSTRAINT events_recording_url_format_check
  CHECK (
    recording_url IS NULL
    OR (length(recording_url) BETWEEN 1 AND 2000 AND recording_url ~* '^https?://')
  );

-- Hot-path index: default /past view filters on approved recordings + date sort.
CREATE INDEX events_approved_recordings_idx
  ON public.events (event_date DESC)
  WHERE recording_status = 'approved' AND recording_url IS NOT NULL;

-- Secondary index: admin queue ("show me pending submissions").
CREATE INDEX events_pending_recordings_idx
  ON public.events (event_date DESC)
  WHERE recording_status = 'pending';

-- All recording writes go through the submit-recording Edge Function using the
-- service-role key. The frontend (anon key) has no legitimate reason to UPDATE
-- this table. Revoke to close the anon-can-mutate-any-column surface area.
REVOKE UPDATE ON public.events FROM anon;

-- ROLLBACK (manual, forward-only convention):
-- GRANT UPDATE ON public.events TO anon;  -- only if it was granted before
-- DROP INDEX IF EXISTS public.events_pending_recordings_idx;
-- DROP INDEX IF EXISTS public.events_approved_recordings_idx;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_recording_url_format_check;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_recording_consistency_check;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_recording_status_check;
-- ALTER TABLE public.events DROP COLUMN IF EXISTS recording_status;
-- ALTER TABLE public.events DROP COLUMN IF EXISTS recording_url;
