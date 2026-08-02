import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Permission } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

type Item = { label: string; description: string; icon: keyof typeof Ionicons.glyphMap; color: string; route?: string; permission?: Permission; adminOnly?: boolean; action?: () => void };

export default function MoreScreen() {
  const { colors, isDark } = useAppTheme();
  const { user, logout, hasPermission } = useAuth();
  const { activeProperty } = useProperty();
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const [infoOpen, setInfoOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const allItems: Item[] = [
    { label: 'Colaboratori', description: 'Atribuiri și comisioane', icon: 'people-circle-outline', color: palette.cyan, route: '/service/collaborators', permission: 'collaborators.view' },
    { label: 'Mesaje WhatsApp', description: 'Mesajele rapide ale contului tău', icon: 'logo-whatsapp', color: '#18B95D', route: '/service/whatsapp-messages', permission: 'clients.view' },
    { label: 'Utilizatori', description: 'Roluri, parole și permisiuni', icon: 'people-outline', color: palette.purple, route: '/service/users', permission: 'users.view' },
    { label: 'Rapoarte', description: 'Venituri, costuri și performanță', icon: 'bar-chart-outline', color: palette.success, route: '/service/reports', permission: 'reports.view' },
    { label: 'Istoric modificări', description: 'Audit complet asociat utilizatorilor', icon: 'time-outline', color: palette.electric, route: '/service/audit', permission: 'audit.view' },
    { label: 'Datele firmei', description: 'Date juridice, bancare și ștampilă', icon: 'business-outline', color: palette.warning, route: '/company-details', permission: 'settings.manage', adminOnly: true },
    { label: 'Actualizare aplicație', description: 'Verifică și descarcă ultima versiune', icon: 'cloud-download-outline', color: palette.cyan, route: '/app-update' },
    { label: 'Setări', description: 'Temă, securitate și aplicație', icon: 'settings-outline', color: '#64748B', route: '/settings' },
    { label: 'Profil', description: 'Contul și proprietățile tale', icon: 'person-circle-outline', color: palette.electric, route: '/profile' },
    { label: 'Schimbă proprietatea', description: 'Service sau magazin online', icon: 'swap-horizontal-outline', color: palette.purple, route: '/select-property?manual=1' },
    { label: 'Deconectare', description: 'Închide sesiunea curentă', icon: 'log-out-outline', color: palette.danger, action: () => setLogoutOpen(true) },
  ];
  const items = allItems.filter((item) => (!item.permission || hasPermission(item.permission)) && (!item.adminOnly || user?.role === 'ADMIN'));

  const confirmLogout = async () => {
    setLogoutLoading(true);
    try { await logout(); setLogoutOpen(false); router.replace('/(auth)/login'); } finally { setLogoutLoading(false); }
  };

  const openItem = (item: Item) => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (item.action) item.action();
    else if (item.route) router.push(item.route as never);
  };

  return <>
    <Screen header={<AppHeader title="Mai mult" />}>
      <View style={styles.stack}>
        <View style={styles.heading}>
          <View style={styles.titleRow}><View><AppText variant="title">Administrare</AppText><AppText variant="caption" muted>{items.length} module disponibile</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Informații despre modulele disponibile" accessibilityState={{ expanded: infoOpen }} onPress={() => setInfoOpen((value) => !value)} style={({ pressed }) => [styles.infoButton, { backgroundColor: colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}><Ionicons name={infoOpen ? 'close' : 'information-circle-outline'} size={20} color={colors.primary} /></Pressable></View>
          {infoOpen ? <View accessibilityRole="alert" style={[styles.tooltip, { backgroundColor: isDark ? '#102B4C' : '#EAF2FF', borderColor: `${colors.primary}60` }]}><View style={[styles.tooltipIcon, { backgroundColor: colors.primary }]}><Ionicons name="apps-outline" size={17} color="#fff" /></View><View style={styles.tooltipCopy}><AppText variant="label">Modulele proprietății</AppText><AppText variant="caption" muted>Modulele disponibile pentru {activeProperty?.name ?? 'proprietatea activă'}.</AppText></View></View> : null}
        </View>
        <View style={styles.grid}>{items.map((item) => <Pressable key={item.label} accessibilityRole="button" android_ripple={{ color: 'transparent' }} onPress={() => openItem(item)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: isDark ? 0.12 : 0.07 }]}><View style={[styles.icon, { backgroundColor: `${item.color}18` }]}><Ionicons name={item.icon} size={24} color={item.color} /></View><View style={styles.itemCopy}><AppText variant="heading">{item.label}</AppText><AppText variant="caption" muted>{item.description}</AppText></View><View style={[styles.arrow, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></View></Pressable>)}</View>
      </View>
    </Screen>

    <Modal visible={logoutOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !logoutLoading && setLogoutOpen(false)}><View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}><Pressable style={StyleSheet.absoluteFill} onPress={() => !logoutLoading && setLogoutOpen(false)} /><View style={[styles.logoutModal, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}><View style={[styles.logoutModalIcon, { backgroundColor: isDark ? '#401722' : palette.dangerSoft }]}><Ionicons name="log-out-outline" size={30} color={palette.danger} /></View><AppText variant="title" style={styles.modalTitle}>Te deconectezi?</AppText><AppText muted style={styles.modalText}>Sesiunea va fi închisă pe acest dispozitiv, iar datele salvate rămân în siguranță.</AppText><View style={[styles.modalActions, compact && styles.modalActionsCompact]}><Button variant="outline" label="Rămân conectat" disabled={logoutLoading} onPress={() => setLogoutOpen(false)} style={styles.modalButton} /><Button variant="danger" label="Deconectare" icon="log-out-outline" loading={logoutLoading} onPress={() => void confirmLogout()} style={styles.modalButton} /></View></View></View></Modal>
  </>;
}

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: spacing.lg }, heading: { gap: spacing.sm }, titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, infoButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, tooltip: { alignSelf: 'flex-start', width: '100%', maxWidth: 520, minHeight: 58, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, paddingRight: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, tooltipIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, tooltipCopy: { minWidth: 0, flex: 1, gap: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, card: { minWidth: 290, flex: 1, minHeight: 94, padding: spacing.lg, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 2, outlineStyle: 'none', WebkitTapHighlightColor: 'transparent' } as never, icon: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, itemCopy: { minWidth: 0, flex: 1, gap: 2 }, arrow: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }, logoutModal: { width: '100%', maxWidth: 440, padding: spacing.xxl, borderRadius: radius.xl, borderWidth: 1, alignItems: 'center', gap: spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.24, shadowRadius: 32, elevation: 16 }, logoutModalIcon: { width: 66, height: 66, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, modalTitle: { textAlign: 'center' }, modalText: { textAlign: 'center', lineHeight: 22 }, modalActions: { width: '100%', flexDirection: 'row', gap: spacing.md }, modalActionsCompact: { flexDirection: 'column-reverse' }, modalButton: { minWidth: 150, flex: 1 },
});
