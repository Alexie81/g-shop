import type { AppUpdateInfo } from '../types';

export function canOfferNativeUpdate(platform: string, info: AppUpdateInfo | null, newerBuild: boolean) {
  if (platform !== 'android' || !info || !newerBuild || !(Number(info.latestBuildNumber) > 0)) return false;
  try {
    const url = new URL(info.downloadUrl.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

type OtaCandidate = { available: boolean; version: string | null };
type UpdateCheckDependencies = {
  getPublished: () => Promise<AppUpdateInfo>;
  nativeAvailable: (info: AppUpdateInfo) => boolean;
  pendingOta: () => OtaCandidate;
  otaEnabled: boolean;
  checkOta: () => Promise<OtaCandidate>;
  fetchOta: () => Promise<unknown>;
};

export async function findAvailableUpdate(dependencies: UpdateCheckDependencies) {
  const published = await dependencies.getPublished().catch(() => null);
  if (published && dependencies.nativeAvailable(published)) {
    return { kind: 'native' as const, published, otaVersion: null };
  }
  const pending = dependencies.pendingOta();
  if (dependencies.otaEnabled && pending.available) {
    return { kind: 'ota' as const, published, otaVersion: pending.version };
  }
  if (!dependencies.otaEnabled) return null;
  try {
    const candidate = await dependencies.checkOta();
    if (!candidate.available) return null;
    await dependencies.fetchOta();
    return { kind: 'ota' as const, published, otaVersion: candidate.version };
  } catch {
    return null;
  }
}

type SchedulerOptions = {
  minimumIntervalMs?: number;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clear?: (timer: ReturnType<typeof setTimeout>) => void;
};

// A foreground request inside the cooldown is deferred, rather than lost.
// Pending OTA changes do not own or cancel this scheduler's startup timer.
export function createUpdateCheckScheduler(check: () => Promise<void>, options: SchedulerOptions = {}) {
  const interval = options.minimumIntervalMs ?? 60_000;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? setTimeout;
  const clear = options.clear ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastStartedAt: number | null = null;
  let inFlight = false;
  let requestedWhileChecking = false;
  let disposed = false;

  const cancelScheduled = () => {
    if (timer !== null) clear(timer);
    timer = null;
    requestedWhileChecking = false;
  };

  const request = (delay = 0) => {
    if (disposed || timer !== null) return;
    if (inFlight) { requestedWhileChecking = true; return; }
    const cooldown = lastStartedAt === null ? 0 : Math.min(interval, Math.max(0, interval - (now() - lastStartedAt)));
    timer = schedule(() => {
      timer = null;
      if (disposed) return;
      lastStartedAt = now();
      inFlight = true;
      void Promise.resolve().then(check).catch(() => undefined).finally(() => {
        inFlight = false;
        if (requestedWhileChecking) { requestedWhileChecking = false; request(); }
      });
    }, Math.max(delay, cooldown));
  };

  return {
    request,
    cancelScheduled,
    dispose: () => { disposed = true; cancelScheduled(); },
  };
}
