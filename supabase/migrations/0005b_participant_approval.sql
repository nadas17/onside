-- =============================================================================
-- 0005b_participant_approval.sql — ADR-0003 (2/2)
--
-- 0005a uygulandıktan sonra çalıştırılır.
-- =============================================================================

-- 1. Veri sıfırla (test verisi)
TRUNCATE TABLE public.event_participant RESTART IDENTITY CASCADE;

-- 2. rejected_reason kolonu
ALTER TABLE public.event_participant
  ADD COLUMN IF NOT EXISTS rejected_reason text;

-- 3. status default 'pending'
ALTER TABLE public.event_participant
  ALTER COLUMN status SET DEFAULT 'pending';

-- 4. join_event: pending insert
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
  v_existing_id uuid;
  v_now timestamptz := now();
  v_participant_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  IF NOT public.auth_user_active() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Hesap aktif değil.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;

  IF v_event.organizer_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Organizatör kendi etkinliğine talep gönderemez.');
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
      'error', 'Etkinlik şu an talep almıyor.'
    );
  END IF;

  -- Aktif kayıt (pending veya confirmed) varsa idempotent
  SELECT id INTO v_existing_id
  FROM public.event_participant
  WHERE event_id = p_event_id
    AND profile_id = v_user_id
    AND status IN ('pending', 'confirmed')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object('participant_id', v_existing_id, 'already_requested', true)
    );
  END IF;

  -- Cancelled satırı varsa onu pending'e geri al
  SELECT id INTO v_existing_id
  FROM public.event_participant
  WHERE event_id = p_event_id
    AND profile_id = v_user_id
    AND status = 'cancelled'
  ORDER BY cancelled_at DESC NULLS LAST
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.event_participant
    SET status = 'pending',
        position = p_position,
        cancelled_at = NULL,
        rejected_reason = NULL,
        joined_at = v_now
    WHERE id = v_existing_id
    RETURNING id INTO v_participant_id;
  ELSE
    INSERT INTO public.event_participant (event_id, profile_id, position, status)
    VALUES (p_event_id, v_user_id, p_position, 'pending')
    RETURNING id INTO v_participant_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('participant_id', v_participant_id, 'already_requested', false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_event(uuid, public.position) TO authenticated;

-- 5. approve_participant
CREATE OR REPLACE FUNCTION public.approve_participant(p_participant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_participant public.event_participant%ROWTYPE;
  v_event public.event%ROWTYPE;
  v_count int;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  SELECT * INTO v_participant
  FROM public.event_participant
  WHERE id = p_participant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Talep bulunamadı.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event:' || v_participant.event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = v_participant.event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;

  IF v_event.organizer_id <> v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sadece organizatör onaylayabilir.');
  END IF;

  IF v_participant.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Talep beklemede değil.');
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.event_participant
  WHERE event_id = v_event.id AND status = 'confirmed';

  IF v_count >= v_event.capacity THEN
    RETURN jsonb_build_object('ok', false, 'code', 'full', 'error', 'Kadro dolu, başka birini onaylayın.');
  END IF;

  UPDATE public.event_participant
  SET status = 'confirmed',
      joined_at = v_now,
      rejected_reason = NULL
  WHERE id = p_participant_id;

  IF v_count + 1 >= v_event.capacity AND v_event.status = 'open' THEN
    UPDATE public.event SET status = 'full' WHERE id = v_event.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('participant_id', p_participant_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_participant(uuid) TO authenticated;

-- 6. reject_participant
CREATE OR REPLACE FUNCTION public.reject_participant(
  p_participant_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_participant public.event_participant%ROWTYPE;
  v_event public.event%ROWTYPE;
  v_now timestamptz := now();
  v_reason text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  SELECT * INTO v_participant
  FROM public.event_participant
  WHERE id = p_participant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Talep bulunamadı.');
  END IF;

  SELECT * INTO v_event FROM public.event WHERE id = v_participant.event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;

  IF v_event.organizer_id <> v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sadece organizatör reddedebilir.');
  END IF;

  IF v_participant.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Talep beklemede değil.');
  END IF;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  UPDATE public.event_participant
  SET status = 'cancelled',
      cancelled_at = v_now,
      rejected_reason = v_reason
  WHERE id = p_participant_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('participant_id', p_participant_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_participant(uuid, text) TO authenticated;

-- 7. cancel_rsvp: pending VEYA confirmed
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
  v_was_confirmed boolean;
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

  SELECT id, (status = 'confirmed') INTO v_participant_id, v_was_confirmed
  FROM public.event_participant
  WHERE event_id = p_event_id
    AND profile_id = v_user_id
    AND status IN ('pending', 'confirmed')
  LIMIT 1;

  IF v_participant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Aktif kayıt yok.');
  END IF;

  UPDATE public.event_participant
  SET status = 'cancelled', cancelled_at = v_now
  WHERE id = v_participant_id;

  IF v_was_confirmed THEN
    SELECT count(*)::int INTO v_count
    FROM public.event_participant
    WHERE event_id = p_event_id AND status = 'confirmed';

    IF v_event.status = 'full' AND v_count < v_event.capacity THEN
      UPDATE public.event SET status = 'open' WHERE id = p_event_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('participant_id', v_participant_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_rsvp(uuid) TO authenticated;
