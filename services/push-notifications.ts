import { serviceSheetRepository } from '@/repositories/api-repositories';
import { apiRequest } from '@/services/api';
import { preferenceStorage } from '@/services/storage';
import { ServiceDocumentRegisterRow } from '@/types';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const SERVICE_REMINDERS_CHANNEL = 'service-reminders';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

function projectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export async function registerPushDevice(propertyId: string) {
  if (Platform.OS === 'web' || !Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(SERVICE_REMINDERS_CHANNEL, {
      name: 'Documente service',
      description: 'Avertizări pentru documente lipsă și acțiuni importante din service.',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#075CFF',
      sound: 'default',
      showBadge: true,
    });
  }

  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted) return null;

  const easProjectId = projectId();
  if (!easProjectId) throw new Error('Proiectul Expo nu este configurat pentru notificări push.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })).data;
  await apiRequest('/push/devices', {
    method: 'POST',
    body: JSON.stringify({
      propertyId,
      token,
      platform: Platform.OS,
      deviceName: Device.deviceName ?? Device.modelName ?? 'Telefon mobil',
    }),
  });
  return token;
}

export async function scheduleLocalMissingDocumentReminder(propertyId: string) {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  const storageKey = `push.missing-documents.${propertyId}`;
  const previousId = await preferenceStorage.get(storageKey);
  if (previousId) {
    await Notifications.cancelScheduledNotificationAsync(previousId).catch(() => undefined);
    await preferenceStorage.remove(storageKey);
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((notification) => notification.content.data?.propertyId === propertyId)
    .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => undefined)));
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(presented.filter((notification) => {
    const data = notification.request.content.data;
    return data?.propertyId === propertyId && (data?.kind === 'missing-documents' || data?.route === '/service/register?filter=INCOMPLETE');
  }).map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => undefined)));

  const rows = await serviceSheetRepository.listRegister(propertyId);
  const incomplete = rows.map((row) => ({ row, missing: missingDocumentLabels(row) })).filter((item) => item.missing.length > 0);
  if (!incomplete.length) {
    await Notifications.setBadgeCountAsync(0).catch(() => undefined);
    await preferenceStorage.remove(`push.missing-documents.notice.${propertyId}`);
    return;
  }

  for (const { row, missing } of incomplete) {
    const client = row.clientName.trim();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Documente lipsă · ${row.serviceSheetNumber}`,
        body: `${client ? `${client}: ` : ''}lipsesc ${missing.join(', ')}.`,
        sound: 'default',
        badge: incomplete.length,
        data: {
          kind: 'missing-documents',
          route: `/service/service-sheets/${row.serviceSheetId}`,
          propertyId,
          serviceSheetId: row.serviceSheetId,
          missing,
        },
      },
      trigger: null,
    });
  }
}

export async function refreshMissingDocumentNotifications(propertyId: string) {
  await registerPushDevice(propertyId).catch(() => null);
  await scheduleLocalMissingDocumentReminder(propertyId);
}

export function notificationRoute(response: Notifications.NotificationResponse | null | undefined) {
  const route = response?.notification.request.content.data?.route;
  return typeof route === 'string' && route.startsWith('/') ? route : null;
}

export function missingDocumentLabels(row: ServiceDocumentRegisterRow) {
  const labels: string[] = [];
  if (!row.intakeNumber) labels.push('Fișa de intrare');
  if (!row.finalEstimateNumber) labels.push('Devizul final');
  if (!row.exitNumber) labels.push('Fișa de ieșire');
  if (!row.warrantyNumber) labels.push('Certificatul de garanție');
  return labels;
}
