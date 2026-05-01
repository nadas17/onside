-- =============================================================================
-- 0008_realtime_participants.sql
--
-- Realtime tüketici tablolarını publication'a ekle ve UPDATE event'lerinde
-- OLD/NEW kolonların tamamını yayınlamak için REPLICA IDENTITY FULL.
-- =============================================================================

-- 1. event_participant'ı realtime publication'a ekle
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_participant;

-- 2. event tablosunu da ekle (status open↔full geçişi roster panel'inde önemli)
ALTER PUBLICATION supabase_realtime ADD TABLE public.event;

-- 3. UPDATE event'lerinde OLD row'unu da yayınla (status değişikliği gibi field-level change'ler için).
ALTER TABLE public.chat_message REPLICA IDENTITY FULL;
ALTER TABLE public.event_participant REPLICA IDENTITY FULL;
ALTER TABLE public.event REPLICA IDENTITY FULL;
