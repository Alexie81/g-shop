import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Permission } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
type Item = { label: string; description: string; icon: keyof typeof Ionicons.glyphMap; color: string; route?: string; permission?: Permission; action?: () => void };
export default function MoreScreen() { const { colors } = useAppTheme(); const { logout, hasPermission } = useAuth(); const { properties } = useProperty(); const serviceProperty = properties.find((property) => property.type === 'SERVICE'); const allItems: Item[] = [
  { label: 'Intervenții', description: 'Programări și activitate în teren', icon: 'construct-outline', color: palette.warning, route: '/service/interventions', permission: 'interventions.view' },
  { label: 'Colaboratori', description: 'Atribuiri și comisioane', icon: 'people-circle-outline', color: palette.cyan, route: '/service/collaborators', permission: 'collaborators.view' },
  { label: 'Utilizatori', description: 'Roluri, parole și permisiuni', icon: 'people-outline', color: palette.purple, route: '/service/users', permission: 'users.view' },
  { label: 'Rapoarte', description: 'Venituri, costuri și performanță', icon: 'bar-chart-outline', color: palette.success, route: '/service/reports', permission: 'reports.view' },
  { label: 'Istoric modificări', description: 'Audit complet asociat utilizatorilor', icon: 'time-outline', color: palette.electric, route: '/service/audit', permission: 'audit.view' },
  { label: 'Setări', description: 'Temă, securitate și aplicație', icon: 'settings-outline', color: '#64748B', route: '/settings' },
  { label: 'Profil', description: 'Contul și proprietățile tale', icon: 'person-circle-outline', color: palette.electric, route: '/profile' },
  { label: 'Schimbă proprietatea', description: 'Service sau magazin online', icon: 'swap-horizontal-outline', color: palette.purple, route: '/select-property' },
  { label: 'Deconectare', description: 'Închide sesiunea curentă', icon: 'log-out-outline', color: palette.danger, action: () => Alert.alert('Deconectare', 'Sigur vrei să închizi sesiunea?', [{ text: 'Anulează', style: 'cancel' }, { text: 'Deconectare', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } }]) },
]; const items = allItems.filter((item) => !item.permission || hasPermission(item.permission)); return <Screen header={<AppHeader title="Mai mult" />}><View><AppText variant="title">Administrare</AppText><AppText muted>Modulele disponibile pentru {serviceProperty?.name ?? 'proprietatea activă'}.</AppText></View><View style={styles.grid}>{items.map((item) => <Pressable key={item.label} onPress={() => item.action ? item.action() : item.route && router.push(item.route as never)} style={styles.pressable}><Card style={styles.card}><View style={[styles.icon, { backgroundColor: `${item.color}18` }]}><Ionicons name={item.icon} size={24} color={item.color} /></View><View style={{ flex: 1 }}><AppText variant="heading">{item.label}</AppText><AppText variant="caption" muted>{item.description}</AppText></View><Ionicons name="chevron-forward" size={20} color={colors.textMuted} /></Card></Pressable>)}</View></Screen>; }
const styles = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, pressable: { minWidth: 290, flex: 1 }, card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 92 }, icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' } });
