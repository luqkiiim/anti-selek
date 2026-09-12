/** Swipe-only settings. Tab taps keep the browser's native smooth scrolling. */
export const swipeSettings = {
  settleDurationMs: 220, // Lower = faster animation after releasing your finger.
  distanceThreshold: 0.25, // Fraction of page width needed for a slow swipe (0.25 = 25%).
  flickVelocityPxPerMs: 0.45, // Lower = a slower flick can change pages.
  flickMinDistancePx: 24, // Minimum travel before a flick can change pages.
  directionLockPx: 8, // Movement needed to distinguish a swipe from a tap.
  flickMaxAgeMs: 100, // Ignore flick velocity after holding still this long.
} as const;
