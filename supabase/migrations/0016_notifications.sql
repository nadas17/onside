-- =============================================================================
-- 0016_notifications.sql
--
-- Phase 9 — In-app notifications (spec §13).
--
-- Tablo:
--   notification — recipient, kind, event_id?, payload jsonb, read_at, created_at
--
-- Trigger'lar (mevcut RPC'lerin yan etkisi olarak insert):
--   approve_participant     → recipient = participant.profile_id, kind=rsvp_approved
--   reject_participant      → kind=rsvp_rejected
--   event status='full'     → recipient = organizer, kind=event_full
--   cancel_event_action    → tüm confirmed katılımcılara kind=event_cancelled
--   save_teams              → tüm confirmed'lere kind=team_assignment
--   submit_score            → tüm attended'lara kind=match_completed
--   finalize_mvp            → mvp_profile_id'ye kind=mvp_received
--
-- Bu migration trigger'ları DB-level (AFTER UPDATE/INSERT) ekler — RPC'lerle
-- duplicate notification olmaması için RPC kodlarına dokunulmaz, sadece
-- trigger'la otomatik insert edilir. Trigger SECURITY DEFINER, RLS bypass.
--
-- RLS: SELECT recipient_id = auth.uid(); UPDATE same (read_at toggle); DELETE
-- own kayıt. INSERT yok (sadece trigger).
-- =============================================================================

-- 1. Tablo
CREATE TABLE IF NOT EXISTS public.notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profile(id) ON DELETE CASCADE,
  kind text NOT NULL,
  event_id uuid REFERENCES public.event(id) ON DELETE CASCADE,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_kind_valid CHECK (kind IN (
    'rsvp_approved', 'rsvp_rejected', 'event_full', 'event_cancelled',
    'team_assignment', 'match_completed', 'mvp_received', 'chat_mention'
  ))
);

