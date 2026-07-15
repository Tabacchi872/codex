export function logSuperadminNavPress(source: string, target: string) {
  if (__DEV__) {
    console.log('SUPERADMIN_NAV_PRESS', { source, target });
  }
}
