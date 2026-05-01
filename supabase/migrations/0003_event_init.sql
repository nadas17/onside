-- =============================================================================
-- 0003_event_init.sql — Phase 3
--
-- event tablosu (spec §5) + state machine constraint'leri + indexler + RLS
-- (spec §6). Lifecycle status değişimi server action'da yapılır
-- (lib/event/state.ts) — DB sadece illegal değer kabul etmeyecek seviyede check'ler.
-- =============================================================================

-- 1. ENUM'LAR
CREATE TYPE public.event_status AS ENUM (
  'draft',
  'open',
  'full',
  'locked',
  'in_progress',
  'completed',
  'cancelled'
);
CREATE TYPE public.format AS ENUM ('5v5', '6v6', '7v7', '8v8', '11v11');
CREATE TYPE public.sport AS ENUM ('football');

-- 2. EVENT tablosu
CREATE TABLE public.event (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id             uuid NOT NULL
                           REFERENCES public.profile(id) ON DELETE RESTRICT,
  venue_id                 uuid NOT NULL
                           REFERENCES public.venue(id) ON DELETE RESTRICT,
  title                    text NOT NULL,
  description              text,
  sport                    public.sport NOT NULL DEFAULT 'football',
  format                   public.format NOT NULL,
  min_skill_level          public.skill_level NOT NULL DEFAULT 'beginner',
  max_skill_level          public.skill_level NOT NULL DEFAULT 'pro',
  start_at                 timestamptz NOT NULL,
  end_at                   timestamptz NOT NULL,
  capacity                 integer NOT NULL,
  min_players_to_confirm   integer NOT NULL,
  status                   public.event_status NOT NULL DEFAULT 'open',
  is_recurring             boolean NOT NULL DEFAULT false,
  parent_event_id          uuid,
  is_hidden                boolean NOT NULL DEFAULT false,
  cancelled_reason         text,
  cancelled_at             timestamptz,
  notes                    text,
  chat_locked              boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_time_range CHECK (start_at < end_at),
  CONSTRAINT event_capacity_range CHECK (capacity BETWEEN 4 AND 30),
  CONSTRAINT event_min_players_le_capacity CHECK (min_players_to_confirm <= capacity),
  CONSTRAINT event_min_players_positive CHECK (min_players_to_confirm >= 2),
  CONSTRAINT event_skill_range CHECK (min_skill_level <= max_skill_level),
  CONSTRAINT event_title_length CHECK (char_length(title) BETWEEN 3 AND 80),
  CONSTRAINT event_description_length CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT event_notes_length CHECK (notes IS NULL OR char_length(notes) <= 500),
  CONSTRAINT event_cancelled_consistency CHECK (
    (status = 'cancelled') = (cancelled_at IS NOT NULL)
  )
);

-- 3. INDEXES
CREATE INDEX event_status_start_idx ON public.event (status, start_at);
CREATE INDEX event_start_idx ON public.event (start_at);
CREATE INDEX event_venue_idx ON public.event (venue_id);
CREATE INDEX event_organizer_idx ON public.event (organizer_id);

-- 4. updated_at trigger (set_updated_at function 0001'de tanımlı)
CREATE TRIGGER event_set_updated_at
BEFORE UPDATE ON public.event
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. RLS (spec §6 event satırı)
ALTER TABLE public.event ENABLE ROW LEVEL SECURITY;

-- SELECT: gizli olmayan herkese; gizli olsa da kendi etkinliği organizer'a görünür.
CREATE POLICY event_select_public_or_organizer
ON public.event
FOR SELECT
TO anon, authenticated
USING (is_hidden = false OR organizer_id = auth.uid());

-- INSERT: aktif kullanıcı, kendi adına organizer olarak.
CREATE POLICY event_insert_self_organizer
ON public.event
FOR INSERT
TO authenticated
WITH CHECK (organizer_id = auth.uid() AND public.auth_user_active());

-- UPDATE: sadece organizer.
-- (Cancel akışı da UPDATE — status='cancelled' yapılır.)
CREATE POLICY event_update_organizer
ON public.event
FOR UPDATE
TO authenticated
USING (organizer_id = auth.uid())
WITH CHECK (organizer_id = auth.uid() AND public.auth_user_active());

-- DELETE policy YOK — spec §6: hard delete yok, status='cancelled' yapılır.
