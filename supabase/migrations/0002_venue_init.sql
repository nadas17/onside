-- =============================================================================
-- 0002_venue_init.sql — Phase 2
--
-- venue tablosu (spec §5) + PostGIS spatial index (Phase 3 event feed için
-- ST_DWithin sorguları gerekir) + RLS (sadece SELECT public; INSERT/UPDATE
-- sadece migration / admin SQL ile).
-- =============================================================================

-- 1. PostGIS extension (Supabase'de built-in)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. VENUE tablosu
CREATE TABLE public.venue (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  address_line           text NOT NULL,
  city                   text NOT NULL,
  country_code           text NOT NULL,
  lat                    double precision NOT NULL,
  lng                    double precision NOT NULL,
  -- Generated-stored geography for fast spatial queries (ST_DWithin, KNN)
  location               geography(POINT, 4326)
                         GENERATED ALWAYS AS
                         (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography)
                         STORED,
  surface                text NOT NULL DEFAULT 'artificial',
  has_floodlights        boolean NOT NULL DEFAULT true,
  is_covered             boolean NOT NULL DEFAULT false,
  approx_price_per_hour  integer,
  external_url           text,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_country_code_iso CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT venue_lat_range CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT venue_lng_range CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT venue_surface_valid CHECK (surface IN ('artificial', 'grass', 'indoor'))
);

-- 3. Indexes
CREATE INDEX venue_location_gist ON public.venue USING GIST (location);
CREATE INDEX venue_city_idx ON public.venue (city);
CREATE INDEX venue_active_idx ON public.venue (is_active);

-- 4. RLS
ALTER TABLE public.venue ENABLE ROW LEVEL SECURITY;

-- SELECT: tüm aktif sahalar herkese görünür.
CREATE POLICY venue_select_active
ON public.venue
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- INSERT/UPDATE/DELETE: sadece service_role (migration / admin SQL).
-- Kullanıcı UI'dan venue ekleyemez (spec §1: "saha rezervasyonu / sahibi paneli yok").
-- Bu nedenle INSERT/UPDATE/DELETE policy'si eklenmez → RLS reddeder.
