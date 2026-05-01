-- =============================================================================
-- 0015_match_result.sql
--
-- Phase 7 — Match Result + MVP + Elo (spec §5, §10, §11).
--
-- Tablolar:
--   match_result        — bir event tek satır (skor + MVP + submit metadata)
--   player_match_stat   — oyuncu bazında attendance, gol, asist, elo_delta
--   mvp_vote            — voter→votee, no-self, single-vote (upsertable)
--   skill_snapshot      — append-only Elo/MVP delta tarihçesi
--
-- RPC'ler (SECURITY DEFINER, organizer-only çoğunluk):
--   submit_score(event_id, score_a, score_b, notes?)
--     → match_result insert, player_match_stat seed, Elo apply (her oyuncuya
--       skill_rating + skill_level update + skill_snapshot), status='completed',
--       chat system message
--   edit_score(event_id, score_a, score_b, notes?)
--     → 24 saat içinde organizer; eski Elo geri al, yeni Elo apply (yeni
--       snapshot satırları). Beforeland → afterland match_result.edited_at set.
--   submit_mvp_vote(event_id, votee_id)
--     → voter attended olmalı, event 'completed', 7 gün içinde, no-self.
--       upsert (değiştirebilir). 0 → 1 vote'da insert, ikinci kez UPDATE.
--   finalize_mvp(event_id)
--     → organizer-only; en yüksek vote sahibi → mvp_profile_id, +10 bonus,
--       skill_snapshot('mvp_bonus'), profile.mvp_count++. Tie-break: organizer
--       p_votee_id ile manuel seçebilir. 0 vote → success ama mvp_profile_id NULL.
--
-- RLS:
--   match_result, player_match_stat, mvp_vote, skill_snapshot SELECT public
--   (event public ise zaten görünür). INSERT/UPDATE/DELETE yok → RPC ile.
-- =============================================================================

-- 1. Tablolar
CREATE TABLE IF NOT EXISTS public.match_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.event(id) ON DELETE CASCADE,
  score_a integer NOT NULL,
  score_b integer NOT NULL,
  notes text,
  submitted_by uuid NOT NULL REFERENCES public.profile(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  mvp_profile_id uuid REFERENCES public.profile(id) ON DELETE SET NULL,
  mvp_finalized_at timestamptz,
  CONSTRAINT match_result_score_a_range CHECK (score_a BETWEEN 0 AND 30),
  CONSTRAINT match_result_score_b_range CHECK (score_b BETWEEN 0 AND 30)
);
CREATE UNIQUE INDEX IF NOT EXISTS match_result_event_unique
  ON public.match_result(event_id);

CREATE TABLE IF NOT EXISTS public.player_match_stat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.event(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profile(id) ON DELETE CASCADE,
  team_label text NOT NULL,
  attended boolean NOT NULL DEFAULT true,
  goals integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  elo_delta integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_match_stat_team_valid CHECK (team_label IN ('A', 'B')),
  CONSTRAINT player_match_stat_goals_range CHECK (goals BETWEEN 0 AND 30),
  CONSTRAINT player_match_stat_assists_range CHECK (assists BETWEEN 0 AND 30)
);
CREATE UNIQUE INDEX IF NOT EXISTS player_match_stat_event_profile_unique
  ON public.player_match_stat(event_id, profile_id);
CREATE INDEX IF NOT EXISTS player_match_stat_event_idx
  ON public.player_match_stat(event_id);
CREATE INDEX IF NOT EXISTS player_match_stat_profile_idx
  ON public.player_match_stat(profile_id);

