import { QRChart } from '@/components/dashboard/QRChart';
import { AppHeader } from '@/components/layout/AppHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { Commission, CommissionStatus, DashboardMetrics } from '@/types';
import { formatCurrency } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ComponentProps } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

type Report = {
  metrics: DashboardMetrics;
  commissions: Commission[];
  revenueByMonth: { label: string; value: number }[];
  totalCosts: number;
  netProfit: number;
};

const statusLabels: Record<CommissionStatus, string> = {
  ESTIMATED: 'Estimat',
  CALCULATED: 'Calculat',
  APPROVED: 'De achitat',
  PAID: 'Achitat',
  CANCELLED: 'Anulat',
};

export default function ReportsScreen() {
  const { activeProperty } = useProperty();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 620;
  const state = useAsyncData(() => apiRequest<Report>(`/reports?propertyId=${activeProperty?.id}`), [activeProperty?.id]);

  const returnToMore = () => router.replace('/service/more');
  if (state.loading) return <Screen header={<AppHeader title="Rapoarte" back onBack={returnToMore} />}><LoadingState rows={6} /></Screen>;
  if (state.error || !state.data) return <Screen header={<AppHeader title="Rapoarte" back onBack={returnToMore} />}><ErrorState message={state.error?.message ?? 'Rapoarte indisponibile.'} onRetry={() => void state.reload()} /></Screen>;

  const report = state.data;
  const max = Math.max(1, ...report.revenueByMonth.map((item) => item.value));
  const cardBasis = mobile ? '47%' : '22%';
  return <Screen header={<AppHeader title="Rapoarte" back onBack={returnToMore} />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)} style={mobile && styles.mobilePage}>
    <LinearGradient colors={isDark ? ['#08265C', '#075CFF'] : ['#10399B', '#1478FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroGlow} />
      <View style={styles.heroCopy}><AppText variant="caption" style={styles.eyebrow}>RAPORT ÎN TIMP REAL</AppText><AppText variant="title" style={styles.heroTitle}>Performanța proprietății</AppText><AppText style={styles.heroText}>{activeProperty?.name}</AppText></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Actualizează rapoartele" disabled={state.refreshing} onPress={() => void state.reload(true)} style={({ pressed }) => [styles.refresh, { opacity: pressed ? 0.72 : 1 }]}>{state.refreshing ? <Ionicons name="sync" size={23} color="#fff" /> : <Ionicons name="refresh" size={23} color="#fff" />}</Pressable>
    </LinearGradient>

    <SectionTitle icon="analytics-outline" title="Rezumat financiar" description="Valorile esențiale ale proprietății" />
    <View style={styles.stats}>
      <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Venit estimat" value={formatCurrency(report.metrics.estimatedRevenue)} icon="trending-up-outline" color={palette.success} />
      <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Costuri directe" value={formatCurrency(report.totalCosts)} icon="trending-down-outline" color={palette.danger} />
      <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Profit net" value={formatCurrency(report.netProfit)} icon="wallet-outline" color={palette.electric} />
      <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Comisioane" value={formatCurrency(report.metrics.collaboratorCommissions)} icon="people-outline" color={palette.purple} />
    </View>

    <View style={[styles.columns, mobile && styles.columnsMobile]}>
      <Card style={[styles.panel, !mobile && styles.halfPanel]}>
        <SectionTitle compact icon="qr-code-outline" title="Activitate QR" description="Coduri generate și folosite" />
        <QRChart generated={report.metrics.qrGenerated} used={report.metrics.qrUsed} />
      </Card>
      <Card style={[styles.panel, !mobile && styles.halfPanel]}>
        <SectionTitle compact icon="bar-chart-outline" title="Venituri pe luni" description="Evoluția ultimelor 6 luni" />
        <View style={styles.bars}>{report.revenueByMonth.map((item) => {
          const height = Math.max(8, (item.value / max) * 100);
          return <View key={item.label} style={styles.barColumn}>
            <AppText variant="caption" muted numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={styles.barValue}>{compactCurrency(item.value)}</AppText>
            <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}><LinearGradient colors={['#3D8BFF', '#075CFF']} style={[styles.bar, { height: `${height}%` }]} /></View>
            <AppText variant="caption" muted numberOfLines={1}>{item.label}</AppText>
          </View>;
        })}</View>
      </Card>
    </View>

    <Card style={styles.panel}>
      <SectionTitle compact icon="people-circle-outline" title="Comisioane colaboratori" description={`${report.commissions.length} înregistrări calculate`} />
      {report.commissions.length ? <View style={styles.commissions}>{report.commissions.slice(0, 10).map((item) => <CommissionRow key={item.id} item={item} />)}</View> : <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="receipt-outline" size={28} color={colors.primary} /></View><AppText variant="heading">Niciun comision</AppText><AppText variant="caption" muted style={styles.center}>Comisioanele calculate vor apărea aici.</AppText></View>}
    </Card>
  </Screen>;
}

