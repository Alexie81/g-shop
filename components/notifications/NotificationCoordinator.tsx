import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { notificationRoute, refreshMissingDocumentNotifications } from '@/services/push-notifications';
import * as Notifications from 'expo-notifications';
import { Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export function NotificationCoordinator() {
  const { ready, user } = useAuth();
  const { activeProperty, loading } = useProperty();
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void Notifications.getLastNotificationResponseAsync().then((response) => setPendingRoute(notificationRoute(response)));
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => setPendingRoute(notificationRoute(response)));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!pendingRoute || !ready || loading || !user || !activeProperty) return;
    router.push(pendingRoute as Href);
    setPendingRoute(null);
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [activeProperty, loading, pendingRoute, ready, user]);

  useEffect(() => {
    if (Platform.OS === 'web' || !ready || loading || !user || !activeProperty || activeProperty.type !== 'SERVICE') return;
    void refreshMissingDocumentNotifications(activeProperty.id).catch(() => undefined);
  }, [activeProperty, loading, ready, user]);

  return null;
}
