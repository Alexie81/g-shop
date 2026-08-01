import { QRChart } from '@/components/dashboard/QRChart';
import { QuickAction } from '@/components/dashboard/QuickAction';
import { StatCard } from '@/components/dashboard/StatCard';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { dashboardRepository, interventionRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { formatCurrency, formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function DashboardScreen() {
  const { user } = useAuth(); const { activeProperty } = useProperty(); const propertyId = activeProperty?.id ?? '';
  const state = useAsyncData(async () => { const [metrics, interventions, sheets] = await Promise.all([dashboardRepository.get(propertyId), interventionRepository.list(propertyId), serviceSheetRepository.list(propertyId)]); return { metrics, interventions: interventions.data.slice(0, 3), sheets: sheets.data.slice(0, 3) }; }, [propertyId]);
  const hour = new Date().getHours(); const greeting = hour < 12 ? 'Bună dimineața' : hour < 18 ? 'Bună ziua' : 'Bună seara';
  if (state.loading) return <Screen header={<AppHeader />}><LoadingState rows={6} /></Screen>;
  if (state.error || !state.data) return <Screen header={<AppHeader />}><ErrorState message={state.error?.message ?? 'Date indisponibile.'} onRetry={() => void state.reload()} /></Screen>;
  const { metrics, interventions, sheets } = state.data;
  return <Screen header={<AppHeader />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <LinearGradient colors={['#082376', '#075CFF', '#0D78FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}><View style={styles.heroCopy}><AppText variant="title" style={{ color: '#fff' }}>{greeting}, {user?.firstName}! <AppText style={{ color: '#FFD75C' }}>👋</AppText></AppText><AppText style={{ color: '#DDE8FF' }}>Ai control complet asupra activității din {activeProperty?.name}.</AppText></View><View style={styles.heroGraphic}><Ionicons name="analytics" size={74} color="#8CB7FF" /></View></LinearGradient>
    <SectionHeader title="Privire de ansamblu" />
    <View style={styles.stats}>
      <StatCard label="Clienți" value={metrics.clientsTotal} icon="people-outline" color={palette.electric} helper={`+${metrics.clientsNew} noi`} />
      <StatCard label="Intervenții active" value={metrics.interventionsActive} icon="construct-outline" color={palette.warning} />
      <StatCard label="Fișe deschise" value={metrics.serviceSheetsOpen} icon="document-text-outline" color={palette.purple} />
      <StatCard label="Fișe finalizate" value={metrics.serviceSheetsCompleted} icon="checkmark-done-outline" color={palette.success} />
      <StatCard label="Colaboratori" value={metrics.collaboratorsActive} icon="person-add-outline" color={palette.cyan} />
      <StatCard label="Venit estimat" value={formatCurrency(metrics.estimatedRevenue)} icon="wallet-outline" color={palette.success} />
    </View>
    <SectionHeader title="Acțiuni rapide" />
    <View style={styles.actions}>
      <QuickAction label="Adaugă client" icon="person-add-outline" onPress={() => router.push('/service/clients/create')} />
      <QuickAction label="Creează fișă" icon="document-text-outline" accent={palette.purple} onPress={() => router.push('/service/service-sheets/create')} />
      <QuickAction label="Scanează QR" icon="scan-outline" accent={palette.success} onPress={() => router.push('/service/qr-scanner')} />
      <QuickAction label="Adaugă intervenție" icon="calendar-outline" accent={palette.warning} onPress={() => router.push('/service/interventions/create')} />
      <QuickAction label="Atribuie colaborator" icon="people-circle-outline" accent={palette.cyan} onPress={() => router.push('/service/collaborators')} />
    </View>
    <View style={styles.columns}>
      <Card style={styles.panel}><SectionHeader title="Activitate QR azi" action="Vezi clienții" onAction={() => router.push('/service/clients')} /><QRChart generated={metrics.qrGenerated} used={metrics.qrUsed} waiting={metrics.qrUnused} /><AppText variant="caption" style={{ color: palette.success, textAlign: 'right' }}>↗ actualizat în timp real</AppText></Card>
      <Card style={styles.panel}><SectionHeader title="Programări recente" action="Toate" onAction={() => router.push('/service/interventions')} />{interventions.length ? interventions.map((item) => <View key={item.id} style={styles.activity}><View style={[styles.activityIcon, { backgroundColor: '#FFF4DE' }]}><Ionicons name="calendar-outline" size={18} color={palette.warning} /></View><View style={{ flex: 1 }}><AppText variant="label">{item.title}</AppText><AppText variant="caption" muted>{item.client ? `${item.client.firstName} ${item.client.lastName}` : 'Client'} · {formatDate(item.scheduledAt, true)}</AppText></View></View>) : <AppText muted>Nu sunt programări recente.</AppText>}</Card>
    </View>
    <Card style={styles.panel}><SectionHeader title="Fișe de service recente" action="Vezi toate" onAction={() => router.push('/service/service-sheets')} />{sheets.length ? sheets.map((sheet) => <View key={sheet.id} style={styles.sheetRow}><View style={{ flex: 1 }}><AppText variant="label">{sheet.number} · {sheet.equipment}</AppText><AppText variant="caption" muted>{sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName}` : 'Client'} · {formatDate(sheet.receivedAt)}</AppText></View><AppText variant="label" style={{ color: palette.electric }}>{formatCurrency(sheet.totalCost)}</AppText></View>) : <AppText muted>Nu există fișe recente.</AppText>}</Card>
  </Screen>;
}

const styles = StyleSheet.create({ hero: { minHeight: 164, borderRadius: radius.xl, padding: spacing.xxl, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', marginBottom: spacing.md }, heroCopy: { flex: 1, gap: spacing.sm, maxWidth: 620 }, heroGraphic: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#FFFFFF16', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm }, columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, panel: { minWidth: 290, flex: 1, gap: spacing.lg }, activity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, activityIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, sheetRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#8090A040' } });
