-- =============================================================================
-- 0017_cron_auto_finalize_mvp.sql
--
-- Phase 9 polish backlog'undan production'a çıkarılan iş.
-- Spec §10 V3: MVP voting penceresi 7 gün; süre dolduğunda otomatik finalize.
--
-- Kullanılan altyapı:
--   - pg_cron (Supabase'da ücretsiz tier'da etkindir, eu-central-1 hub'da)
--   - Mevcut public.finalize_mvp(p_event_id, p_votee_id) RPC (organizer kontrolü
--     ile yazılmıştı; cron için organizer-bypass eden internal helper'a sarmalıyoruz)
--
-- Yarış durumu güvenliği:
--   - finalize_mvp_internal advisory lock kullanır (mevcut RPC ile aynı pattern)
--   - mvp_finalized_at IS NULL kontrolü idempotent: aynı job iki kez koşarsa
--     ikincisi no-op
--   - Tie durumunda otomatik finalize EDİLMEZ (V5: organizer manuel seçmeli);
--     bu satır cron tarafından atlanır, organizer'a notification ile haber verilir
-- =============================================================================

-- 1. pg_cron extension (Supabase'da default schema cron, public'te erişim kontrollü)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Internal helper: cron tarafından çağrılır, auth.uid() yok (cron context).
--    Organizer kontrolünü atlar, geri kalan logic finalize_mvp ile aynı.
CREATE OR REPLACE FUNCTION public.finalize_mvp_cron(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.match_result%ROWTYPE;
  v_top_count int;
  v_top_profile uuid;
  v_top_count_2 int;
  v_rating_before int;
  v_rating_after int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_match FROM public.match_result
  WHERE event_id = p_event_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'event_id', p_event_id);
  END IF;
  IF v_match.mvp_finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already_finalized', 'event_id', p_event_id);
  END IF;

  -- En yüksek vote sahibi
  SELECT votee_id, count(*)::int
  INTO v_top_profile, v_top_count
  FROM public.mvp_vote
  WHERE event_id = p_event_id
  GROUP BY votee_id
  ORDER BY count(*) DESC, votee_id
  LIMIT 1;

  IF v_top_profile IS NULL THEN
    -- 0 oy: MVP NULL ile finalize
    UPDATE public.match_result
    SET mvp_profile_id = NULL, mvp_finalized_at = now()
    WHERE event_id = p_event_id;
    RETURN jsonb_build_object('ok', true, 'code', 'no_votes', 'event_id', p_event_id);
  END IF;

  -- Tie: cron auto-finalize ETMEZ; organizer manuel seçmeli
  SELECT count(*)::int INTO v_top_count_2
  FROM (
    SELECT votee_id, count(*) AS c
    FROM public.mvp_vote
    WHERE event_id = p_event_id
    GROUP BY votee_id
    HAVING count(*) = v_top_count
  ) tie;
  IF v_top_count_2 > 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'tie_skipped', 'event_id', p_event_id);
  END IF;

  -- Bonus +10 + skill_snapshot + profile update
  SELECT skill_rating INTO v_rating_before FROM public.profile WHERE id = v_top_profile;
  v_rating_after := v_rating_before + 10;

  UPDATE public.profile
  SET skill_rating = v_rating_after,
      skill_level = public.derive_skill_level(v_rating_after),
      mvp_count = mvp_count + 1,
      updated_at = now()
  WHERE id = v_top_profile;

  INSERT INTO public.skill_snapshot (profile_id, event_id, rating_before, rating_after, delta, reason)
  VALUES (v_top_profile, p_event_id, v_rating_before, v_rating_after, 10, 'mvp_bonus');

  UPDATE public.match_result
  SET mvp_profile_id = v_top_profile, mvp_finalized_at = now()
  WHERE event_id = p_event_id;

  -- System chat (cron-flavored mesaj)
  INSERT INTO public.chat_message (event_id, sender_id, content, kind)
  VALUES (
    p_event_id, NULL,
    'MVP otomatik kesinleşti (7 günlük pencere doldu). +10 skill bonusu uygulandı.',
    'system'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'finalized',
    'event_id', p_event_id,
    'mvp_profile_id', v_top_profile
  );
END;
$$;

-- 3. Periyodik scan: 7 günü dolan + henüz finalize edilmemiş tüm event'leri işle.
CREATE OR REPLACE FUNCTION public.run_mvp_auto_finalize()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT event_id
    FROM public.match_result
    WHERE mvp_finalized_at IS NULL
      AND submitted_at < (now() - interval '7 days')
  LOOP
    PERFORM public.finalize_mvp_cron(r.event_id);
  END LOOP;
END;
$$;

-- 4. Saatte bir çalışan cron job
--    Eski aynı isimli job varsa unschedule, sonra yeniden ekle (idempotent migration)
DO $$
BEGIN
  PERFORM cron.unschedule('mvp_auto_finalize_hourly')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'mvp_auto_finalize_hourly'
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron yetkisi yoksa veya job yoksa sessizce devam
  NULL;
END $$;

SELECT cron.schedule(
  'mvp_auto_finalize_hourly',
  '0 * * * *',  -- her saat başı
  $$ SELECT public.run_mvp_auto_finalize() $$
);
