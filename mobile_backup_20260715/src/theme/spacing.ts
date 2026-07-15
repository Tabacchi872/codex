// Scala 4px, identica (stesse chiavi 1-10) a quella di docs/fitcoach-mockup.jsx
// (`const S = {...}`), per poter tradurre gli spacing del mockup 1:1 senza
// ricalcolarli ogni volta.
export const AppSpacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 40,
  10: 48,
} as const;

export type AppSpacingKey = keyof typeof AppSpacing;
