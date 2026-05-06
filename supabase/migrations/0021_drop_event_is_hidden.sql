-- =============================================================================
-- 0021_drop_event_is_hidden.sql
--
-- The `is_hidden` flag was useful when only the organizer could see their
-- own draft; with no auth there is no enforceable owner, so the column has
-- no meaning and just clutters the schema. Drop it.
-- =============================================================================

ALTER TABLE public.event DROP COLUMN IF EXISTS is_hidden;
