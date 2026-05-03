import Image from "next/image";

/**
 * Per-page atmospheric background photo.
 *
 * Renders a fixed full-viewport `<Image>` behind everything (-z-10) with a
 * gradient scrim tuned for legibility:
 *   - Top scrim — softens the sticky header against bright photos
 *   - Bottom scrim — anchors the bottom nav / sticky CTAs
 *   - Mid darken  — flat ~25% so glass cards keep their tint
 *
 * Photos are paired thematically with each route (see `BG_MAP`). The image
 * is rendered with `priority` since it's the LCP for image-heavy routes;
 * Next/Image handles AVIF/WebP + responsive `sizes`.
 */

const BG_MAP = {
  /** Top-down lit pitch — mirrors the Onside logo */
  home: "/bg/izuddin-helmi-adnan-K5ChxJaheKI-unsplash.jpg",
  /** Floodlit night match, players in motion — feed energy */
  events: "/bg/abigail-keenan-8-s5QuUBtyM-unsplash.jpg",
  /** Floodlight tower in rain — atmospheric, intimate match-time */
  eventDetail: "/bg/daniel-van-den-berg-29Jx9qyTW14-unsplash.jpg",
  /** Sunset/dusk empty pitch — pre-match anticipation, golden hour */
  eventNew: "/bg/bhaskar-chowdhury-rejtjjsUWW4-unsplash.jpg",
  /** Foggy empty pitch with goal post — venue catalog */
  venues: "/bg/alberto-frias-5jU39pgAAiw-unsplash.jpg",
  /** Two players' boots + ball on grass — venue detail, on-pitch feel */
  venueDetail: "/bg/hal-gatewood-AzDHa9F9uBY-unsplash.jpg",
  /** Close-up boot on ball — player identity */
  profile: "/bg/connor-coyne-OgqWLzWRSaI-unsplash.jpg",
} as const;

export type BgVariant = keyof typeof BG_MAP;

interface PageBackgroundProps {
  variant: BgVariant;
  /** Vertical alignment of the photo. Default: center. */
  position?: "center" | "top" | "bottom";
  /** Push photo prominence (subtle) or anchor toward darker (heavy). */
  intensity?: "subtle" | "balanced" | "heavy";
  /**
   * `cover` (default) — fill the viewport, cropping as needed.
   * `contain` — show the entire photo without cropping (letterboxes appear).
   */
  fit?: "cover" | "contain";
}

const POSITION_CLASS = {
  center: "object-center",
  top: "object-top",
  bottom: "object-bottom",
} as const;

const SCRIM_BG_OPACITY = {
  subtle: "bg-background/15",
  balanced: "bg-background/25",
  heavy: "bg-background/45",
} as const;

export function PageBackground({
  variant,
  position = "center",
  intensity = "balanced",
  fit = "cover",
}: PageBackgroundProps) {
  const src = BG_MAP[variant];
  return (
    <div
      aria-hidden
      className="bg-background pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <Image
        src={src}
        alt=""
        fill
        priority
        // Tell the browser to pick the right candidate from Next/Image's
        // generated srcset. Without this, the largest source (1920w+) is
        // fetched everywhere — wasteful on mobile/tablet (3-5x larger payload).
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 100vw"
        // Default Next quality is 75; 65 trades imperceptible JPEG noise
        // (heavily darkened by the scrim layers anyway) for ~25% smaller bytes.
        quality={65}
        className={`${fit === "contain" ? "object-contain" : "object-cover"} ${POSITION_CLASS[position]}`}
      />
      {/* Top scrim — softens header chrome against bright photos */}
      <div className="from-background/70 absolute inset-x-0 top-0 h-40 bg-gradient-to-b to-transparent" />
      {/* Bottom scrim — for mobile bottom nav / sticky CTAs */}
      <div className="from-background/70 absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t to-transparent" />
      {/* Mid darken — keeps glass cards reading on bright photos */}
      <div className={`absolute inset-0 ${SCRIM_BG_OPACITY[intensity]}`} />
    </div>
  );
}