CREATE TABLE IF NOT EXISTS public.mvp_vote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.event(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profile(id) ON DELETE CASCADE,
  votee_id uuid NOT NULL REFERENCES public.profile(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mvp_vote_no_self CHECK (voter_id <> votee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mvp_vote_event_voter_unique
  ON public.mvp_vote(event_id, voter_id);
CREATE INDEX IF NOT EXISTS mvp_vote_event_idx ON public.mvp_vote(event_id);

CREATE TABLE IF NOT EXISTS public.skill_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profile(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.event(id) ON DELETE SET NULL,
  rating_before integer NOT NULL,
  rating_after integer NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skill_snapshot_reason_valid
    CHECK (reason IN ('match', 'mvp_bonus', 'admin'))
);
CREATE INDEX IF NOT EXISTS skill_snapshot_profile_time_idx
  ON public.skill_snapshot(profile_id, created_at);
CREATE INDEX IF NOT EXISTS skill_snapshot_event_idx
  ON public.skill_snapshot(event_id);

-- 2. RLS — public read, no direct write
ALTER TABLE public.match_result      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_match_stat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mvp_vote          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_snapshot    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_result_select_public ON public.match_result;
CREATE POLICY match_result_select_public ON public.match_result
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS player_match_stat_select_public ON public.player_match_stat;
CREATE POLICY player_match_stat_select_public ON public.player_match_stat
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS mvp_vote_select_public ON public.mvp_vote;
CREATE POLICY mvp_vote_select_public ON public.mvp_vote
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS skill_snapshot_select_public ON public.skill_snapshot;
CREATE POLICY skill_snapshot_select_public ON public.skill_snapshot
  FOR SELECT TO anon, authenticated USING (true);

-- 3. Helper: derive_skill_level
CREATE OR REPLACE FUNCTION public.derive_skill_level(p_rating integer)
RETURNS public.skill_level
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_rating < 800   THEN 'beginner'::public.skill_level
    WHEN p_rating < 1100  THEN 'intermediate'::public.skill_level
    WHEN p_rating < 1300  THEN 'advanced'::public.skill_level
    ELSE                       'pro'::public.skill_level
  END;
$$;

-- 4. Helper: apply_match_elo_internal — submit + edit içinde tekrar kullanılır
--    p_event_id için player_match_stat ve team_assignment'a bakar, Elo deltalarını
--    hesaplar, profile.skill_rating + skill_level update + skill_snapshot insert.
--    `attended=true` olanlar dahil; mevcut player_match_stat.elo_delta varsa
--    önce profile'dan geri çıkarılır (re-apply için).
CREATE OR REPLACE FUNCTION public.apply_match_elo_internal(
  p_event_id uuid,
  p_score_a integer,
  p_score_b integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_avg_a numeric;
  v_team_avg_b numeric;
  v_count_a integer;
  v_count_b integer;
  v_exp_a numeric;
  v_actual_a numeric;
  v_actual_b numeric;
  v_delta_a integer;
  v_delta_b integer;
  r RECORD;
BEGIN
  -- Reverse: var olan elo_delta'ları profile rating'inden çıkar (re-apply için)
  UPDATE public.profile p
  SET skill_rating = p.skill_rating - pms.elo_delta
  FROM public.player_match_stat pms
  WHERE pms.profile_id = p.id
    AND pms.event_id = p_event_id
    AND pms.elo_delta <> 0;

  -- Takım ortalamalarını mevcut (revert sonrası) rating'lerden hesapla
  SELECT avg(p.skill_rating)::numeric, count(*)
  INTO v_team_avg_a, v_count_a
  FROM public.player_match_stat pms
  JOIN public.profile p ON p.id = pms.profile_id
  WHERE pms.event_id = p_event_id
    AND pms.team_label = 'A'
    AND pms.attended = true;

  SELECT avg(p.skill_rating)::numeric, count(*)
  INTO v_team_avg_b, v_count_b
  FROM public.player_match_stat pms
  JOIN public.profile p ON p.id = pms.profile_id
  WHERE pms.event_id = p_event_id
    AND pms.team_label = 'B'
    AND pms.attended = true;

  IF v_count_a = 0 OR v_count_b = 0 THEN
    -- Hiç attended yok; elo_delta=0 set et
    UPDATE public.player_match_stat
    SET elo_delta = 0
    WHERE event_id = p_event_id;
    RETURN;
  END IF;

  -- Expected formula: 1 / (1 + 10^((opp - own)/400))
  v_exp_a := 1.0 / (1.0 + power(10::numeric, (v_team_avg_b - v_team_avg_a) / 400.0));

  IF p_score_a > p_score_b THEN
    v_actual_a := 1.0; v_actual_b := 0.0;
  ELSIF p_score_b > p_score_a THEN
    v_actual_a := 0.0; v_actual_b := 1.0;
  ELSE
    v_actual_a := 0.5; v_actual_b := 0.5;
  END IF;

  v_delta_a := round(32 * (v_actual_a - v_exp_a))::integer;
  v_delta_b := round(32 * (v_actual_b - (1 - v_exp_a)))::integer;

  -- Apply delta + skill_snapshot for each attended player
  FOR r IN
    SELECT pms.profile_id, pms.team_label, p.skill_rating AS rating_before
    FROM public.player_match_stat pms
    JOIN public.profile p ON p.id = pms.profile_id
    WHERE pms.event_id = p_event_id
      AND pms.attended = true
  LOOP
    DECLARE
      v_delta integer := CASE WHEN r.team_label = 'A' THEN v_delta_a ELSE v_delta_b END;
      v_new_rating integer := r.rating_before + v_delta;
    BEGIN
      UPDATE public.profile
      SET skill_rating = v_new_rating,
          skill_level = public.derive_skill_level(v_new_rating),
          updated_at = now()
      WHERE id = r.profile_id;

      UPDATE public.player_match_stat
      SET elo_delta = v_delta
      WHERE event_id = p_event_id AND profile_id = r.profile_id;

      INSERT INTO public.skill_snapshot
        (profile_id, event_id, rating_before, rating_after, delta, reason)
      VALUES
        (r.profile_id, p_event_id, r.rating_before, v_new_rating, v_delta, 'match');
    END;
  END LOOP;

  -- Attended=false olanların elo_delta'sı 0
  UPDATE public.player_match_stat
  SET elo_delta = 0
  WHERE event_id = p_event_id AND attended = false;
END;
$$;

-- 5. submit_score
CREATE OR REPLACE FUNCTION public.submit_score(
  p_event_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_existing public.match_result%ROWTYPE;
  v_assigned_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  IF p_score_a < 0 OR p_score_a > 30 OR p_score_b < 0 OR p_score_b > 30 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Skor 0-30 arası olmalı.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;

  IF v_event.organizer_id <> v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sadece organizatör skoru girebilir.');
  END IF;

  IF v_event.status NOT IN ('locked', 'in_progress') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'invalid_status',
      'error', 'Sadece kilitli veya başlamış etkinlikte skor girilebilir (mevcut: ' || v_event.status || ').'
    );
  END IF;

  -- Edit ile karışmasın — varsa edit_score kullanılmalı
  SELECT * INTO v_existing FROM public.match_result WHERE event_id = p_event_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'already_submitted',
      'error', 'Skor zaten girildi; düzenlemek için "Skoru düzenle" kullan.'
    );
  END IF;

  -- Takım atamalarını kontrol et — locked olduysa team_assignment olmalı
  SELECT count(*) INTO v_assigned_count
  FROM public.team_assignment WHERE event_id = p_event_id;
  IF v_assigned_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'no_teams',
      'error', 'Takım ataması yok; önce takımları oluştur.'
    );
  END IF;

  -- match_result insert
  INSERT INTO public.match_result (event_id, score_a, score_b, notes, submitted_by)
  VALUES (p_event_id, p_score_a, p_score_b, p_notes, v_user_id);

  -- player_match_stat seed: tüm team_assignment'lar için attended=true, goals=0
  INSERT INTO public.player_match_stat (event_id, profile_id, team_label, attended, goals, assists, elo_delta)
  SELECT
    ta.event_id,
    ta.profile_id,
    t.label,
    true,
    0,
    0,
    0
  FROM public.team_assignment ta
  JOIN public.team t ON t.id = ta.team_id
  WHERE ta.event_id = p_event_id
  ON CONFLICT (event_id, profile_id) DO NOTHING;

  -- profile.matches_played + matches_won + goals_scored update
  UPDATE public.profile p
  SET matches_played = p.matches_played + 1,
      updated_at = now()
  FROM public.player_match_stat pms
  WHERE pms.event_id = p_event_id
    AND pms.profile_id = p.id
    AND pms.attended = true;

  IF p_score_a <> p_score_b THEN
    UPDATE public.profile p
    SET matches_won = p.matches_won + 1,
        updated_at = now()
    FROM public.player_match_stat pms
    WHERE pms.event_id = p_event_id
      AND pms.profile_id = p.id
      AND pms.attended = true
      AND pms.team_label = (CASE WHEN p_score_a > p_score_b THEN 'A' ELSE 'B' END);
  END IF;

  -- Elo apply (helper)
  PERFORM public.apply_match_elo_internal(p_event_id, p_score_a, p_score_b);

  -- Status → completed
  UPDATE public.event SET status = 'completed', updated_at = now() WHERE id = p_event_id;

  -- System chat message
  INSERT INTO public.chat_message (event_id, sender_id, content, kind)
  VALUES (
    p_event_id,
    NULL,
    'Maç sonu skoru girildi: A ' || p_score_a || ' – ' || p_score_b || ' B. MVP oylaması açıldı (7 gün).',
    'system'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'event_id', p_event_id,
      'score_a', p_score_a,
      'score_b', p_score_b
    )
  );
END;
$$;

-- 6. edit_score — 24 saat içinde organizer
CREATE OR REPLACE FUNCTION public.edit_score(
  p_event_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_existing public.match_result%ROWTYPE;
  v_old_a integer;
  v_old_b integer;
  v_was_draw boolean;
  v_new_draw boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  IF p_score_a < 0 OR p_score_a > 30 OR p_score_b < 0 OR p_score_b > 30 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Skor 0-30 arası olmalı.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;

  IF v_event.organizer_id <> v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sadece organizatör.');
  END IF;

  SELECT * INTO v_existing FROM public.match_result WHERE event_id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Skor henüz girilmemiş.');
  END IF;

  IF v_existing.submitted_at < (now() - interval '24 hours') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'edit_window_expired',
      'error', 'Skor düzenleme penceresi (24 saat) doldu.'
    );
  END IF;

  v_old_a := v_existing.score_a;
  v_old_b := v_existing.score_b;
  v_was_draw := (v_old_a = v_old_b);
  v_new_draw := (p_score_a = p_score_b);

  -- profile.matches_won düzelt: eski kazanan takımdan -1, yeni kazanan takıma +1
  IF NOT v_was_draw THEN
    UPDATE public.profile p
    SET matches_won = greatest(p.matches_won - 1, 0),
        updated_at = now()
    FROM public.player_match_stat pms
    WHERE pms.event_id = p_event_id
      AND pms.profile_id = p.id
      AND pms.attended = true
      AND pms.team_label = (CASE WHEN v_old_a > v_old_b THEN 'A' ELSE 'B' END);
  END IF;
  IF NOT v_new_draw THEN
    UPDATE public.profile p
    SET matches_won = p.matches_won + 1,
        updated_at = now()
    FROM public.player_match_stat pms
    WHERE pms.event_id = p_event_id
      AND pms.profile_id = p.id
      AND pms.attended = true
      AND pms.team_label = (CASE WHEN p_score_a > p_score_b THEN 'A' ELSE 'B' END);
  END IF;

  UPDATE public.match_result
  SET score_a = p_score_a,
      score_b = p_score_b,
      notes = p_notes,
      edited_at = now()
  WHERE event_id = p_event_id;

  -- Re-apply Elo (helper revert ile yeniden uygular + yeni skill_snapshot satırları)
  PERFORM public.apply_match_elo_internal(p_event_id, p_score_a, p_score_b);

  -- System chat message
  INSERT INTO public.chat_message (event_id, sender_id, content, kind)
  VALUES (
    p_event_id,
    NULL,
    'Skor düzenlendi: A ' || p_score_a || ' – ' || p_score_b || ' B.',
    'system'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('event_id', p_event_id)
  );
END;
$$;

-- 7. submit_mvp_vote — attended only, 7 gün, no-self, upsert
CREATE OR REPLACE FUNCTION public.submit_mvp_vote(
  p_event_id uuid,
  p_votee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_match public.match_result%ROWTYPE;
  v_voter_attended boolean;
  v_votee_attended boolean;
  v_existing_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;
  IF v_user_id = p_votee_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_self_vote', 'error', 'Kendine oy veremezsin.');
  END IF;

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;
  IF v_event.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_status', 'error', 'Maç henüz tamamlanmadı.');
  END IF;

  SELECT * INTO v_match FROM public.match_result WHERE event_id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Maç sonucu yok.');
  END IF;

  IF v_match.mvp_finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'mvp_finalized', 'error', 'MVP zaten kesinleşti.');
  END IF;

  IF v_match.submitted_at < (now() - interval '7 days') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'voting_closed', 'error', 'MVP oylama penceresi (7 gün) kapandı.');
  END IF;

  SELECT pms.attended INTO v_voter_attended
  FROM public.player_match_stat pms
  WHERE pms.event_id = p_event_id AND pms.profile_id = v_user_id;
  IF v_voter_attended IS NULL OR v_voter_attended = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sadece maça katılan oyuncular oy verebilir.');
  END IF;

  SELECT pms.attended INTO v_votee_attended
  FROM public.player_match_stat pms
  WHERE pms.event_id = p_event_id AND pms.profile_id = p_votee_id;
  IF v_votee_attended IS NULL OR v_votee_attended = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_votee', 'error', 'Bu oyuncu maça katılmadı.');
  END IF;

  -- Upsert
  SELECT id INTO v_existing_id FROM public.mvp_vote WHERE event_id = p_event_id AND voter_id = v_user_id;
  IF v_existing_id IS NOT NULL THEN
    UPDATE public.mvp_vote SET votee_id = p_votee_id WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.mvp_vote (event_id, voter_id, votee_id)
    VALUES (p_event_id, v_user_id, p_votee_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('event_id', p_event_id));
