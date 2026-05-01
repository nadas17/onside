-- =============================================================================
-- 0007_chat_message.sql — Phase 5 Real-time Chat
--
-- chat_message + report + RLS + Realtime publication.
-- System messages (kind='system', sender_id NULL) için RPC: post_system_message.
-- =============================================================================

-- 1. chat_message
CREATE TABLE public.chat_message (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.event(id) ON DELETE CASCADE,
  sender_id   uuid REFERENCES public.profile(id) ON DELETE CASCADE,
  content     text NOT NULL,
  kind        text NOT NULL DEFAULT 'text',
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz,
  CONSTRAINT chat_message_kind_valid CHECK (kind IN ('text', 'system')),
  CONSTRAINT chat_message_content_length CHECK (char_length(content) BETWEEN 1 AND 1000),
  CONSTRAINT chat_message_system_no_sender CHECK (
    (kind = 'system' AND sender_id IS NULL)
    OR (kind = 'text' AND sender_id IS NOT NULL)
  )
);

CREATE INDEX chat_message_event_time_idx
ON public.chat_message (event_id, created_at);

-- 2. report
CREATE TABLE public.report (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id         uuid NOT NULL REFERENCES public.profile(id) ON DELETE CASCADE,
  target_message_id   uuid REFERENCES public.chat_message(id) ON DELETE CASCADE,
  target_profile_id   uuid REFERENCES public.profile(id) ON DELETE CASCADE,
  reason              text NOT NULL,
  notes               text,
  status              text NOT NULL DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_reason_valid CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'other')),
  CONSTRAINT report_status_valid CHECK (status IN ('pending', 'resolved', 'dismissed')),
  CONSTRAINT report_target_required CHECK (
    target_message_id IS NOT NULL OR target_profile_id IS NOT NULL
  )
);

CREATE INDEX report_status_idx ON public.report (status);
CREATE INDEX report_reporter_idx ON public.report (reporter_id);

-- 3. RLS chat_message
ALTER TABLE public.chat_message ENABLE ROW LEVEL SECURITY;

-- SELECT: confirmed katılımcı veya organizer (spec §6 chat_message satırı)
CREATE POLICY chat_message_select_participants_or_organizer
ON public.chat_message
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = event_id
      AND (
        e.organizer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.event_participant p
          WHERE p.event_id = e.id
            AND p.profile_id = auth.uid()
            AND p.status = 'confirmed'
        )
      )
  )
);

-- INSERT/UPDATE/DELETE: sadece RPC üzerinden (SECURITY DEFINER)

-- 4. RLS report
ALTER TABLE public.report ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_select_self
ON public.report
FOR SELECT
TO authenticated
USING (reporter_id = auth.uid());

-- INSERT/UPDATE: RPC üzerinden

-- 5. Realtime publication (Supabase Realtime postgres_changes için)
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message;

-- 6. RPC: send_message
CREATE OR REPLACE FUNCTION public.send_message(
  p_event_id uuid,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_can_chat boolean;
  v_message_id uuid;
  v_trimmed text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  IF NOT public.auth_user_active() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Hesap aktif değil.');
  END IF;

  v_trimmed := trim(coalesce(p_content, ''));
  IF char_length(v_trimmed) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Boş mesaj.');
  END IF;
  IF char_length(v_trimmed) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Mesaj 1000 karakteri aşıyor.');
  END IF;

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;

  IF v_event.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Etkinlik iptal edildi, sohbet kapalı.');
  END IF;

  IF v_event.chat_locked THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sohbet organizer tarafından kilitlendi.');
  END IF;

  -- Kullanıcı confirmed katılımcı VEYA organizer olmalı
  v_can_chat := (v_event.organizer_id = v_user_id) OR EXISTS (
    SELECT 1 FROM public.event_participant
    WHERE event_id = p_event_id
      AND profile_id = v_user_id
      AND status = 'confirmed'
  );

  IF NOT v_can_chat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sohbet için kadroda olman gerekli.');
  END IF;

  INSERT INTO public.chat_message (event_id, sender_id, content, kind)
  VALUES (p_event_id, v_user_id, v_trimmed, 'text')
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('message_id', v_message_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;

-- 7. RPC: delete_message (owner 5dk içinde, organizer her zaman)
CREATE OR REPLACE FUNCTION public.delete_message(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_message public.chat_message%ROWTYPE;
  v_event public.event%ROWTYPE;
  v_is_owner boolean;
  v_is_organizer boolean;
  v_within_window boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  SELECT * INTO v_message FROM public.chat_message WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Mesaj bulunamadı.');
  END IF;

  IF v_message.kind = 'system' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sistem mesajı silinemez.');
  END IF;

  SELECT * INTO v_event FROM public.event WHERE id = v_message.event_id;
  v_is_owner := v_message.sender_id = v_user_id;
  v_is_organizer := v_event.organizer_id = v_user_id;
  v_within_window := v_message.created_at > now() - interval '5 minutes';

  IF NOT (v_is_organizer OR (v_is_owner AND v_within_window)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Bu mesajı silme yetkin yok.');
  END IF;

  UPDATE public.chat_message
  SET is_deleted = true
  WHERE id = p_message_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('message_id', p_message_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_message(uuid) TO authenticated;

-- 8. RPC: report_message
CREATE OR REPLACE FUNCTION public.report_message(
  p_message_id uuid,
  p_reason text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_message public.chat_message%ROWTYPE;
  v_report_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed', 'error', 'Oturum bulunamadı.');
  END IF;

  IF p_reason NOT IN ('spam', 'harassment', 'inappropriate', 'other') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Geçersiz neden.');
  END IF;

  SELECT * INTO v_message FROM public.chat_message WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Mesaj bulunamadı.');
  END IF;

  IF v_message.sender_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Sistem mesajı raporlanamaz.');
  END IF;

  -- Aynı kullanıcı aynı mesaja birden çok rapor göndermesin
  IF EXISTS (
    SELECT 1 FROM public.report
    WHERE reporter_id = v_user_id
      AND target_message_id = p_message_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('already_reported', true));
  END IF;

  INSERT INTO public.report (reporter_id, target_message_id, target_profile_id, reason, notes)
  VALUES (v_user_id, p_message_id, v_message.sender_id, p_reason, nullif(trim(coalesce(p_notes, '')), ''))
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('report_id', v_report_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_message(uuid, text, text) TO authenticated;

-- 9. RPC: post_system_message (server action'lardan çağrılır)
CREATE OR REPLACE FUNCTION public.post_system_message(
  p_event_id uuid,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.event%ROWTYPE;
  v_message_id uuid;
BEGIN
  -- Sadece organizer veya server-side context'ten çağrılır
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_failed');
  END IF;

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_event.organizer_id <> v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  INSERT INTO public.chat_message (event_id, sender_id, content, kind)
  VALUES (p_event_id, NULL, trim(p_content), 'system')
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('message_id', v_message_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_system_message(uuid, text) TO authenticated;
