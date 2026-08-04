import { RouteLoader } from '@/components/layout/RouteLoader';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Permission } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Redirect, Tabs, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = { dashboard: 'home-outline', clients: 'people-outline', 'service-sheets': 'document-text-outline', 'qr-scanner': 'qr-code-outline', more: 'grid-outline' };

function requiredPermission(segments: string[]): Permission | null {
  const serviceIndex = segments.indexOf('service');
  const section = segments[serviceIndex + 1];
  const leaf = segments[segments.length - 1];
  if (section === 'dashboard') return 'dashboard.view';
  if (section === 'clients') {
    if (leaf === 'create') return 'clients.create';
    if (leaf === 'edit') return 'clients.update';
    return 'clients.view';
  }
  if (section === 'service-sheets') {
    if (leaf === 'create') return 'service_sheets.create';
    if (leaf === 'edit') return 'service_sheets.update';
    return 'service_sheets.view';
  }
  if (section === 'qr-scanner') return 'qr.scan';
  if (section === 'collaborators') return 'collaborators.view';
  if (section === 'technicians' || section === 'register') return 'service_sheets.view';
  if (section === 'whatsapp-messages') return 'clients.view';
  if (section === 'users') {
    if (leaf === 'create') return 'users.manage';
    if (leaf !== 'users') return 'roles.manage';
    return 'users.view';
  }
  if (section === 'reports') return 'reports.view';
  if (section === 'audit') return 'audit.view';
  return null;
}

export default function ServiceLayout() {
  const { user, ready, hasPermission } = useAuth(); const { activeProperty, loading } = useProperty(); const { colors } = useAppTheme();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const tabBarBottomPadding = Math.max(insets.bottom, 8);
  if (!ready || loading) return <RouteLoader />; if (!user) return <Redirect href="/(auth)/login" />; if (!activeProperty) return <Redirect href="/select-property" />; if (activeProperty.type !== 'SERVICE') return <Redirect href="/shop/home" />;
  const permission = requiredPermission(segments);
  if (permission && !hasPermission(permission)) return <Redirect href="/service/more" />;
  return <Tabs
    screenListeners={({ route }) => ({ tabPress: (event) => {
      void Haptics.selectionAsync().catch(() => undefined);
      if (route.name === 'clients') {
        event.preventDefault();
        router.replace('/service/clients');
      }
    } })}
    screenOptions={({ route }) => { const icon = icons[route.name] ?? 'ellipse-outline'; return { headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted, tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, height: 62 + tabBarBottomPadding, paddingTop: 6, paddingBottom: tabBarBottomPadding }, tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' }, tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? (icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : icon} size={focused ? size + 1 : size} color={color} /> }; }}
  >
    <Tabs.Screen name="dashboard" options={{ title: 'Acasă', href: hasPermission('dashboard.view') ? undefined : null }} />
    <Tabs.Screen name="clients" options={{ title: 'Clienți', href: hasPermission('clients.view') ? undefined : null }} />
    <Tabs.Screen name="service-sheets" options={{ title: 'Fișe', href: hasPermission('service_sheets.view') ? undefined : null }} />
    <Tabs.Screen name="qr-scanner" options={{ title: 'Scanare', href: hasPermission('qr.scan') ? undefined : null }} />
    <Tabs.Screen name="more" options={{ title: '•••', tabBarAccessibilityLabel: 'Mai mult' }} />
    <Tabs.Screen name="collaborators" options={{ href: null }} />
    <Tabs.Screen name="technicians" options={{ href: null }} />
    <Tabs.Screen name="users" options={{ href: null }} />
    <Tabs.Screen name="reports" options={{ href: null }} />
    <Tabs.Screen name="register" options={{ href: null }} />
    <Tabs.Screen name="audit" options={{ href: null }} />
    <Tabs.Screen name="whatsapp-messages" options={{ href: null }} />
  </Tabs>;
}
