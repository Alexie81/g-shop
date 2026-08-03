import { useAuth } from '@/contexts/AuthContext';
import { appUpdateRepository } from '@/repositories/api-repositories';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';

function compareVersions(installed: string, available: string) {
  const left = installed.split('.').map((value) => Number(value) || 0);
  const right = available.split('.').map((value) => Number(value) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function AppUpdateCoordinator() {
  const { ready, session } = useAuth();
  const checked = useRef(false);

  useEffect(() => {
    if (!ready || !session || checked.current || Platform.OS === 'web') return;
    checked.current = true;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const installedVersion = Constants.expoConfig?.version ?? '1.0.0';
          const published = await appUpdateRepository.get();
          const nativeUpdateAvailable = compareVersions(installedVersion, published.latestVersion) < 0;
          let otaUpdateAvailable = false;

          if (Updates.isEnabled && Constants.executionEnvironment !== 'storeClient') {
            try {
              otaUpdateAvailable = (await Updates.checkForUpdateAsync()).isAvailable;
            } catch {
              // The native version check remains available if the OTA service is temporarily offline.
            }
          }

          if (!nativeUpdateAvailable && !otaUpdateAvailable) return;

          const versionCopy = nativeUpdateAvailable
            ? `Versiunea ${published.latestVersion} este disponibilă pentru G-Shop.`
            : 'Este disponibilă o actualizare nouă pentru G-Shop.';
          Alert.alert(
            'Actualizare disponibilă',
            `${versionCopy}\n\nActualizează aplicația pentru a primi cele mai noi funcții și corecții.`,
            [
              { text: 'Mai târziu', style: 'cancel' },
              { text: 'Actualizează', onPress: () => router.push('/app-update') },
            ],
          );
        } catch {
          // Startup must never be blocked when the update endpoint cannot be reached.
        }
      })();
    }, 1200);

    return () => clearTimeout(timer);
  }, [ready, session]);

  return null;
}
