"use client";

import * as React from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type LngLatLike,
} from "maplibre-gl";

export type MapPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  href?: string;
  color?: string;
};

export type MapViewProps = {
  center: { lat: number; lng: number };
  zoom?: number;
  pins?: MapPin[];
  userLocation?: { lat: number; lng: number } | null;
  onPinClick?: (pin: MapPin) => void;
  className?: string;
};

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export function MapView({
  center,
  zoom = 11,
  pins = [],
  userLocation,
  onPinClick,
  className,
}: MapViewProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<MapLibreMap | null>(null);
  const markersRef = React.useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = React.useRef<maplibregl.Marker | null>(null);
  const onPinClickRef = React.useRef(onPinClick);

  // Latest callback'i ref'te tut, map re-init'i tetiklemesin.
  React.useEffect(() => {
    onPinClickRef.current = onPinClick;
  }, [onPinClick]);

  // Map oluştur (bir kez)
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [center.lng, center.lat] as LngLatLike,
      zoom,
      attributionControl: { compact: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Map'i tek seferde kur; center/zoom değişimi flyTo ile aşağıdaki effect halledecek.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Center / zoom değişimi
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [center.lng, center.lat],
      zoom,
      essential: true,
      duration: 600,
    });
  }, [center.lat, center.lng, zoom]);

  // Pin'leri sync'le
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    pins.forEach((pin, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", pin.name);
      el.className =
        "pin-pop-in flex size-7 items-center justify-center rounded-full border-2 border-white shadow-md transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 motion-reduce:!animate-none";
      // Stagger entry up to 8 pins so a dense feed feels deliberate, not chaotic.
      const delay = Math.min(i, 8) * 32;
      el.style.animationDelay = `${delay}ms`;
      el.style.backgroundColor = pin.color ?? "#059669";
      el.style.cursor = "pointer";
      // Top-down futbol sahası ikonu (logo'nun marker boyutuna uyarlanmışı).
      el.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5"/><line x1="12" y1="5" x2="12" y2="19"/><circle cx="12" cy="12" r="2"/></svg>';
      // MapLibre map canvas'ı mousedown/touchstart'ı yakalayıp pan başlatıyor;
      // marker üzerindeyken bu event'leri durdur, click tetiklensin.
      el.addEventListener("mousedown", (e) => e.stopPropagation());
      el.addEventListener("touchstart", (e) => e.stopPropagation(), {
        passive: true,
      });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onPinClickRef.current?.(pin);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [pins]);

  // Kullanıcı konumu marker'ı
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className =
        "size-4 rounded-full border-2 border-white bg-blue-500 shadow-md ring-4 ring-blue-500/30";
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [userLocation]);

  return (
    <div
      ref={containerRef}
      className={
        className ??
        "border-border h-full w-full overflow-hidden rounded-lg border"
      }
      role="application"
      aria-label="Harita"
    />
  );
}
