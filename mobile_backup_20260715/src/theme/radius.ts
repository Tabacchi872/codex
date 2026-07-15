// Scala raggi ricavata da docs/fitcoach-mockup.jsx (icon button = S[3]=12,
// card = S[5]=20, bottone CTA = S[3]+2=14, chip/tab = pill).
export const AppRadius = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 18,
  xxl: 20,
  pill: 999,
} as const;

export type AppRadiusKey = keyof typeof AppRadius;
