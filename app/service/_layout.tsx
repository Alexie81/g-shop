import { RouteLoader } from '@/components/layout/RouteLoader';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = { dashboard: 'home-outline', clients: 'people-outline', 'service-sheets': 'document-text-outline', 'qr-scanner': 'qr-code-outline', more: 'grid-outline' };

export default function ServiceLayout() {
  const { user, ready } = useAuth(); const { activeProperty, loading } = useProperty(); const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarBottomPadding = Math.max(insets.bottom, 8);
  if (!ready || loading) return <RouteLoader />; if (!user) return <Redirect href="/(auth)/login" />; if (!activeProperty) return <Redirect href="/select-property" />; if (activeProperty.type !== 'SERVICE') return <Redirect href="/shop/home" />;
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
    <Tabs.Screen name="dashboard" options={{ title: 'Acasă' }} />
    <Tabs.Screen name="clients" options={{ title: 'Clienți' }} />
    <Tabs.Screen name="service-sheets" options={{ title: 'Fișe' }} />
    <Tabs.Screen name="qr-scanner" options={{ title: 'Scanare' }} />
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
