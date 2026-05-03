"use client";

import { useReducedMotion, type Transition, type Variants } from "motion/react";

/**
 * Motion design system — shared spring presets, durations, and a11y helper.
 *
 * Principles (Sarah Drasner / Emil Kowalski / Rauno Freiberg):
 *  - Motion explains state changes, never decorates.
 *  - 120-300ms is the sweet spot; anything longer feels sluggish on touch devices.
 *  - `prefers-reduced-motion` is opt-out, not opt-in.
 *  - Springs feel tactile; tweens feel mechanical. Default to spring for state,
 *    tween for fades.
 */

export const SPRING = {
  /** Default UI spring — buttons, modals, list items. */
  default: { type: "spring", stiffness: 360, damping: 30, mass: 0.8 },
  /** Soft spring — sheets, drawers, larger surfaces. */
  soft: { type: "spring", stiffness: 220, damping: 28, mass: 1 },
  /** Snappy spring — micro-interactions, toasts, chips. */
  snappy: { type: "spring", stiffness: 520, damping: 36, mass: 0.6 },
} satisfies Record<string, Transition>;

export const DURATION = {
  fast: 0.15,
  base: 0.22,
  slow: 0.35,
} as const;

export const EASE = {
  /** Material standard — most UI transitions. */
  standard: [0.4, 0, 0.2, 1] as const,
  /** Decelerate — entering elements. */
  decel: [0, 0, 0.2, 1] as const,
  /** Accelerate — exiting elements. */
  accel: [0.4, 0, 1, 1] as const,
};

/**
 * Common variants for AnimatePresence wrappers.
 * Pair with `<motion.div variants={fadeSlide} initial="initial" animate="animate" exit="exit" />`.
 */
export const fadeSlide: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

export const slideRight: Variants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
};

/**
 * Hook returning motion config that automatically degrades when the user
 * prefers reduced motion. Use this everywhere; never hardcode transitions.
 *
 * @example
 *   const m = useMotionPreset();
 *   <motion.div transition={m.spring} {...}>
 */
export function useMotionPreset() {
  const reduced = useReducedMotion();
  return {
    reduced: !!reduced,
    spring: reduced ? { duration: 0 } : SPRING.default,
    softSpring: reduced ? { duration: 0 } : SPRING.soft,
    snappySpring: reduced ? { duration: 0 } : SPRING.snappy,
    fade: reduced
      ? { duration: 0 }
      : { duration: DURATION.base, ease: EASE.standard },
    fast: reduced ? { duration: 0 } : { duration: DURATION.fast },
  };
}
