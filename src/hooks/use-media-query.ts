"use client";

import * as React from "react";

/**
 * SSR-safe media query hook.
 *
 * Returns `false` until the client mounts to avoid hydration mismatches.
 * Mobile-first: assume mobile during SSR, then upgrade to desktop on mount
 * if the viewport matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();

    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Safari < 14 fallback
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}

/** Tailwind `md` breakpoint (≥ 768px) — desktop / tablet landscape. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