END;
$$;

-- 8. finalize_mvp — organizer-only; en yüksek vote → MVP, +10 bonus, profile.mvp_count++
--    p_votee_id verilirse organizer manuel seçer (tie-break, V5).
CREATE OR REPLACE FUNCTION public.finalize_mvp(
  p_event_id uuid,
  p_votee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_match public.match_result%ROWTYPE;
  v_top_count integer;
  v_top_profile uuid;
  v_top_count_2 integer;
  v_rating_before integer;
  v_rating_after integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;
  IF v_event.organizer_id <> v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sadece organizatör.');
  END IF;

  SELECT * INTO v_match FROM public.match_result WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Maç sonucu yok.');
  END IF;
  IF v_match.mvp_finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_finalized', 'error', 'MVP zaten kesinleşti.');
  END IF;

  IF p_votee_id IS NOT NULL THEN
    -- Manuel seçim — votee attended olmalı, ve ya en yüksek vote sahibi ya da tie'da olmalı
    PERFORM 1 FROM public.player_match_stat
    WHERE event_id = p_event_id AND profile_id = p_votee_id AND attended = true;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_votee', 'error', 'Seçili oyuncu maça katılmadı.');
    END IF;
    v_top_profile := p_votee_id;
  ELSE
    -- En yüksek vote sahibi
    SELECT votee_id, count(*)::int
    INTO v_top_profile, v_top_count
    FROM public.mvp_vote
    WHERE event_id = p_event_id
    GROUP BY votee_id
    ORDER BY count(*) DESC, votee_id
    LIMIT 1;

    IF v_top_profile IS NULL THEN
      -- 0 oy: MVP NULL ile finalize et
      UPDATE public.match_result
      SET mvp_profile_id = NULL,
          mvp_finalized_at = now()
      WHERE event_id = p_event_id;
      RETURN jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object('event_id', p_event_id, 'mvp_profile_id', NULL, 'no_votes', true)
      );
    END IF;

    -- Tie kontrolü: ikinci en yüksek aynı sayıdaysa hata (organizer manuel seçmeli)
    SELECT count(*)::int INTO v_top_count_2
    FROM (
      SELECT votee_id, count(*) AS c
      FROM public.mvp_vote
      WHERE event_id = p_event_id
      GROUP BY votee_id
      HAVING count(*) = v_top_count
    ) tie;
    IF v_top_count_2 > 1 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'tie',
        'error', 'Beraberlik: organizatör manuel seçim yapmalı.'
      );
    END IF;
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
  SET mvp_profile_id = v_top_profile,
      mvp_finalized_at = now()
  WHERE event_id = p_event_id;

  -- System chat
  INSERT INTO public.chat_message (event_id, sender_id, content, kind)
  VALUES (
    p_event_id,
    NULL,
    'MVP kesinleşti! +10 skill bonusu uygulandı.',
    'system'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('event_id', p_event_id, 'mvp_profile_id', v_top_profile)
  );
END;
$$;

-- 9. Realtime publication
ALTER TABLE public.match_result REPLICA IDENTITY FULL;
ALTER TABLE public.mvp_vote     REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'match_result'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mvp_vote'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mvp_vote;
  END IF;
END $$;
