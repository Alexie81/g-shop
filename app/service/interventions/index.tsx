import { AppHeader } from '@/components/layout/AppHeader';
import { InterventionStatus } from '@/components/interventions/InterventionStatus';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { interventionRepository } from '@/repositories/api-repositories';
import { radius, spacing } from '@/theme/tokens';
import { formatCurrency, formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
export default function InterventionsScreen() { const { activeProperty } = useProperty(); const { colors } = useAppTheme(); const state = useAsyncData(() => interventionRepository.list(activeProperty?.id ?? ''), [activeProperty?.id]); return <Screen header={<AppHeader title="Intervenții" back />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}><View style={styles.heading}><View style={{ flex: 1 }}><AppText variant="title">Intervenții</AppText><AppText muted>{state.data?.total ?? 0} intervenții programate sau finalizate</AppText></View><Button compact label="Adaugă" icon="add" onPress={() => router.push('/service/interventions/create')} /></View>{state.loading ? <LoadingState /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !state.data?.data.length ? <EmptyState icon="construct-outline" title="Nicio intervenție" message="Programează prima intervenție pentru un client." action="Adaugă intervenție" onAction={() => router.push('/service/interventions/create')} /> : <View style={styles.list}>{state.data.data.map((item) => <Card key={item.id} style={styles.card}><View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="construct-outline" size={22} color={colors.primary} /></View><View style={{ flex: 1, gap: 4 }}><View style={styles.row}><AppText variant="heading" style={{ flex: 1 }}>{item.title}</AppText><InterventionStatus status={item.status} /></View><AppText variant="caption" muted>{item.client ? `${item.client.firstName} ${item.client.lastName}` : 'Client'} · {item.location || 'Locație nespecificată'}</AppText><View style={styles.row}><AppText variant="caption" muted>{formatDate(item.scheduledAt, true)}</AppText><AppText variant="label" style={{ color: colors.primary }}>{formatCurrency(item.cost)}</AppText></View></View></Card>)}</View>}</Screen>; }
const styles = StyleSheet.create({ heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, list: { gap: spacing.md }, card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, icon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md } });