CREATE INDEX IF NOT EXISTS notification_recipient_time_idx
  ON public.notification(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_recipient_unread_idx
  ON public.notification(recipient_id, created_at DESC) WHERE read_at IS NULL;

-- 2. RLS
ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_select_own ON public.notification;
CREATE POLICY notification_select_own ON public.notification
  FOR SELECT TO authenticated USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS notification_update_own ON public.notification;
CREATE POLICY notification_update_own ON public.notification
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS notification_delete_own ON public.notification;
CREATE POLICY notification_delete_own ON public.notification
  FOR DELETE TO authenticated USING (recipient_id = auth.uid());

-- INSERT yok → sadece trigger via SECURITY DEFINER

-- 3. Realtime publication
ALTER TABLE public.notification REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notification'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification;
  END IF;
END $$;

-- 4. Trigger: event_participant status değişimi → rsvp_approved / rsvp_rejected
CREATE OR REPLACE FUNCTION public.notify_participant_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
    INSERT INTO public.notification (recipient_id, kind, event_id, payload)
    VALUES (
      NEW.profile_id, 'rsvp_approved', NEW.event_id,
      jsonb_build_object('participant_id', NEW.id)
    );
  ELSIF OLD.status = 'pending' AND NEW.status = 'cancelled' AND NEW.rejected_reason IS NOT NULL THEN
    INSERT INTO public.notification (recipient_id, kind, event_id, payload)
    VALUES (
      NEW.profile_id, 'rsvp_rejected', NEW.event_id,
      jsonb_build_object('reason', NEW.rejected_reason)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_participant_notify ON public.event_participant;
CREATE TRIGGER event_participant_notify
AFTER UPDATE OF status ON public.event_participant
FOR EACH ROW
EXECUTE FUNCTION public.notify_participant_status_change();

-- 5. Trigger: event status değişimi → event_full / event_cancelled
CREATE OR REPLACE FUNCTION public.notify_event_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- open → full: organizer'a haber
  IF OLD.status = 'open' AND NEW.status = 'full' THEN
    INSERT INTO public.notification (recipient_id, kind, event_id, payload)
    VALUES (
      NEW.organizer_id, 'event_full', NEW.id,
      jsonb_build_object('capacity', NEW.capacity)
    );
  END IF;

  -- → cancelled: tüm confirmed katılımcılara (organizer hariç) haber
  IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
    INSERT INTO public.notification (recipient_id, kind, event_id, payload)
    SELECT
      ep.profile_id, 'event_cancelled', NEW.id,
      jsonb_build_object('reason', NEW.cancelled_reason)
    FROM public.event_participant ep
    WHERE ep.event_id = NEW.id
      AND ep.status = 'confirmed'
      AND ep.profile_id <> NEW.organizer_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_status_notify ON public.event;
CREATE TRIGGER event_status_notify
AFTER UPDATE OF status ON public.event
FOR EACH ROW
EXECUTE FUNCTION public.notify_event_status_change();

-- 6. Trigger: team kurulduğunda → tüm confirmed'lere team_assignment
--    save_teams RPC önce team siler → INSERT yapar. Per-team_assignment INSERT
--    spam'lamayalım, event başına bir notification yeter.
--    Stratejik: team INSERT trigger'ı, event başına bir kez (label='A' insertinde).
CREATE OR REPLACE FUNCTION public.notify_team_assignment_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sadece label='A' eklendiğinde tetikle (B aynı transaction'da gelir, dup engellenir)
  IF NEW.label = 'A' THEN
    INSERT INTO public.notification (recipient_id, kind, event_id, payload)
    SELECT
      ep.profile_id, 'team_assignment', NEW.event_id,
      jsonb_build_object()
    FROM public.event_participant ep
    JOIN public.event e ON e.id = ep.event_id
    WHERE ep.event_id = NEW.event_id
      AND ep.status = 'confirmed'
      AND ep.profile_id <> e.organizer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_assignment_notify ON public.team;
CREATE TRIGGER team_assignment_notify
AFTER INSERT ON public.team
FOR EACH ROW
EXECUTE FUNCTION public.notify_team_assignment_created();

-- 7. Trigger: match_result INSERT → tüm attended'lara match_completed
CREATE OR REPLACE FUNCTION public.notify_match_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification (recipient_id, kind, event_id, payload)
  SELECT
    pms.profile_id, 'match_completed', NEW.event_id,
    jsonb_build_object('score_a', NEW.score_a, 'score_b', NEW.score_b)
  FROM public.player_match_stat pms
  JOIN public.event e ON e.id = pms.event_id
  WHERE pms.event_id = NEW.event_id
    AND pms.attended = true
    AND pms.profile_id <> e.organizer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_result_notify ON public.match_result;
CREATE TRIGGER match_result_notify
AFTER INSERT ON public.match_result
FOR EACH ROW
EXECUTE FUNCTION public.notify_match_completed();

-- 8. Trigger: match_result UPDATE OF mvp_profile_id → MVP'ye haber
CREATE OR REPLACE FUNCTION public.notify_mvp_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mvp_profile_id IS NOT NULL
     AND (OLD.mvp_profile_id IS DISTINCT FROM NEW.mvp_profile_id) THEN
    INSERT INTO public.notification (recipient_id, kind, event_id, payload)
    VALUES (
      NEW.mvp_profile_id, 'mvp_received', NEW.event_id,
      jsonb_build_object('bonus', 10)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_result_mvp_notify ON public.match_result;
CREATE TRIGGER match_result_mvp_notify
AFTER UPDATE OF mvp_profile_id ON public.match_result
FOR EACH ROW
EXECUTE FUNCTION public.notify_mvp_received();

-- 9. RPC: mark_notification_read (single)
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;
  UPDATE public.notification
  SET read_at = now()
  WHERE id = p_notification_id AND recipient_id = v_user_id AND read_at IS NULL;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('id', p_notification_id));
END;
$$;

-- 10. RPC: mark_all_notifications_read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;
  WITH updated AS (
    UPDATE public.notification SET read_at = now()
    WHERE recipient_id = v_user_id AND read_at IS NULL
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM updated;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('marked', v_count));
END;
$$;
