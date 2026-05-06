-- =============================================================================
-- 0019_drop_auth_profile.sql — Phase 12: nickname-only identity
--
-- Removes Supabase Auth + profile coupling entirely. Identity is now an
-- inline `nickname` text supplied per action; there is no persistent user
-- record. Tables that survive (event, event_participant, chat_message, team,
-- team_assignment, match_result, player_match_stat) lose their profile FKs
-- and gain `*_nickname` columns. Tables that exist only to track per-user
-- history or notify users (mvp_vote, skill_snapshot, notification, report)
-- are dropped — they will return as fresh schemas when those features are
-- re-introduced.
--
-- Existing rows in the surviving tables are TRUNCATEd: the data was test
-- material referencing user UUIDs that are about to disappear, and there
-- is no meaningful migration path to nicknames.
--
-- Apply order matters; cycle-breaking order:
--   1. cron + triggers + RPCs that reference auth.uid()/profile
--   2. RLS policies that reference auth.uid()/auth_user_active
--   3. helper auth_user_active()
--   4. drop deferred tables (mvp_vote, skill_snapshot, notification, report)
--   5. truncate + reshape surviving tables (drop FK + drop column + add
--      nickname column + recreate unique indexes)
--   6. drop profile table itself
--   7. install nickname-based RLS + RPCs
--   8. realtime publication membership
-- =============================================================================

-- Migration is idempotent — each statement guards against partial state, so
-- re-running on a half-applied DB completes the rest. Wrap the whole file in
-- BEGIN/COMMIT only when you control the client (psql, supabase CLI). Some
-- JS drivers (postgres-js) split multi-statement input across separate
-- transactions, which is why every CREATE here is paired with a DROP IF
-- EXISTS or uses CREATE OR REPLACE.

-- ----------------------------------------------------------------------------
-- 1. CRON
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('mvp_auto_finalize_hourly')
  FROM cron.job WHERE jobname = 'mvp_auto_finalize_hourly';
EXCEPTION WHEN OTHERS THEN
  -- pg_cron may not be installed in all envs; ignore.
  NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. TRIGGERS
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS event_add_organizer_to_roster ON public.event;
DROP TRIGGER IF EXISTS event_participant_notify ON public.event_participant;
DROP TRIGGER IF EXISTS event_status_notify ON public.event;
DROP TRIGGER IF EXISTS team_assignment_notify ON public.team;
DROP TRIGGER IF EXISTS match_result_notify ON public.match_result;
DROP TRIGGER IF EXISTS match_result_mvp_notify ON public.match_result;
DROP TRIGGER IF EXISTS profile_set_updated_at ON public.profile;

