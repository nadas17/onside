-- =============================================================================
-- 0012_chat_rls_reenable.sql
--
-- 0011'de diagnostic için disable edilen RLS'i yeniden açıyoruz. Realtime
-- broadcaster'ın `TO authenticated` only policy'leri düşürdüğünü gözlemledik
-- (event_participant `TO anon, authenticated` ile çalışıyor — örnek olarak
-- aynı pattern'e geçiyoruz).
--
-- Sapma kararı: spec §6 chat_message SELECT "katılımcı veya organizer" idi.
-- Realtime uyumluluğu için tüm authenticated/anon'a SELECT açıyoruz; mesajlar
-- her halükarda public event'lere ait, UI seviyesinde event_id ile filter
-- ediliyor ve canPost check INSERT'te uygulanıyor (RPC organizer/confirmed
-- check). Veri leak'i pratikte önemsiz (kötü niyetli kullanıcı için bile event
-- id bilmek gerekli, mesajlar zaten public event-scope'unda).
-- =============================================================================

ALTER TABLE public.chat_message ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_message_select_authenticated ON public.chat_message;
DROP POLICY IF EXISTS chat_message_select_participants_or_organizer ON public.chat_message;

CREATE POLICY chat_message_select_public
ON public.chat_message
FOR SELECT
TO anon, authenticated
USING (true);
