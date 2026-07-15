export function logCoachNavPress(source: string, target: string) {
  if (__DEV__) {
    console.log('COACH_NAV_PRESS', { source, target });
  }
}