-- Trigger function bodies (event_set_updated_at on event keeps using
-- set_updated_at(), so DON'T drop set_updated_at()).
DROP FUNCTION IF EXISTS public.event_after_insert_add_organizer();
DROP FUNCTION IF EXISTS public.notify_participant_status_change();
DROP FUNCTION IF EXISTS public.notify_event_status_change();
DROP FUNCTION IF EXISTS public.notify_team_assignment_created();
DROP FUNCTION IF EXISTS public.notify_match_completed();
DROP FUNCTION IF EXISTS public.notify_mvp_received();

-- ----------------------------------------------------------------------------
-- 3. OLD RPCs (drop before policy + table changes so SECURITY DEFINER
--    callers don't reference disappearing columns)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.mark_notification_read(uuid);
DROP FUNCTION IF EXISTS public.mark_all_notifications_read();
DROP FUNCTION IF EXISTS public.finalize_mvp(uuid, uuid);
DROP FUNCTION IF EXISTS public.finalize_mvp_cron(uuid);
DROP FUNCTION IF EXISTS public.run_mvp_auto_finalize();
DROP FUNCTION IF EXISTS public.submit_mvp_vote(uuid, uuid);
DROP FUNCTION IF EXISTS public.submit_score(uuid, integer, integer, text);
DROP FUNCTION IF EXISTS public.edit_score(uuid, integer, integer, text);
DROP FUNCTION IF EXISTS public.apply_match_elo_internal(uuid);
DROP FUNCTION IF EXISTS public.derive_skill_level(integer);
DROP FUNCTION IF EXISTS public.save_teams(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.unlock_teams(uuid);
DROP FUNCTION IF EXISTS public.send_message(uuid, text);
DROP FUNCTION IF EXISTS public.delete_message(uuid);
DROP FUNCTION IF EXISTS public.report_message(uuid, text, text);
DROP FUNCTION IF EXISTS public.post_system_message(uuid, text);
DROP FUNCTION IF EXISTS public.join_event(uuid, public.position);
DROP FUNCTION IF EXISTS public.cancel_rsvp(uuid);
DROP FUNCTION IF EXISTS public.kick_participant(uuid, uuid);
DROP FUNCTION IF EXISTS public.approve_participant(uuid);
DROP FUNCTION IF EXISTS public.reject_participant(uuid, text);

-- confirmed_count(uuid) is auth-free → keep.

-- ----------------------------------------------------------------------------
-- 4. RLS POLICIES referencing auth.uid() or auth_user_active()
--    (drop before helper + table reshaping)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS profile_select_public ON public.profile;
DROP POLICY IF EXISTS profile_insert_self ON public.profile;
DROP POLICY IF EXISTS profile_update_self ON public.profile;

DROP POLICY IF EXISTS event_select_public_or_organizer ON public.event;
DROP POLICY IF EXISTS event_insert_self_organizer ON public.event;
DROP POLICY IF EXISTS event_update_organizer ON public.event;

DROP POLICY IF EXISTS chat_message_select_authenticated ON public.chat_message;
DROP POLICY IF EXISTS chat_message_select_participants_or_organizer ON public.chat_message;

-- The remaining policies (event_participant_select_public, team_select_public,
-- team_assignment_select_public, match_result_select_public,
-- player_match_stat_select_public) already use USING (true) and stay valid
-- after table reshape — no drop needed.

-- ----------------------------------------------------------------------------
-- 5. HELPER FUNCTION
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.auth_user_active();

-- ----------------------------------------------------------------------------
-- 6. DROP DEFERRED TABLES (will be reintroduced fresh when their features
--    return; nickname-husks would be dead weight)
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.report CASCADE;
DROP TABLE IF EXISTS public.mvp_vote CASCADE;
DROP TABLE IF EXISTS public.skill_snapshot CASCADE;
DROP TABLE IF EXISTS public.notification CASCADE;

-- notification_kind enum (if it was created as a separate type) — none in
-- this schema; notification.kind is text+CHECK.

-- ----------------------------------------------------------------------------
-- 7. TRUNCATE + RESHAPE SURVIVING TABLES
-- ----------------------------------------------------------------------------

TRUNCATE TABLE
  public.chat_message,
  public.player_match_stat,
  public.match_result,
  public.team_assignment,
  public.team,
  public.event_participant,
  public.event
CASCADE;

-- 7a. event: drop organizer_id, add organizer_nickname
ALTER TABLE public.event
  DROP CONSTRAINT IF EXISTS event_organizer_id_fkey,
  DROP COLUMN IF EXISTS organizer_id;

DROP INDEX IF EXISTS public.event_organizer_idx;

ALTER TABLE public.event
  ADD COLUMN IF NOT EXISTS organizer_nickname text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.event
  DROP CONSTRAINT IF EXISTS event_organizer_nickname_format;
ALTER TABLE public.event
  ADD CONSTRAINT event_organizer_nickname_format
  CHECK (organizer_nickname ~ '^[A-Za-z0-9_ -]{3,24}$');

-- 7b. event_participant: drop profile_id, add nickname
ALTER TABLE public.event_participant
  DROP CONSTRAINT IF EXISTS event_participant_profile_id_fkey;

DROP INDEX IF EXISTS public.event_participant_unique_active;
DROP INDEX IF EXISTS public.event_participant_profile_idx;

ALTER TABLE public.event_participant
  DROP COLUMN IF EXISTS profile_id;

ALTER TABLE public.event_participant
  ADD COLUMN IF NOT EXISTS nickname text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.event_participant
  ALTER COLUMN nickname DROP DEFAULT;

ALTER TABLE public.event_participant
  DROP CONSTRAINT IF EXISTS event_participant_nickname_format;
ALTER TABLE public.event_participant
  ADD CONSTRAINT event_participant_nickname_format
  CHECK (nickname ~ '^[A-Za-z0-9_ -]{3,24}$');

CREATE UNIQUE INDEX IF NOT EXISTS event_participant_unique_active
  ON public.event_participant (event_id, nickname)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS event_participant_nickname_idx
  ON public.event_participant (nickname);

-- Drop the obsolete 'pending' participant_status enum value if present.
-- We don't actually delete the enum value (Postgres doesn't support it
-- cleanly); the constant simply stops being used by RPCs / app code.

-- 7c. chat_message: drop sender_id, add sender_nickname (nullable for system)
ALTER TABLE public.chat_message
  DROP CONSTRAINT IF EXISTS chat_message_sender_id_fkey,
  DROP CONSTRAINT IF EXISTS chat_message_system_no_sender,
  DROP COLUMN IF EXISTS sender_id;

ALTER TABLE public.chat_message
  ADD COLUMN IF NOT EXISTS sender_nickname text;

ALTER TABLE public.chat_message
  DROP CONSTRAINT IF EXISTS chat_message_system_no_sender;
ALTER TABLE public.chat_message
  ADD CONSTRAINT chat_message_system_no_sender CHECK (
    (kind = 'system' AND sender_nickname IS NULL)
    OR (kind = 'text' AND sender_nickname IS NOT NULL)
  );

ALTER TABLE public.chat_message
  DROP CONSTRAINT IF EXISTS chat_message_sender_nickname_format;
ALTER TABLE public.chat_message
  ADD CONSTRAINT chat_message_sender_nickname_format CHECK (
    sender_nickname IS NULL
    OR sender_nickname ~ '^[A-Za-z0-9_ -]{3,24}$'
  );

-- 7d. team_assignment: drop profile_id, add nickname
ALTER TABLE public.team_assignment
  DROP CONSTRAINT IF EXISTS team_assignment_profile_id_fkey;

DROP INDEX IF EXISTS public.team_assignment_event_profile_unique;

ALTER TABLE public.team_assignment
  DROP COLUMN IF EXISTS profile_id;

ALTER TABLE public.team_assignment
  ADD COLUMN IF NOT EXISTS nickname text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.team_assignment
  ALTER COLUMN nickname DROP DEFAULT;

ALTER TABLE public.team_assignment
  DROP CONSTRAINT IF EXISTS team_assignment_nickname_format;
ALTER TABLE public.team_assignment
  ADD CONSTRAINT team_assignment_nickname_format
  CHECK (nickname ~ '^[A-Za-z0-9_ -]{3,24}$');

CREATE UNIQUE INDEX IF NOT EXISTS team_assignment_event_nickname_unique
  ON public.team_assignment (event_id, nickname);

-- 7e. match_result: drop submitted_by, mvp_profile_id, mvp_finalized_at
ALTER TABLE public.match_result
  DROP CONSTRAINT IF EXISTS match_result_submitted_by_fkey,
  DROP CONSTRAINT IF EXISTS match_result_mvp_profile_id_fkey,
  DROP COLUMN IF EXISTS submitted_by,
  DROP COLUMN IF EXISTS mvp_profile_id,
  DROP COLUMN IF EXISTS mvp_finalized_at;

ALTER TABLE public.match_result
  ADD COLUMN IF NOT EXISTS submitted_by_nickname text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.match_result
  DROP CONSTRAINT IF EXISTS match_result_submitter_nickname_format;
ALTER TABLE public.match_result
  ADD CONSTRAINT match_result_submitter_nickname_format
  CHECK (submitted_by_nickname ~ '^[A-Za-z0-9_ -]{3,24}$');

-- 7f. player_match_stat: drop profile_id + elo_delta, add nickname
ALTER TABLE public.player_match_stat
  DROP CONSTRAINT IF EXISTS player_match_stat_profile_id_fkey;

DROP INDEX IF EXISTS public.player_match_stat_event_profile_unique;
DROP INDEX IF EXISTS public.player_match_stat_profile_idx;

ALTER TABLE public.player_match_stat
  DROP COLUMN IF EXISTS profile_id,
  DROP COLUMN IF EXISTS elo_delta;

ALTER TABLE public.player_match_stat
  ADD COLUMN IF NOT EXISTS nickname text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.player_match_stat
  ALTER COLUMN nickname DROP DEFAULT;

ALTER TABLE public.player_match_stat
  DROP CONSTRAINT IF EXISTS player_match_stat_nickname_format;
ALTER TABLE public.player_match_stat
  ADD CONSTRAINT player_match_stat_nickname_format
  CHECK (nickname ~ '^[A-Za-z0-9_ -]{3,24}$');

CREATE UNIQUE INDEX IF NOT EXISTS player_match_stat_event_nickname_unique
  ON public.player_match_stat (event_id, nickname);

CREATE INDEX IF NOT EXISTS player_match_stat_nickname_idx
  ON public.player_match_stat (nickname);

-- ----------------------------------------------------------------------------
-- 8. DROP PROFILE TABLE
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.profile CASCADE;

-- ----------------------------------------------------------------------------
-- 9. NEW RLS POLICIES (minimal — public read, RPC-only writes)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS event_select_public ON public.event;
CREATE POLICY event_select_public
  ON public.event FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS chat_message_select_public ON public.chat_message;
CREATE POLICY chat_message_select_public
  ON public.chat_message FOR SELECT
  TO anon, authenticated
  USING (true);

-- The remaining tables (event_participant, team, team_assignment, match_result,
-- player_match_stat) already had public-read policies that survived; nothing
-- to add.

-- ----------------------------------------------------------------------------
-- 10. NEW RPCs — nickname-based, no auth checks
-- ----------------------------------------------------------------------------

-- helper: standard nickname trim + format check.  Returns the canonical form
-- or NULL if the nickname is invalid.  Inline in callers to keep all errors
-- localized; defined here to share the regex.
CREATE OR REPLACE FUNCTION public._validate_nickname(p_nickname text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_trimmed text;
BEGIN
  v_trimmed := trim(coalesce(p_nickname, ''));
  IF v_trimmed !~ '^[A-Za-z0-9_ -]{3,24}$' THEN
    RETURN NULL;
  END IF;
  RETURN v_trimmed;
END;
$$;

-- 10a. join_event(p_event_id, p_nickname, p_position) → jsonb
CREATE OR REPLACE FUNCTION public.join_event(
  p_event_id uuid,
  p_nickname text,
  p_position public.position
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nickname text;
  v_event public.event%ROWTYPE;
  v_count int;
  v_existing_id uuid;
  v_now timestamptz := now();
  v_participant_id uuid;
BEGIN
  v_nickname := public._validate_nickname(p_nickname);
  IF v_nickname IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_nickname', 'error', 'Geçersiz takma ad.');
  END IF;

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

  -- Idempotent on (event_id, nickname).
  SELECT id INTO v_existing_id
  FROM public.event_participant
  WHERE event_id = p_event_id
    AND nickname = v_nickname
    AND status <> 'cancelled'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object('participant_id', v_existing_id, 'already_joined', true)
    );
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.event_participant
  WHERE event_id = p_event_id AND status = 'confirmed';

  IF v_count >= v_event.capacity THEN
    UPDATE public.event SET status = 'full' WHERE id = p_event_id AND status = 'open';
    RETURN jsonb_build_object('ok', false, 'code', 'full', 'error', 'Kadro dolu.');
  END IF;

  -- Restore most recent cancelled row if it exists, else insert fresh.
  SELECT id INTO v_existing_id
  FROM public.event_participant
  WHERE event_id = p_event_id
    AND nickname = v_nickname
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
    INSERT INTO public.event_participant (event_id, nickname, position, status)
    VALUES (p_event_id, v_nickname, p_position, 'confirmed')
    RETURNING id INTO v_participant_id;
  END IF;

  IF v_count + 1 >= v_event.capacity THEN
    UPDATE public.event SET status = 'full' WHERE id = p_event_id AND status = 'open';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('participant_id', v_participant_id, 'already_joined', false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_event(uuid, text, public.position) TO anon, authenticated;

-- 10b. cancel_rsvp(p_event_id, p_nickname) → jsonb
CREATE OR REPLACE FUNCTION public.cancel_rsvp(
  p_event_id uuid,
  p_nickname text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nickname text;
  v_event public.event%ROWTYPE;
  v_participant_id uuid;
  v_count int;
  v_now timestamptz := now();
BEGIN
  v_nickname := public._validate_nickname(p_nickname);
  IF v_nickname IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_nickname', 'error', 'Geçersiz takma ad.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Etkinlik bulunamadı.');
  END IF;

  SELECT id INTO v_participant_id
  FROM public.event_participant
  WHERE event_id = p_event_id
    AND nickname = v_nickname
    AND status = 'confirmed'
  LIMIT 1;

  IF v_participant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Kayıt yok.');
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

GRANT EXECUTE ON FUNCTION public.cancel_rsvp(uuid, text) TO anon, authenticated;

-- 10c. send_message(p_event_id, p_nickname, p_content) → jsonb
CREATE OR REPLACE FUNCTION public.send_message(
  p_event_id uuid,
  p_nickname text,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nickname text;
  v_event public.event%ROWTYPE;
  v_message_id uuid;
  v_trimmed text;
BEGIN
  v_nickname := public._validate_nickname(p_nickname);
  IF v_nickname IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_nickname', 'error', 'Geçersiz takma ad.');
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
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Sohbet kilitli.');
  END IF;

  INSERT INTO public.chat_message (event_id, sender_nickname, content, kind)
  VALUES (p_event_id, v_nickname, v_trimmed, 'text')
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('message_id', v_message_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_message(uuid, text, text) TO anon, authenticated;

-- 10d. post_system_message(p_event_id, p_content) → jsonb
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
  v_event public.event%ROWTYPE;
  v_message_id uuid;
  v_trimmed text;
BEGIN
  v_trimmed := trim(coalesce(p_content, ''));
  IF char_length(v_trimmed) = 0 OR char_length(v_trimmed) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input');
  END IF;

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  INSERT INTO public.chat_message (event_id, sender_nickname, content, kind)
  VALUES (p_event_id, NULL, v_trimmed, 'system')
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('message_id', v_message_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_system_message(uuid, text) TO anon, authenticated;

-- 10e. save_teams(p_event_id, p_seed, p_assignments) → jsonb
-- p_assignments shape:
--   { "teamA": { "skillTotal": int, "members": [{nickname, position}] },
--     "teamB": { "skillTotal": int, "members": [{nickname, position}] } }
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
  v_event public.event%ROWTYPE;
  v_team_a_id uuid;
  v_team_b_id uuid;
  v_a_total int;
  v_b_total int;
  v_a_members jsonb;
  v_b_members jsonb;
  v_member jsonb;
  v_nick text;
  v_pos public.position;
  v_confirmed_count int;
  v_member_count int;
  v_nicknames text[];
  v_unknown text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_event.status NOT IN ('open', 'full', 'locked') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Etkinlik takım kurmaya uygun değil.');
  END IF;

  v_a_total := coalesce((p_assignments->'teamA'->>'skillTotal')::int, 0);
  v_b_total := coalesce((p_assignments->'teamB'->>'skillTotal')::int, 0);
  v_a_members := p_assignments->'teamA'->'members';
  v_b_members := p_assignments->'teamB'->'members';

  IF v_a_members IS NULL OR v_b_members IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Takım kadrosu eksik.');
  END IF;

  v_member_count := jsonb_array_length(v_a_members) + jsonb_array_length(v_b_members);

  SELECT count(*)::int INTO v_confirmed_count
  FROM public.event_participant
  WHERE event_id = p_event_id AND status = 'confirmed';

  IF v_member_count <> v_confirmed_count THEN
    RETURN jsonb_build_object('ok', false, 'code', 'mismatch', 'error', 'Atama sayısı kadroyla uyuşmuyor.');
  END IF;

  -- Validate every nickname is in the confirmed roster.
  v_nicknames := ARRAY[]::text[];
  FOR v_member IN SELECT * FROM jsonb_array_elements(v_a_members || v_b_members) LOOP
    v_nick := public._validate_nickname(v_member->>'nickname');
    IF v_nick IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_nickname');
    END IF;
    v_nicknames := array_append(v_nicknames, v_nick);
  END LOOP;

  -- Detect duplicates.
  IF (SELECT count(DISTINCT n) FROM unnest(v_nicknames) AS n) <> array_length(v_nicknames, 1) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate_nickname');
  END IF;

  -- Detect unknown nicknames.
  SELECT n INTO v_unknown
  FROM unnest(v_nicknames) AS n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.event_participant
    WHERE event_id = p_event_id
      AND nickname = n
      AND status = 'confirmed'
  )
  LIMIT 1;

  IF v_unknown IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unknown_nickname', 'error', v_unknown);
  END IF;

  -- DELETE existing teams + assignments, INSERT fresh.
  DELETE FROM public.team_assignment WHERE event_id = p_event_id;
  DELETE FROM public.team WHERE event_id = p_event_id;

  INSERT INTO public.team (event_id, label, seed, skill_total)
    VALUES (p_event_id, 'A', p_seed, v_a_total) RETURNING id INTO v_team_a_id;
  INSERT INTO public.team (event_id, label, seed, skill_total)
    VALUES (p_event_id, 'B', p_seed, v_b_total) RETURNING id INTO v_team_b_id;

  FOR v_member IN SELECT * FROM jsonb_array_elements(v_a_members) LOOP
    v_nick := trim(v_member->>'nickname');
    v_pos := (v_member->>'position')::public.position;
    INSERT INTO public.team_assignment (team_id, event_id, nickname, position)
    VALUES (v_team_a_id, p_event_id, v_nick, v_pos);
  END LOOP;

  FOR v_member IN SELECT * FROM jsonb_array_elements(v_b_members) LOOP
    v_nick := trim(v_member->>'nickname');
    v_pos := (v_member->>'position')::public.position;
    INSERT INTO public.team_assignment (team_id, event_id, nickname, position)
    VALUES (v_team_b_id, p_event_id, v_nick, v_pos);
  END LOOP;

  UPDATE public.event SET status = 'locked' WHERE id = p_event_id;

  -- system message
  INSERT INTO public.chat_message (event_id, sender_nickname, content, kind)
  VALUES (p_event_id, NULL, 'Takımlar oluşturuldu.', 'system');

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('team_a_id', v_team_a_id, 'team_b_id', v_team_b_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_teams(uuid, integer, jsonb) TO anon, authenticated;

-- 10f. unlock_teams(p_event_id) → jsonb
CREATE OR REPLACE FUNCTION public.unlock_teams(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.event%ROWTYPE;
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_event.status <> 'locked' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Etkinlik kilitli değil.');
  END IF;

  DELETE FROM public.team_assignment WHERE event_id = p_event_id;
  DELETE FROM public.team WHERE event_id = p_event_id;

  SELECT count(*)::int INTO v_count
  FROM public.event_participant
  WHERE event_id = p_event_id AND status = 'confirmed';

  UPDATE public.event
  SET status = CASE WHEN v_count >= v_event.capacity THEN 'full'::public.event_status ELSE 'open'::public.event_status END
  WHERE id = p_event_id;

  INSERT INTO public.chat_message (event_id, sender_nickname, content, kind)
  VALUES (p_event_id, NULL, 'Takımlar açıldı.', 'system');

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_teams(uuid) TO anon, authenticated;

-- 10g. submit_score(p_event_id, p_score_a, p_score_b, p_submitter_nickname, p_notes) → jsonb
CREATE OR REPLACE FUNCTION public.submit_score(
  p_event_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_submitter_nickname text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nickname text;
  v_event public.event%ROWTYPE;
  v_match_id uuid;
  v_assignment record;
BEGIN
  v_nickname := public._validate_nickname(p_submitter_nickname);
  IF v_nickname IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_nickname');
  END IF;

  IF p_score_a < 0 OR p_score_a > 30 OR p_score_b < 0 OR p_score_b > 30 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Skor aralığı 0-30.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));

  SELECT * INTO v_event FROM public.event WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_event.status NOT IN ('locked', 'in_progress') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Skor girilemez.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.match_result WHERE event_id = p_event_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_submitted', 'error', 'Skor zaten girilmiş.');
  END IF;

  INSERT INTO public.match_result (event_id, score_a, score_b, notes, submitted_by_nickname)
  VALUES (p_event_id, p_score_a, p_score_b, nullif(trim(coalesce(p_notes, '')), ''), v_nickname)
  RETURNING id INTO v_match_id;

  -- Seed player_match_stat from team_assignment.
  FOR v_assignment IN
    SELECT ta.nickname, t.label
    FROM public.team_assignment ta
    JOIN public.team t ON t.id = ta.team_id
    WHERE ta.event_id = p_event_id
  LOOP
    INSERT INTO public.player_match_stat (event_id, nickname, team_label, attended, goals, assists)
    VALUES (p_event_id, v_assignment.nickname, v_assignment.label, true, 0, 0);
  END LOOP;

  UPDATE public.event SET status = 'completed' WHERE id = p_event_id;

  INSERT INTO public.chat_message (event_id, sender_nickname, content, kind)
  VALUES (p_event_id, NULL, format('Skor: %s - %s', p_score_a, p_score_b), 'system');

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('match_id', v_match_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_score(uuid, integer, integer, text, text) TO anon, authenticated;

-- 10h. edit_score(p_event_id, p_score_a, p_score_b, p_notes) → jsonb
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
  v_match_id uuid;
BEGIN
  IF p_score_a < 0 OR p_score_a > 30 OR p_score_b < 0 OR p_score_b > 30 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input', 'error', 'Skor aralığı 0-30.');
  END IF;

  SELECT id INTO v_match_id FROM public.match_result WHERE event_id = p_event_id;
  IF v_match_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Skor henüz yok.');
  END IF;

  UPDATE public.match_result
  SET score_a = p_score_a,
      score_b = p_score_b,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      edited_at = now()
  WHERE id = v_match_id;

  INSERT INTO public.chat_message (event_id, sender_nickname, content, kind)
  VALUES (p_event_id, NULL, format('Skor güncellendi: %s - %s', p_score_a, p_score_b), 'system');

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('match_id', v_match_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_score(uuid, integer, integer, text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 11. REALTIME PUBLICATION
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.notification;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.mvp_vote;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- chat_message, event_participant, event, team, team_assignment, match_result
-- remain in the publication; reshape preserved their rowfilter.
