import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Permission } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

type Item = { label: string; description: string; icon: keyof typeof Ionicons.glyphMap; color: string; route: string; permission?: Permission; adminOnly?: boolean };

export default function ShopMoreScreen() {
  const { colors, isDark } = useAppTheme();
  const { activeProperty } = useProperty();
  const { user, hasPermission } = useAuth();
  const allItems: Item[] = [
    { label: 'Datele firmei', description: 'Aceleași firme ca în Service, cu selecție separată pentru vânzări', icon: 'business-outline', color: palette.warning, route: '/company-details', permission: 'settings.manage', adminOnly: true },
    { label: 'Produse', description: 'Catalogul de produse și categorii', icon: 'cube-outline', color: colors.primary, route: '/shop/products' },
    { label: 'Stocuri', description: 'Produse și disponibilitate', icon: 'layers-outline', color: palette.cyan, route: '/shop/stocks' },
    { label: 'Actualizare aplicație', description: 'Verifică versiunea instalată', icon: 'cloud-download-outline', color: palette.cyan, route: '/app-update' },
    { label: 'Setări', description: 'Temă, securitate și aplicație', icon: 'settings-outline', color: '#64748B', route: '/settings' },
    { label: 'Profil', description: 'Contul și proprietățile tale', icon: 'person-circle-outline', color: colors.primary, route: '/profile' },
    { label: 'Schimbă proprietatea', description: 'Treci între Service și Shop', icon: 'swap-horizontal-outline', color: palette.purple, route: '/select-property?manual=1' },
  ];
  const items = allItems.filter((item) => (!item.permission || hasPermission(item.permission)) && (!item.adminOnly || user?.role === 'ADMIN'));

  return <Screen header={<AppHeader title="Mai mult" />}>
    <View style={styles.stack}>
      <View style={styles.heading}><View style={[styles.headingIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="storefront-outline" size={25} color={colors.primary} /></View><View style={styles.copy}><AppText variant="title">Administrare Shop</AppText><AppText variant="caption" muted>{activeProperty?.name ?? 'Magazin'} · setările și documentele de vânzare</AppText></View></View>
      <View style={styles.grid}>{items.map((item) => <Pressable key={item.label} accessibilityRole="button" onPress={() => router.push(item.route as never)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: item.label === 'Datele firmei' ? `${item.color}70` : colors.border, shadowColor: colors.shadow, shadowOpacity: isDark ? 0.12 : 0.07, opacity: pressed ? 0.76 : 1 }]}>
        <View style={[styles.icon, { backgroundColor: `${item.color}18` }]}><Ionicons name={item.icon} size={25} color={item.color} /></View><View style={styles.copy}><AppText variant="heading">{item.label}</AppText><AppText variant="caption" muted>{item.description}</AppText></View><View style={[styles.arrow, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></View>
      </Pressable>)}</View>
      <View style={[styles.note, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}30` }]}><Ionicons name="information-circle-outline" size={21} color={colors.primary} /><AppText variant="caption" style={styles.copy}>Firmele sunt partajate între module. Alegerea firmei active în Shop nu schimbă firma activă folosită în fișele de service.</AppText></View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({ stack: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: spacing.lg }, heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, headingIcon: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' }, copy: { minWidth: 0, flex: 1 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, card: { minWidth: 290, minHeight: 98, flex: 1, padding: spacing.lg, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 2 }, icon: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, arrow: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, note: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm } });
