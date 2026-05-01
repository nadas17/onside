-- =============================================================================
-- 0013_team_balancing.sql
--
-- Phase 6 — Team Balancing (spec §5, §9, §11).
--
-- Tablolar:
--   team               — bir event için A/B label, seed, skill_total
--   team_assignment    — oyuncu↔takım↔pozisyon eşlemesi
--
-- RPC'ler (SECURITY DEFINER, organizer-only):
--   save_teams(p_event_id, p_seed, p_assignments)
--     → eski team+assignment cascade siler, yenisini insert eder, event.status='locked'
--   unlock_teams(p_event_id)
--     → assignments siler, status confirmed_count'a göre full/open'a döner
--
-- Algoritma JS tarafında (lib/balance/algorithm.ts) — pure, testable, deterministic.
-- DB sadece atomik persist + state transition + auth.
--
-- RLS:
--   SELECT: public (event public ise zaten görünür; assignment privacy hassasiyetsiz)
--   INSERT/UPDATE/DELETE: yok — sadece SECURITY DEFINER RPC üzerinden
-- =============================================================================

-- 1. team
CREATE TABLE IF NOT EXISTS public.team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.event(id) ON DELETE CASCADE,
  label text NOT NULL,
  seed integer NOT NULL,
  skill_total integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_label_valid CHECK (label IN ('A', 'B'))
);

CREATE UNIQUE INDEX IF NOT EXISTS team_event_label_unique
  ON public.team(event_id, label);
CREATE INDEX IF NOT EXISTS team_event_idx ON public.team(event_id);

