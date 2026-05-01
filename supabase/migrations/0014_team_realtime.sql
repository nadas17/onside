-- =============================================================================
-- 0014_team_realtime.sql
--
-- Phase 6: TeamPanel team_assignment INSERT/DELETE postgres_changes dinler.
-- Bunun için tabloyu supabase_realtime publication'ına ekle ve REPLICA
-- IDENTITY FULL ayarla (DELETE payload.old için).
-- =============================================================================

-- REPLICA IDENTITY FULL: DELETE payload.old gönderilebilsin
ALTER TABLE public.team REPLICA IDENTITY FULL;
ALTER TABLE public.team_assignment REPLICA IDENTITY FULL;

-- Publication'a ekle (varsa skip)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_assignment'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_assignment;
  END IF;
END $$;
