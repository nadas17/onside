/**
 * Phase 2 venue seed (Gdańsk gerçek halı sahalar).
 *
 * Kullanım:
 *   node --env-file=.env.local scripts/seed-venues.mjs
 *
 * Idempotent: önce mevcut tüm venue'ları temizler, sonra insert eder.
 * (Phase 2'de venue'lara bağlı tablo yok; Phase 3+'da event.venue_id varken
 *  truncate'i UPSERT'e çevirmek gerekir.)
 *
 * Veri kaynakları (her satır URL): docs/decisions/0003-venue-seed.md (referans).
 */

import postgres from "postgres";

const VENUES = [
  // --- Gdańsk ---
  {
    name: "Football Arena Gdańsk",
    addressLine: "ul. Meissnera 6",
    city: "Gdańsk",
    lat: 54.40104,
    lng: 18.60541,
    surface: "indoor",
    hasFloodlights: true,
    isCovered: true,
    approxPricePerHour: 250,
    externalUrl: "https://www.footballarena.com.pl/gdansk/",
  },
  {
    name: "Olimpijski FC Gdańsk",
    addressLine: "ul. Meissnera 5",
    city: "Gdańsk",
    lat: 54.40159,
    lng: 18.60206,
    surface: "indoor",
    hasFloodlights: true,
    isCovered: true,
    approxPricePerHour: 260,
    externalUrl: "https://olimpijskifc.pl/gdansk-2/",
  },
  {
    name: "Kompleks Sportowy Traugutta 29",
    addressLine: "ul. Traugutta 29",
    city: "Gdańsk",
    lat: 54.36854,
    lng: 18.6243,
    surface: "artificial",
    hasFloodlights: true,
    isCovered: false,
    approxPricePerHour: 180,
    externalUrl:
      "https://sportgdansk.pl/obiekty/kompleks-sportowy-ul-traugutta-29/",
  },
  {
    name: "KS Gedania 1922",
    addressLine: "al. gen. Józefa Hallera 16/18",
    city: "Gdańsk",
    lat: 54.38009,
    lng: 18.62128,
    surface: "artificial",
    hasFloodlights: true,
    isCovered: false,
    approxPricePerHour: 200,
    externalUrl: "https://gedania1922.pl/wynajem/",
  },
  {
    name: "KS Jaguar Gdańsk",
    addressLine: "ul. Budowlanych 49",
    city: "Gdańsk",
    lat: 54.3623,
    lng: 18.47368,
    surface: "artificial",
    hasFloodlights: true,
    isCovered: true,
    approxPricePerHour: 220,
    externalUrl: "https://jaguargdansk.pl/klub/wynajem-boisk/",
  },
  {
    name: "Sport Park Przymorze",
    addressLine: "ul. Lecha Kaczyńskiego 13",
    city: "Gdańsk",
    lat: 54.4148,
    lng: 18.5987,
    surface: "artificial",
    hasFloodlights: true,
    isCovered: true,
    approxPricePerHour: 240,
    externalUrl: "https://www.sportpark.com.pl/",
  },
  {
    name: "Orlik ZSSiMS Subisława",
    addressLine: "ul. Subisława 22",
    city: "Gdańsk",
    lat: 54.41938,
    lng: 18.5732,
    surface: "artificial",
    hasFloodlights: true,
    isCovered: false,
    approxPricePerHour: 0,
    externalUrl: null,
  },
  {
    name: "Orlik Kołobrzeska",
    addressLine: "ul. Kołobrzeska 77",
    city: "Gdańsk",
    lat: 54.40682,
    lng: 18.60347,
    surface: "artificial",
    hasFloodlights: true,
    isCovered: false,
    approxPricePerHour: 0,
    externalUrl: null,
  },
  {
    name: "Orlik Niedźwiednik",
    addressLine: "ul. Niedźwiednik 44",
    city: "Gdańsk",
    lat: 54.37716,
    lng: 18.55918,
    surface: "artificial",
    hasFloodlights: true,
    isCovered: false,
    approxPricePerHour: 50,
    externalUrl: null,
  },
  {
    name: "Boisko ZSM Oliwska",
    addressLine: "ul. Oliwska 53/55",
    city: "Gdańsk",
    lat: 54.4021,
    lng: 18.66931,
    surface: "artificial",
    hasFloodlights: true,
    isCovered: false,
    approxPricePerHour: 150,
    externalUrl: null,
  },
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL boş");
  process.exit(1);
}

const sql = postgres(url, { max: 1, ssl: "require", prepare: false });

try {
  const before = await sql`SELECT count(*)::int AS n FROM public.venue`;
  console.log(`▸ Mevcut venue: ${before[0].n}`);

  console.log("▸ Tablo temizleniyor (Phase 2 idempotent seed)…");
  await sql`TRUNCATE TABLE public.venue RESTART IDENTITY`;

  console.log(`▸ ${VENUES.length} venue insert ediliyor…`);
  for (const v of VENUES) {
    await sql`
      INSERT INTO public.venue (
        name, address_line, city, country_code, lat, lng,
        surface, has_floodlights, is_covered,
        approx_price_per_hour, external_url, is_active
      ) VALUES (
        ${v.name}, ${v.addressLine}, ${v.city}, 'PL', ${v.lat}, ${v.lng},
        ${v.surface}, ${v.hasFloodlights}, ${v.isCovered},
        ${v.approxPricePerHour}, ${v.externalUrl}, true
      )
    `;
  }

  const after = await sql`
    SELECT
      city,
      count(*)::int AS n,
      count(*) FILTER (WHERE has_floodlights) AS with_lights,
      count(*) FILTER (WHERE is_covered) AS covered
    FROM public.venue
    GROUP BY city
    ORDER BY city
  `;
  console.log("✓ Seed tamamlandı:");
  for (const row of after) {
    console.log(
      `  ${row.city}: ${row.n} saha (aydınlatma ${row.with_lights}, kapalı ${row.covered})`,
    );
  }

  // PostGIS location kolonu doğru hesaplanmış mı?
  const spatialCheck = await sql`
    SELECT count(*)::int AS n FROM public.venue WHERE location IS NOT NULL
  `;
  console.log(`✓ PostGIS location kolonu: ${spatialCheck[0].n} satırda mevcut`);
} catch (err) {
  console.error("✗ Hata:", err.message);
  if (err.code) console.error(`  PG code: ${err.code}`);
  process.exit(1);
} finally {
  await sql.end();
}
