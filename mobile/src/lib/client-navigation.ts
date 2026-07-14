export function logClientNavPress(source: string, target: string) {
  if (__DEV__) {
    console.log('CLIENT_NAV_PRESS', { source, target });
  }
}
