-- =============================================================================
-- 0010_chat_publication_reset.sql
--
-- chat_message için INSERT/UPDATE event'leri Realtime broadcaster tarafından
-- yayınlanmıyor (sub başarılı, payload gelmiyor). Replication slot aktif ve WAL
-- stream ediliyor; sorun Realtime tarafının tablo cache'inde.
--
-- DROP + ADD ile tabloyu publication'dan temizleyip yeniden ekleyerek cache'i
-- zorla yeniliyoruz.
-- =============================================================================

ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_message;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message;