-- 2. team_assignment
CREATE TABLE IF NOT EXISTS public.team_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.team(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.event(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profile(id) ON DELETE CASCADE,
  position public.position NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_assignment_event_profile_unique
  ON public.team_assignment(event_id, profile_id);
CREATE INDEX IF NOT EXISTS team_assignment_team_idx ON public.team_assignment(team_id);
CREATE INDEX IF NOT EXISTS team_assignment_event_idx ON public.team_assignment(event_id);

-- 3. RLS
ALTER TABLE public.team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_assignment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_select_public ON public.team;
CREATE POLICY team_select_public
ON public.team
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS team_assignment_select_public ON public.team_assignment;
CREATE POLICY team_assignment_select_public
ON public.team_assignment
FOR SELECT
TO anon, authenticated
USING (true);

-- INSERT/UPDATE/DELETE policy yok → sadece SECURITY DEFINER RPC

-- 4. RPC: save_teams
--    p_assignments format: jsonb array
--      [
--        { "team_label": "A", "skill_total": 4500, "members": [
--            { "profile_id": "...", "position": "GK" },
--            { "profile_id": "...", "position": "DEF" }
--        ]},
--        { "team_label": "B", "skill_total": 4480, "members": [...] }
--      ]
CREATE OR REPLACE FUNCTION public.save_teams(
  p_event_id uuid,
  p_seed integer,
  p_assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_team_a uuid;
  v_team_b uuid;
  v_member jsonb;
  v_member_count int;
  v_confirmed_count int;
  v_team jsonb;
  v_assigned_profile_ids uuid[];
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
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sadece organizatör takım kurabilir.');
  END IF;

  IF v_event.status NOT IN ('open', 'full', 'locked') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'invalid_status',
      'error', 'Bu durumda takım kurulamaz: ' || v_event.status
    );
  END IF;

  -- Confirmed count check
  SELECT count(*)::int INTO v_confirmed_count
  FROM public.event_participant
  WHERE event_id = p_event_id AND status = 'confirmed';

  IF v_confirmed_count < v_event.min_players_to_confirm THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'not_enough_players',
      'error', 'Min oyuncu sayısı henüz dolmadı.'
    );
  END IF;

  -- Payload validation: 2 takım, label A ve B
  IF jsonb_array_length(p_assignments) <> 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'error', 'İki takım gerekli.');
  END IF;

  -- Tüm assigned profile_id'leri topla, validation için
  v_assigned_profile_ids := ARRAY(
    SELECT (m->>'profile_id')::uuid
    FROM jsonb_array_elements(p_assignments) t,
         jsonb_array_elements(t->'members') m
  );

  v_member_count := array_length(v_assigned_profile_ids, 1);
  IF v_member_count IS NULL OR v_member_count <> v_confirmed_count THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'roster_mismatch',
      'error', 'Takımlardaki oyuncu sayısı kadroyla uyuşmuyor.'
    );
  END IF;

  -- Tüm payload profile_id'leri confirmed olmalı
  IF EXISTS (
    SELECT 1 FROM unnest(v_assigned_profile_ids) AS pid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.event_participant
      WHERE event_id = p_event_id
        AND profile_id = pid
        AND status = 'confirmed'
    )
  ) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'roster_mismatch',
      'error', 'Takımlarda confirmed olmayan oyuncu var.'
    );
  END IF;

  -- Duplicate profile check
  IF (SELECT count(DISTINCT pid) FROM unnest(v_assigned_profile_ids) AS pid) <> v_member_count THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'duplicate_player',
      'error', 'Bir oyuncu birden fazla takımda olamaz.'
    );
  END IF;

  -- Eski team + assignment'ları sil (cascade assignment'ları da götürür)
  DELETE FROM public.team WHERE event_id = p_event_id;

  -- Yeni takımları yaz
  FOR v_team IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    IF v_team->>'team_label' = 'A' THEN
      INSERT INTO public.team (event_id, label, seed, skill_total)
      VALUES (p_event_id, 'A', p_seed, (v_team->>'skill_total')::int)
      RETURNING id INTO v_team_a;

      FOR v_member IN SELECT * FROM jsonb_array_elements(v_team->'members')
      LOOP
        INSERT INTO public.team_assignment (team_id, event_id, profile_id, position)
        VALUES (
          v_team_a,
          p_event_id,
          (v_member->>'profile_id')::uuid,
          (v_member->>'position')::public.position
        );
      END LOOP;
    ELSIF v_team->>'team_label' = 'B' THEN
      INSERT INTO public.team (event_id, label, seed, skill_total)
      VALUES (p_event_id, 'B', p_seed, (v_team->>'skill_total')::int)
      RETURNING id INTO v_team_b;

      FOR v_member IN SELECT * FROM jsonb_array_elements(v_team->'members')
      LOOP
        INSERT INTO public.team_assignment (team_id, event_id, profile_id, position)
        VALUES (
          v_team_b,
          p_event_id,
          (v_member->>'profile_id')::uuid,
          (v_member->>'position')::public.position
        );
      END LOOP;
    ELSE
      RETURN jsonb_build_object(
        'ok', false, 'code', 'invalid_payload',
        'error', 'Geçersiz takım label: ' || (v_team->>'team_label')
      );
    END IF;
  END LOOP;

  -- Status → locked
  UPDATE public.event SET status = 'locked', updated_at = now() WHERE id = p_event_id;

  -- System chat message
  INSERT INTO public.chat_message (event_id, sender_id, content, kind)
  VALUES (
    p_event_id,
    NULL,
    'Takımlar oluşturuldu. Lütfen kadroyu kontrol et.',
    'system'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'event_id', p_event_id,
      'team_a_id', v_team_a,
      'team_b_id', v_team_b
    )
  );
END;
$$;

-- 5. RPC: unlock_teams (re-balance edilirken kilidi açar; status'u confirmed count'a göre çeker)
CREATE OR REPLACE FUNCTION public.unlock_teams(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_confirmed_count int;
  v_new_status public.event_status;
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

  IF v_event.status <> 'locked' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'invalid_status',
      'error', 'Sadece locked durumda kilit açılabilir.'
    );
  END IF;

  DELETE FROM public.team WHERE event_id = p_event_id;

  SELECT count(*)::int INTO v_confirmed_count
  FROM public.event_participant
  WHERE event_id = p_event_id AND status = 'confirmed';

  v_new_status := CASE
    WHEN v_confirmed_count >= v_event.capacity THEN 'full'::public.event_status
    ELSE 'open'::public.event_status
  END;

  UPDATE public.event
  SET status = v_new_status, updated_at = now()
  WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('event_id', p_event_id, 'status', v_new_status)
  );
END;
$$;
