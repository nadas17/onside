/**
 * Geo helpers — Phase 2.
 *
 * - Haversine distance (kilometers) — server-side filtreleme veya client-side sorting için.
 * - Gdańsk şehir merkezi ve default zoom seviyesi.
 *   (Warsaw 0018 migration ile projeden çıkarıldı.)
 */

export type LatLng = { lat: number; lng: number };

export const CITY_CENTERS = {
  Gdańsk: { lat: 54.352, lng: 18.6466, zoom: 11 },
} as const;

export type CityName = keyof typeof CITY_CENTERS;

export const SUPPORTED_CITIES: CityName[] = ["Gdańsk"];

export const DEFAULT_CITY: CityName = "Gdańsk";

/**
 * Haversine — iki nokta arası kilometre cinsinden büyük çember mesafesi.
 * Earth radius 6371 km.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Verilen noktaya en yakın desteklenen şehri bul (mesafe-bazlı).
 * Geolocation reddedilirse veya verisiz ise default Gdańsk.
 */
export function nearestCity(point: LatLng): CityName {
  let best: CityName = DEFAULT_CITY;
  let bestDist = Infinity;
  for (const city of SUPPORTED_CITIES) {
    const center = CITY_CENTERS[city];
    const d = haversineKm(point, center);
    if (d < bestDist) {
      bestDist = d;
      best = city;
    }
  }
  return best;
}
