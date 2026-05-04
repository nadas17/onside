-- Migration 0018: Remove Warsaw venues, support manual / custom venues on events.
--
-- Context:
--   * Warsaw is being dropped from the project (Gdańsk-only). 0 events were
--     bound to Warsaw venues at migration time so a hard delete is safe; the
--     existing FK is ON DELETE RESTRICT, so any future Warsaw event would
--     have aborted this migration loudly anyway.
--   * Organisers can now enter a one-off venue (free-text name + optional
--     Maps URL) instead of picking from the curated list. Schema therefore
--     allows EITHER a `venue_id` reference OR a custom name; never neither.

-- 1. Drop curated Warsaw venues.
DELETE FROM public.venue WHERE city = 'Warsaw';

-- 2. Allow events to live without a curated venue and add custom-venue columns.
ALTER TABLE public.event
  ALTER COLUMN venue_id DROP NOT NULL,
  ADD COLUMN custom_venue_name text,
  ADD COLUMN custom_venue_url  text;

-- 3. Exactly one source of venue truth per row.
--    (venue_id OR custom_venue_name) AND NOT (venue_id AND custom_venue_name)
ALTER TABLE public.event
  ADD CONSTRAINT event_venue_xor CHECK (
    (venue_id IS NOT NULL)::int + (custom_venue_name IS NOT NULL)::int = 1
  );

-- 4. Bound length on custom fields so a malicious / runaway client can't
--    push multi-MB blobs through createEventAction.
ALTER TABLE public.event
  ADD CONSTRAINT event_custom_venue_name_len  CHECK (custom_venue_name IS NULL OR char_length(custom_venue_name) <= 200),
  ADD CONSTRAINT event_custom_venue_url_len   CHECK (custom_venue_url  IS NULL OR char_length(custom_venue_url)  <= 500);
