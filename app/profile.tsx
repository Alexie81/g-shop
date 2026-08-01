import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ROLE_LABELS } from '@/constants/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { spacing } from '@/theme/tokens';
import { initials } from '@/utils/format';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
export default function ProfileScreen() { const { user, logout } = useAuth(); const { properties, activeProperty } = useProperty(); const { colors } = useAppTheme(); if (!user) return null; return <Screen header={<AppHeader title="Profil" back />}><Card style={styles.profile}><View style={[styles.avatar, { backgroundColor: colors.primary }]}><AppText variant="display" style={{ color: '#fff' }}>{initials(user.firstName, user.lastName)}</AppText></View><AppText variant="title">{user.firstName} {user.lastName}</AppText><AppText muted>@{user.username} · {ROLE_LABELS[user.role]}</AppText><AppText variant="caption" muted>{user.email}</AppText></Card><Card style={styles.section}><AppText variant="heading">Proprietăți disponibile</AppText>{properties.map((property) => <View key={property.id} style={[styles.property, { borderBottomColor: colors.border }]}><View style={{ flex: 1 }}><AppText variant="label">{property.name}</AppText><AppText variant="caption" muted>{property.domain}</AppText></View>{property.id === activeProperty?.id ? <AppText variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>ACTIVĂ</AppText> : null}</View>)}<Button variant="outline" label="Schimbă proprietatea" icon="swap-horizontal-outline" onPress={() => router.push('/select-property')} /></Card><Card style={styles.section}><AppText variant="heading">Acces</AppText><AppText muted>{user.permissions.length} permisiuni active. Administratorul poate personaliza accesul din modulul Utilizatori.</AppText><Button variant="outline" label="Setări și securitate" icon="settings-outline" onPress={() => router.push('/settings')} /></Card><Button variant="danger" label="Deconectare" icon="log-out-outline" onPress={async () => { await logout(); router.replace('/(auth)/login'); }} /></Screen>; }
const styles = StyleSheet.create({ profile: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }, avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }, section: { gap: spacing.lg }, property: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth } });
