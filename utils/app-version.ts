import Constants from 'expo-constants';

export function releaseVersion() {
  const configured = Constants.expoConfig?.extra?.releaseVersion;
  return typeof configured === 'string' && configured.trim() ? configured.trim() : Constants.expoConfig?.version ?? '1.0.0';
}

export function nativeVersion() {
  return Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '1.0.0';
}

export function compareVersions(a: string, b: string) {
  const left = a.split('.').map((value) => Number(value) || 0);
  const right = b.split('.').map((value) => Number(value) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