function SectionTitle({ icon, title, description, compact = false }: { icon: ComponentProps<typeof Ionicons>['name']; title: string; description: string; compact?: boolean }) {
  const { colors } = useAppTheme();
  return <View style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}><View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name={icon} size={compact ? 19 : 21} color={colors.primary} /></View><View style={styles.sectionCopy}><AppText variant={compact ? 'heading' : 'title'}>{title}</AppText><AppText variant="caption" muted>{description}</AppText></View></View>;
}

function CommissionRow({ item }: { item: Commission }) {
  const { colors, isDark } = useAppTheme();
  const paid = item.status === 'PAID';
  const cancelled = item.status === 'CANCELLED';
  const color = paid ? palette.success : cancelled ? palette.danger : palette.warning;
  const rule = item.type === 'FIXED' ? 'Sumă fixă' : `${item.rateOrAmount}% din ${item.type === 'PERCENT_TOTAL' ? 'total' : 'net'}`;
  return <View style={[styles.commission, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
    <View style={[styles.commissionIcon, { backgroundColor: isDark ? `${color}22` : `${color}12` }]}><Ionicons name={paid ? 'checkmark-circle-outline' : cancelled ? 'close-circle-outline' : 'time-outline'} size={21} color={color} /></View>
    <View style={styles.commissionCopy}><AppText variant="label" numberOfLines={1}>Fișa {item.serviceSheetNumber ?? 'fără număr'}</AppText><AppText variant="caption" muted>{rule}</AppText></View>
    <View style={styles.commissionValue}><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color }}>{formatCurrency(item.commissionValue)}</AppText><AppText variant="caption" style={{ color }}>{statusLabels[item.status]}</AppText></View>
  </View>;
}

function compactCurrency(value: number) {
  return `${new Intl.NumberFormat('ro-RO', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} RON`;
}

const styles = StyleSheet.create({
  mobilePage: { paddingHorizontal: spacing.md },
  hero: { minHeight: 154, borderRadius: radius.xl, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, overflow: 'hidden' },
  heroGlow: { position: 'absolute', width: 190, height: 190, borderRadius: 95, top: -105, right: -60, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  eyebrow: { color: '#DCE8FF', fontWeight: '800', letterSpacing: 1.1 },
  heroTitle: { color: '#fff' },
  heroText: { color: '#E8F0FF' },
  refresh: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  sectionTitleCompact: { marginTop: 0 },
  sectionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { minWidth: 0, flex: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  columns: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  columnsMobile: { flexDirection: 'column' },
  panel: { minWidth: 0, gap: spacing.lg, overflow: 'hidden' },
  halfPanel: { flex: 1 },
  bars: { height: 230, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, paddingTop: spacing.sm },
  barColumn: { minWidth: 0, flex: 1, height: '100%', alignItems: 'center', gap: 5 },
  barValue: { width: '100%', height: 30, textAlign: 'center', textAlignVertical: 'bottom' },
  barTrack: { flex: 1, width: '72%', minWidth: 18, maxWidth: 42, borderRadius: radius.sm, overflow: 'hidden', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.sm },
  commissions: { gap: spacing.sm },
  commission: { minHeight: 76, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  commissionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  commissionCopy: { minWidth: 0, flex: 1 },
  commissionValue: { maxWidth: 118, alignItems: 'flex-end' },
  empty: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyIcon: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
