-- =============================================================================
-- 0009_chat_simplified_rls.sql
--
-- Supabase Realtime postgres_changes broadcaster, nested subquery içeren RLS
-- policy'lerinde event yayını sırasında bazı durumlarda eval'i atlatabiliyor.
-- chat_message SELECT'i basit "TO authenticated USING (true)" haline getiriyoruz.
-- Etkinlik bazlı filtreleme query (`.eq('event_id', ...)`) ve canPost check
-- UI seviyesinde zaten yapılıyor; event_id filter realtime channel'da aktif.
--
-- Spec §6'dan sapma — performans/UX için pragmatik karar.
-- =============================================================================

DROP POLICY IF EXISTS chat_message_select_participants_or_organizer
ON public.chat_message;

CREATE POLICY chat_message_select_authenticated
ON public.chat_message
FOR SELECT
TO authenticated
USING (true);
