-- =============================================================================
-- 0020_event_anon_writes.sql
--
-- 0019 left `event` with only public-SELECT, but `createEventAction` and
-- `cancelEventAction` write to it directly (not through an RPC). With no
-- INSERT/UPDATE policy, every create / cancel attempt fails with an RLS
-- error. Anyone can already create or cancel via the app today (the no-auth
-- model accepts it), so the policies just match that reality.
--
-- Validation lives in the server actions (createEventSchema + IP rate limit),
-- not in the database — this only opens the row-level door.
-- =============================================================================

DROP POLICY IF EXISTS event_insert_public ON public.event;
CREATE POLICY event_insert_public
  ON public.event
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS event_update_public ON public.event;
CREATE POLICY event_update_public
  ON public.event
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
