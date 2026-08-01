import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { ROLE_LABELS } from '@/constants/permissions';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { userRepository } from '@/repositories/api-repositories';
import { palette, spacing } from '@/theme/tokens';
import { formatDate, initials } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
export default function UsersScreen() { const { activeProperty } = useProperty(); const { colors } = useAppTheme(); const state = useAsyncData(() => userRepository.list(activeProperty?.id ?? ''), [activeProperty?.id]); return <Screen header={<AppHeader title="Utilizatori" back onBack={() => router.replace('/service/more')} />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}><View style={styles.heading}><View style={{ flex: 1 }}><AppText variant="title">Utilizatori și permisiuni</AppText><AppText muted>{state.data?.filter((item) => item.isActive).length ?? 0} utilizatori activi</AppText></View><Button compact label="Adaugă" icon="person-add-outline" onPress={() => router.push('/service/users/create')} /></View>{state.loading ? <LoadingState /> : state.error ? <ErrorState message={state.error.message} /> : !state.data?.length ? <EmptyState icon="people-outline" title="Niciun utilizator" message="Adaugă utilizatori pentru această proprietate." /> : <View style={styles.list}>{state.data.map((user, index) => <Pressable key={user.id} onPress={() => router.push(`/service/users/${user.id}`)}><Card style={styles.card}><View style={[styles.avatar, { backgroundColor: [palette.electric, palette.purple, palette.success, palette.warning][index % 4] }]}><AppText variant="label" style={{ color: '#fff' }}>{initials(user.firstName, user.lastName)}</AppText></View><View style={{ flex: 1, gap: 3 }}><View style={styles.row}><AppText variant="heading">{user.firstName} {user.lastName}</AppText><View style={[styles.status, { backgroundColor: user.isActive ? palette.successSoft : palette.dangerSoft }]}><AppText variant="caption" style={{ color: user.isActive ? palette.success : palette.danger, fontWeight: '800' }}>{user.isActive ? 'Activ' : 'Inactiv'}</AppText></View></View><AppText variant="caption" muted>@{user.username} · {ROLE_LABELS[user.role]}</AppText><AppText variant="caption" muted>{user.permissions.length} permisiuni · ultima autentificare {formatDate(user.lastLoginAt, true)}</AppText></View><Ionicons name="chevron-forward" size={20} color={colors.textMuted} /></Card></Pressable>)}</View>}</Screen>; }
const styles = StyleSheet.create({ heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, list: { gap: spacing.md }, card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }, status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 } });
