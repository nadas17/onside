-- =============================================================================
-- 0004_event_participant.sql — Phase 4 RSVP
--
-- event_participant + RLS + race-safe RPC fonksiyonları:
--   public.confirmed_count(event_id)        — RLS bypass count helper
--   public.join_event(event_id, position)   — advisory lock + capacity check
--   public.cancel_rsvp(event_id)            — soft cancel + open'a geri çek
--   public.kick_participant(event_id, profile_id) — organizer-only
-- =============================================================================

-- 1. ENUM
CREATE TYPE public.participant_status AS ENUM (
  'confirmed',
  'cancelled',
  'no_show',
  'attended'
);

-- 2. TABLO
CREATE TABLE public.event_participant (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.event(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES public.profile(id) ON DELETE CASCADE,
  position      public.position NOT NULL,
  status        public.participant_status NOT NULL DEFAULT 'confirmed',
  joined_at     timestamptz NOT NULL DEFAULT now(),
  cancelled_at  timestamptz
);

-- Aktif (confirmed/no_show/attended — yani cancelled olmayan) bir satır per (event, profile).
CREATE UNIQUE INDEX event_participant_unique_active
ON public.event_participant (event_id, profile_id)
WHERE status <> 'cancelled';

CREATE INDEX event_participant_event_idx
ON public.event_participant (event_id);

CREATE INDEX event_participant_profile_idx
ON public.event_participant (profile_id);

-- 3. RLS — okuma açık, mutation'lar RPC üzerinden (RPC SECURITY DEFINER bypass eder)
ALTER TABLE public.event_participant ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_participant_select_public
ON public.event_participant
FOR SELECT
TO anon, authenticated
USING (true);

-- INSERT/UPDATE/DELETE policy YOK; tüm mutation'lar SECURITY DEFINER RPC'lerden geçer.

-- 4. HELPER
CREATE OR REPLACE FUNCTION public.confirmed_count(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.event_participant
  WHERE event_id = p_event_id AND status = 'confirmed';
$$;
GRANT EXECUTE ON FUNCTION public.confirmed_count(uuid) TO anon, authenticated;

-- 5. RPC: join_event
CREATE OR REPLACE FUNCTION public.join_event(
  p_event_id uuid,
  p_position public.position
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_count int;
  v_existing_id uuid;
  v_existing_status public.participant_status;
  v_now timestamptz := now();
  v_participant_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  IF NOT public.auth_user_active() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Hesap aktif değil.');
  END IF;

  -- Aynı event üzerinde concurrent join'leri serileştir
  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;

  IF v_event.is_hidden THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Etkinlik gizli.');
  END IF;

  IF v_event.start_at <= v_now THEN
    RETURN jsonb_build_object('ok', false, 'code', 'too_late', 'error', 'Etkinlik başlamış.');
  END IF;

  IF v_event.status NOT IN ('open') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code',
        CASE v_event.status
          WHEN 'full' THEN 'full'
          WHEN 'locked' THEN 'locked'
          ELSE 'not_joinable'
        END,
      'error', 'Etkinlik şu an katılıma kapalı.'
    );
  END IF;

  -- Idempotent: aktif kayıt varsa just success
  SELECT id, status INTO v_existing_id, v_existing_status
  FROM public.event_participant
  WHERE event_id = p_event_id
    AND profile_id = v_user_id
    AND status <> 'cancelled'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object('participant_id', v_existing_id, 'already_joined', true)
    );
  END IF;

  -- Capacity check
  SELECT count(*)::int INTO v_count
  FROM public.event_participant
  WHERE event_id = p_event_id AND status = 'confirmed';

  IF v_count >= v_event.capacity THEN
    -- DB tutarsızlığı: status open ama dolmuş — full'a çevir
    UPDATE public.event SET status = 'full' WHERE id = p_event_id AND status = 'open';
    RETURN jsonb_build_object('ok', false, 'code', 'full', 'error', 'Kadro dolu.');
  END IF;

  -- Daha önce cancel etmişse cancelled satırı restore et; yoksa yeni insert
  SELECT id INTO v_existing_id
  FROM public.event_participant
  WHERE event_id = p_event_id
    AND profile_id = v_user_id
    AND status = 'cancelled'
  ORDER BY cancelled_at DESC NULLS LAST
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.event_participant
    SET status = 'confirmed',
        position = p_position,
        cancelled_at = NULL,
        joined_at = v_now
    WHERE id = v_existing_id
    RETURNING id INTO v_participant_id;
  ELSE
    INSERT INTO public.event_participant (event_id, profile_id, position)
    VALUES (p_event_id, v_user_id, p_position)
    RETURNING id INTO v_participant_id;
  END IF;

  -- Capacity dolduysa status'u full'a çek
  IF v_count + 1 >= v_event.capacity THEN
    UPDATE public.event SET status = 'full' WHERE id = p_event_id AND status = 'open';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('participant_id', v_participant_id, 'already_joined', false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_event(uuid, public.position) TO authenticated;

-- 6. RPC: cancel_rsvp
CREATE OR REPLACE FUNCTION public.cancel_rsvp(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_participant_id uuid;
  v_count int;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;

  SELECT id INTO v_participant_id
  FROM public.event_participant
  WHERE event_id = p_event_id
    AND profile_id = v_user_id
    AND status = 'confirmed'
  LIMIT 1;

  IF v_participant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Kayıt yok.');
  END IF;

  UPDATE public.event_participant
  SET status = 'cancelled', cancelled_at = v_now
  WHERE id = v_participant_id;

  -- Capacity altına düştüyse full → open
  SELECT count(*)::int INTO v_count
  FROM public.event_participant
  WHERE event_id = p_event_id AND status = 'confirmed';

  IF v_event.status = 'full' AND v_count < v_event.capacity THEN
    UPDATE public.event SET status = 'open' WHERE id = p_event_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('participant_id', v_participant_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_rsvp(uuid) TO authenticated;

-- 7. RPC: kick_participant (organizer-only)
CREATE OR REPLACE FUNCTION public.kick_participant(
  p_event_id uuid,
  p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_participant_id uuid;
  v_count int;
  v_now timestamptz := now();
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
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sadece organizatör kick edebilir.');
  END IF;

  SELECT id INTO v_participant_id
  FROM public.event_participant
  WHERE event_id = p_event_id
    AND profile_id = p_profile_id
    AND status = 'confirmed'
  LIMIT 1;

  IF v_participant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Katılımcı yok.');
  END IF;

  UPDATE public.event_participant
  SET status = 'cancelled', cancelled_at = v_now
  WHERE id = v_participant_id;

  SELECT count(*)::int INTO v_count
  FROM public.event_participant
  WHERE event_id = p_event_id AND status = 'confirmed';

  IF v_event.status = 'full' AND v_count < v_event.capacity THEN
    UPDATE public.event SET status = 'open' WHERE id = p_event_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('participant_id', v_participant_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.kick_participant(uuid, uuid) TO authenticated;
