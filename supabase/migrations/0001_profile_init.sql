-- =============================================================================
-- 0001_profile_init.sql — Phase 1
--
-- Bu migration'ı Supabase Cloud SQL Editor'a paste edip çalıştır VEYA
-- `psql $DATABASE_URL -f supabase/migrations/0001_profile_init.sql`
--
-- İçerik:
--   1. position, skill_level enum'ları
--   2. profile tablosu (spec §5) + check constraint'ler + auth.users FK
--   3. updated_at otomatik güncelleme trigger'ı
--   4. auth_user_active() helper (banned + auth check)
--   5. RLS politikaları (spec §6 profile satırı, ADR-0002 uyumlu)
-- =============================================================================

-- 1. ENUM'LAR ------------------------------------------------------------------
CREATE TYPE public.position AS ENUM ('GK', 'DEF', 'MID', 'FWD');
CREATE TYPE public.skill_level AS ENUM ('beginner', 'intermediate', 'advanced', 'pro');

-- 2. PROFILE TABLOSU ----------------------------------------------------------
CREATE TABLE public.profile (
  id                  uuid PRIMARY KEY,
  username            text NOT NULL UNIQUE,
  display_name        text NOT NULL,
  avatar_url          text,
  bio                 text,
  preferred_position  public.position,
  secondary_position  public.position,
  skill_level         public.skill_level NOT NULL DEFAULT 'intermediate',
  skill_rating        integer NOT NULL DEFAULT 1000,
  matches_played      integer NOT NULL DEFAULT 0,
  matches_won         integer NOT NULL DEFAULT 0,
  goals_scored        integer NOT NULL DEFAULT 0,
  mvp_count           integer NOT NULL DEFAULT 0,
  home_city           text,
  home_lat            double precision,
  home_lng            double precision,
  locale              text NOT NULL DEFAULT 'tr',
  no_show_count       integer NOT NULL DEFAULT 0,
  is_banned           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_username_format CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT profile_locale_valid CHECK (locale IN ('tr', 'en', 'pl')),
  CONSTRAINT profile_id_fk FOREIGN KEY (id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 3. UPDATED_AT TRIGGER -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_set_updated_at
BEFORE UPDATE ON public.profile
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. HELPER: AUTH_USER_ACTIVE -------------------------------------------------
-- Recursion riski yok: SECURITY DEFINER, RLS bypass; auth.uid() set + banned değil.
CREATE OR REPLACE FUNCTION public.auth_user_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.profile
      WHERE id = auth.uid() AND is_banned
    );
$$;

GRANT EXECUTE ON FUNCTION public.auth_user_active() TO anon, authenticated;

-- 5. RLS ----------------------------------------------------------------------
ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;

-- SELECT: tüm profile public okunabilir.
-- Hassas alanlar (home_lat, home_lng, no_show_count) UI'da gizlenir; istenirse
-- bunlar için ayrı tablo veya column-level RLS Phase 9'da değerlendirilebilir.
CREATE POLICY profile_select_public
ON public.profile
FOR SELECT
TO anon, authenticated
USING (true);

-- INSERT: anonymous + authenticated user kendi profilini oluşturabilir.
-- (Anonymous user da Supabase'de 'authenticated' role kullanır.)
CREATE POLICY profile_insert_self
ON public.profile
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id AND public.auth_user_active());

-- UPDATE: kendi profilini, banned değilse.
CREATE POLICY profile_update_self
ON public.profile
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND public.auth_user_active());

-- DELETE: yok (spec §6 — hard delete yok; banned + scrub flow Phase 9'da).
