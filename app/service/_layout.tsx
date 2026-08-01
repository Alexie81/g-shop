import { RouteLoader } from '@/components/layout/RouteLoader';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = { dashboard: 'home-outline', clients: 'people-outline', 'service-sheets': 'document-text-outline', 'qr-scanner': 'scan-outline', more: 'grid-outline' };

export default function ServiceLayout() {
  const { user, ready } = useAuth(); const { activeProperty, loading } = useProperty(); const { colors } = useAppTheme();
  if (!ready || loading) return <RouteLoader />; if (!user) return <Redirect href="/(auth)/login" />; if (!activeProperty) return <Redirect href="/select-property" />; if (activeProperty.type !== 'SERVICE') return <Redirect href="/shop/home" />;
  return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted, tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, height: 70, paddingTop: 6, paddingBottom: 8 }, tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' }, tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? (icons[route.name].replace('-outline', '') as keyof typeof Ionicons.glyphMap) : icons[route.name]} size={focused ? size + 1 : size} color={color} /> })}>
    <Tabs.Screen name="dashboard" options={{ title: 'Acasă' }} />
    <Tabs.Screen name="clients" options={{ title: 'Clienți' }} />
    <Tabs.Screen name="service-sheets" options={{ title: 'Fișe service' }} />
    <Tabs.Screen name="qr-scanner" options={{ title: 'Scanare QR' }} />
    <Tabs.Screen name="more" options={{ title: 'Mai mult' }} />
  </Tabs>;
}
