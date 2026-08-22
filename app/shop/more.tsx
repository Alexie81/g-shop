import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Permission } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

type Item = { label: string; description: string; icon: keyof typeof Ionicons.glyphMap; color: string; route?: string; permission?: Permission; adminOnly?: boolean; action?: () => void };

export default function ShopMoreScreen() {
  const { colors, isDark } = useAppTheme();
  const { activeProperty } = useProperty();
  const { user, logout, hasPermission } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const allItems: Item[] = [
    { label: 'Datele firmei', description: 'Date și ștampilă separate pentru documentele de vânzare', icon: 'business-outline', color: palette.warning, route: '/company-details', permission: 'settings.manage', adminOnly: true },
    { label: 'Produse', description: 'Catalogul de produse și categorii', icon: 'cube-outline', color: colors.primary, route: '/shop/products' },
    { label: 'Stocuri', description: 'Produse și disponibilitate', icon: 'layers-outline', color: palette.cyan, route: '/shop/stocks' },
    { label: 'Actualizare aplicație', description: 'Verifică versiunea instalată', icon: 'cloud-download-outline', color: palette.cyan, route: '/app-update' },
    { label: 'Setări', description: 'Temă, securitate și aplicație', icon: 'settings-outline', color: '#64748B', route: '/settings' },
    { label: 'Profil', description: 'Contul și proprietățile tale', icon: 'person-circle-outline', color: colors.primary, route: '/profile' },
    { label: 'Schimbă proprietatea', description: 'Treci între Service și Shop', icon: 'swap-horizontal-outline', color: palette.purple, route: '/select-property?manual=1' },
    { label: 'Deconectare', description: 'Închide sesiunea curentă', icon: 'log-out-outline', color: palette.danger, action: () => setLogoutOpen(true) },
  ];
  const items = allItems.filter((item) => (!item.permission || hasPermission(item.permission)) && (!item.adminOnly || user?.role === 'ADMIN'));

  const confirmLogout = async () => {
    setLogoutLoading(true);
    try { await logout(); setLogoutOpen(false); router.replace('/(auth)/login'); } finally { setLogoutLoading(false); }
  };

  return <>
    <Screen header={<AppHeader title="Mai mult" />}>
      <View style={styles.stack}>
        <View style={styles.heading}><View style={[styles.headingIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="storefront-outline" size={25} color={colors.primary} /></View><View style={styles.copy}><AppText variant="title">Administrare Shop</AppText><AppText variant="caption" muted>{activeProperty?.name ?? 'Magazin'} · setările și documentele de vânzare</AppText></View></View>
        <View style={styles.grid}>{items.map((item) => <Pressable key={item.label} accessibilityRole="button" onPress={() => item.action ? item.action() : item.route && router.push(item.route as never)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: item.label === 'Datele firmei' ? `${item.color}70` : colors.border, shadowColor: colors.shadow, shadowOpacity: isDark ? 0.12 : 0.07, opacity: pressed ? 0.76 : 1 }]}>
        <View style={[styles.icon, { backgroundColor: `${item.color}18` }]}><Ionicons name={item.icon} size={25} color={item.color} /></View><View style={styles.copy}><AppText variant="heading">{item.label}</AppText><AppText variant="caption" muted>{item.description}</AppText></View><View style={[styles.arrow, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></View>
        </Pressable>)}</View>
        <View style={[styles.note, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}30` }]}><Ionicons name="information-circle-outline" size={21} color={colors.primary} /><AppText variant="caption" style={styles.copy}>Datele firmei și ștampila din Vânzări sunt independente. Modificările nu afectează documentele din Service.</AppText></View>
      </View>
    </Screen>

    <Modal visible={logoutOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !logoutLoading && setLogoutOpen(false)}><ModalSafeBottom style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}><Pressable style={StyleSheet.absoluteFill} onPress={() => !logoutLoading && setLogoutOpen(false)} /><View style={[styles.logoutModal, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}><View style={[styles.logoutModalIcon, { backgroundColor: isDark ? '#401722' : palette.dangerSoft }]}><Ionicons name="log-out-outline" size={30} color={palette.danger} /></View><AppText variant="title" style={styles.modalTitle}>Te deconectezi?</AppText><AppText muted style={styles.modalText}>Sesiunea va fi închisă pe acest dispozitiv, iar datele salvate rămân în siguranță.</AppText><View style={[styles.modalActions, compact && styles.modalActionsCompact]}><Button variant="outline" label="Rămân conectat" disabled={logoutLoading} onPress={() => setLogoutOpen(false)} style={[styles.modalButton, compact && styles.modalButtonCompact]} /><Button variant="danger" label="Deconectare" icon="log-out-outline" loading={logoutLoading} onPress={() => void confirmLogout()} style={[styles.modalButton, compact && styles.modalButtonCompact]} /></View></View></ModalSafeBottom></Modal>
  </>;
}

const styles = StyleSheet.create({ stack: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: spacing.lg }, heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, headingIcon: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' }, copy: { minWidth: 0, flex: 1 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, card: { minWidth: 290, minHeight: 98, flex: 1, padding: spacing.lg, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 2 }, icon: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, arrow: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, note: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }, logoutModal: { width: '100%', maxWidth: 440, padding: spacing.xxl, borderRadius: radius.xl, borderWidth: 1, alignItems: 'center', gap: spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.24, shadowRadius: 32, elevation: 16 }, logoutModalIcon: { width: 66, height: 66, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, modalTitle: { textAlign: 'center' }, modalText: { textAlign: 'center', lineHeight: 22 }, modalActions: { width: '100%', flexDirection: 'row', gap: spacing.md }, modalActionsCompact: { flexDirection: 'column-reverse' }, modalButton: { minWidth: 150, flex: 1 }, modalButtonCompact: { width: '100%', minWidth: 0, flex: 0 } });
