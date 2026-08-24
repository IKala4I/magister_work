/**
 * Radius tokens — File 02 §3.1: "large rounded radii (16–20 px)". Assignments within the
 * band are [INFERRED]; nothing ships below 16 except fully-round pills.
 */
export const radii = {
  card: 16,
  sheet: 20,
  pill: 999,
} as const;

export const RADII_BAND = { min: 16, max: 20 } as const;
