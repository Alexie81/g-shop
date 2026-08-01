import { ServiceSheetStatus } from '@/components/service-sheets/ServiceSheetStatus';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { serviceSheetRepository } from '@/repositories/api-repositories';
import { spacing } from '@/theme/tokens';
import { formatCurrency, formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
export default function ServiceSheetsScreen() { const { activeProperty } = useProperty(); const { colors } = useAppTheme(); const state = useAsyncData(() => serviceSheetRepository.list(activeProperty?.id ?? ''), [activeProperty?.id]); const createSheet = () => router.push({ pathname: '/service/service-sheets/create', params: { returnTo: '/service/service-sheets' } }); return <Screen header={<AppHeader title="Fișe de service" />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}><View style={styles.heading}><View style={{ flex: 1 }}><AppText variant="title">Fișe de service</AppText><AppText muted>{state.data?.total ?? 0} fișe în proprietatea activă</AppText></View><Button compact label="Fișă nouă" icon="add" onPress={createSheet} /></View>{state.loading ? <LoadingState rows={5} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !state.data?.data.length ? <EmptyState icon="document-text-outline" title="Nicio fișă de service" message="Creează prima fișă direct sau din profilul unui client." action="Creează fișă" onAction={createSheet} /> : <View style={styles.list}>{state.data.data.map((sheet) => <Pressable key={sheet.id} onPress={() => router.push(`/service/service-sheets/${sheet.id}`)}><Card style={styles.card}><View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={23} color={colors.primary} /></View><View style={{ flex: 1, gap: 4 }}><View style={styles.row}><AppText variant="heading" style={{ flex: 1 }}>{sheet.number}</AppText><ServiceSheetStatus status={sheet.status} /></View><AppText variant="label">{sheet.equipment}{sheet.brand ? ` · ${sheet.brand}` : ''}{sheet.model ? ` ${sheet.model}` : ''}</AppText><AppText variant="caption" muted numberOfLines={1}>{sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName}` : 'Client'} · {sheet.reportedIssue}</AppText><View style={styles.row}><AppText variant="caption" muted>{formatDate(sheet.receivedAt)}</AppText><AppText variant="label" style={{ color: colors.primary }}>{formatCurrency(sheet.totalCost)}</AppText></View></View><Ionicons name="chevron-forward" size={20} color={colors.textMuted} /></Card></Pressable>)}</View>}</Screen>; }
const styles = StyleSheet.create({ heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, list: { gap: spacing.md }, card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, icon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md } });
