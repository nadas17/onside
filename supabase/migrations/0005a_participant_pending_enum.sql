-- =============================================================================
-- 0005a_participant_pending_enum.sql — ADR-0003 (1/2)
--
-- PostgreSQL `ALTER TYPE ... ADD VALUE` aynı transaction'da yazma operasyonuyla
-- kullanılamaz; bu nedenle ayrı migration olarak ayrılmıştır.
-- =============================================================================

ALTER TYPE public.participant_status ADD VALUE IF NOT EXISTS 'pending' BEFORE 'confirmed';
