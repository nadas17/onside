-- =============================================================================
-- 0006_event_organizer_auto_join.sql
--
-- Spec §19 E8 ve kullanıcı isteği: organizer event oluşturduğunda otomatik
-- kadroda confirmed olarak yer alır. Pozisyon: profile.preferred_position varsa
-- o, yoksa 'MID' (orta saha). Backfill ile mevcut etkinliklere organizer ekle.
-- cancel_rsvp organizer'ı kadrodan çıkaramaz (kendi etkinliğinde locked).
-- =============================================================================

-- 1. Trigger function: AFTER INSERT ON event
CREATE OR REPLACE FUNCTION public.event_after_insert_add_organizer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_position public.position;
BEGIN
  SELECT preferred_position INTO v_position
  FROM public.profile
  WHERE id = NEW.organizer_id;

  v_position := coalesce(v_position, 'MID'::public.position);

  INSERT INTO public.event_participant (event_id, profile_id, position, status)
  VALUES (NEW.id, NEW.organizer_id, v_position, 'confirmed');

  -- Capacity 1 ise direkt full
  IF 1 >= NEW.capacity THEN
    UPDATE public.event SET status = 'full' WHERE id = NEW.id AND status = 'open';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER event_add_organizer_to_roster
AFTER INSERT ON public.event
FOR EACH ROW
EXECUTE FUNCTION public.event_after_insert_add_organizer();

-- 2. Backfill: mevcut event'lerin organizer'ını eksikse ekle
INSERT INTO public.event_participant (event_id, profile_id, position, status)
SELECT
  e.id,
  e.organizer_id,
  coalesce(p.preferred_position, 'MID'::public.position),
  'confirmed'::public.participant_status
FROM public.event e
LEFT JOIN public.profile p ON p.id = e.organizer_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_participant ep
  WHERE ep.event_id = e.id
    AND ep.profile_id = e.organizer_id
    AND ep.status IN ('pending', 'confirmed')
);

-- 3. Backfill sonrası capacity dolu olan event'leri full'a çek
WITH confirmed_counts AS (
  SELECT event_id, count(*)::int AS n
  FROM public.event_participant
  WHERE status = 'confirmed'
  GROUP BY event_id
)
UPDATE public.event e
SET status = 'full'
FROM confirmed_counts c
WHERE c.event_id = e.id
  AND e.status = 'open'
  AND c.n >= e.capacity;

-- 4. cancel_rsvp: organizer kendini iptal edemez
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

  IF v_event.organizer_id = v_user_id THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'forbidden',
      'error', 'Organizatör kendi etkinliğinden çıkamaz; etkinliği iptal etmek istersen "Etkinliği iptal et" kullan.'
    );
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

-- 5. kick_participant: organizer'ı kick edilemez (zaten kendisi çağırdığı için saçma ama defansif)
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

  IF p_profile_id = v_event.organizer_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Organizatör kendini kick edemez.');
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
