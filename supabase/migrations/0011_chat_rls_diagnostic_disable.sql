-- =============================================================================
-- 0011_chat_rls_diagnostic_disable.sql — DIAGNOSTIC ONLY
--
-- chat_message üzerinde RLS'i tamamen disable ediyoruz (DEVRE DIŞI). Bu sadece
-- realtime broadcaster'ın RLS evaluator nedeniyle event'i düşürüp düşürmediğini
-- doğrulamak için. Eğer event'ler gelirse: RLS sebep, basit policy bile yetmiyor.
-- Test sonrası 0012 ile RLS'i geri açıyoruz.
--
-- !! Production'a gitmeden ÖNCE RLS yeniden açılmalı (0012). !!
-- =============================================================================

ALTER TABLE public.chat_message DISABLE ROW LEVEL SECURITY;
