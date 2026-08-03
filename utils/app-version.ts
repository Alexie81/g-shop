import Constants from 'expo-constants';
import * as Application from 'expo-application';

export function releaseVersion() {
  const configured = Constants.expoConfig?.extra?.releaseVersion;
  return typeof configured === 'string' && configured.trim() ? configured.trim() : Constants.expoConfig?.version ?? '1.0.0';
}

export function nativeVersion() {
  return Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '1.0.0';
}

export function nativeBuildNumber() {
  const candidates = [Application.nativeBuildVersion, Constants.platform?.android?.versionCode];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export function isNativeUpdateAvailable(latestBuildNumber: number | undefined, latestVersion: string) {
  const latestBuild = Number(latestBuildNumber) || 0;
  if (latestBuild <= 0) return false;
  const installedBuild = nativeBuildNumber();
  if (installedBuild > 0) return latestBuild > installedBuild;
  return compareVersions(latestVersion, releaseVersion()) > 0;
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
