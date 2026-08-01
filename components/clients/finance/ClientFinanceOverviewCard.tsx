import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { ClientFinancialOverview } from '@/types';
import { formatFinanceMoney } from '@/utils/client-finance';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  overview?: ClientFinancialOverview | null;
  loading?: boolean;
  title?: string;
  subtitle?: string;
  showInternal?: boolean;
  compact?: boolean;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
};

export function ClientFinanceOverviewCard({
  overview,
  loading = false,
  title = 'Situația financiară a clientului',
  subtitle = 'Sumele actuale asociate clientului',
  showInternal = false,
  compact = false,
  actionLabel,
  actionIcon = 'arrow-forward-outline',
  onAction,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 600;

  if (loading) {
    return <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="wallet-outline" size={22} color={colors.primary} /></View>
        <View style={styles.copy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>Se încarcă valorile financiare…</AppText></View>
      </View>
      <View style={styles.loadingGrid}>{[0, 1, 2, 3].map((item) => <View key={item} style={[styles.loadingMetric, mobile && styles.loadingMetricMobile, { backgroundColor: colors.surfaceMuted }]} />)}</View>
    </Card>;
  }

  if (!overview) return null;

  const { financials, summary } = overview;
  const currency = financials.currencyCode || 'RON';
  const money = (value: number) => formatFinanceMoney(value, currency);
  const paid = financials.paymentStatus === 'PAID';
  const paidRatio = summary.totalDue > 0 ? Math.min(100, Math.max(0, (summary.receivedAmount / summary.totalDue) * 100)) : 0;

  if (compact) {
    const balanceColor = paid || summary.remainingDue <= 0 ? (isDark ? '#61DF81' : '#087A2E') : (isDark ? '#FFB74A' : '#925500');
    const statusColor = paid ? (isDark ? '#61DF81' : '#087A2E') : (isDark ? '#FFB74A' : '#925500');
    return <Card style={[styles.compactCard, { backgroundColor: isDark ? colors.surfaceElevated : '#F8FBFF' }]} elevated>
      <View style={styles.compactHeader}>
        <View style={[styles.compactIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="wallet-outline" size={20} color={colors.primary} /></View>
        <View style={styles.compactCopy}><AppText variant="heading">Finanțe</AppText><AppText variant="caption" muted>Rezumatul clientului</AppText></View>
        <View style={[styles.compactStatus, { backgroundColor: paid ? (isDark ? `${palette.success}24` : palette.successSoft) : (isDark ? `${palette.warning}24` : palette.warningSoft) }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <AppText variant="caption" style={{ color: statusColor, fontWeight: '800' }}>{paid ? 'Achitat' : 'Neachitat'}</AppText>
        </View>
      </View>

      <View style={styles.compactBalanceRow}>
        <View style={styles.compactBalance}>
          <AppText variant="caption" muted>{paid ? 'Total încasat' : 'Rest de plată'}</AppText>
          <AppText variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: balanceColor }}>{money(paid ? summary.receivedAmount : summary.remainingDue)}</AppText>
        </View>
        {showInternal ? <View style={[styles.compactNet, { backgroundColor: summary.gshopNet >= 0 ? `${palette.purple}${isDark ? '24' : '12'}` : isDark ? `${palette.danger}24` : palette.dangerSoft }]}>
          <AppText variant="caption" muted>G-Shop Net</AppText>
          <AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: summary.gshopNet >= 0 ? palette.purple : palette.danger, fontWeight: '900' }}>{money(summary.gshopNet)}</AppText>
        </View> : null}
      </View>

      <View style={styles.progressBlock}>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}><View style={[styles.progressFill, { width: `${paidRatio}%`, backgroundColor: paid ? palette.success : colors.primary }]} /></View>
        <View style={styles.progressMeta}><AppText variant="caption" muted numberOfLines={1} style={styles.progressMetaStart}>{money(summary.receivedAmount)} încasat</AppText><AppText variant="caption" muted numberOfLines={1} style={styles.progressMetaEnd}>din {money(summary.totalDue)}</AppText></View>
      </View>

      {onAction && actionLabel ? <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.compactAction, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.78 : 1 }]}><View style={[styles.compactActionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name={actionIcon} size={18} color={colors.primary} /></View><AppText variant="label" style={styles.compactActionLabel}>{actionLabel}</AppText><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable> : null}
    </Card>;
  }

  return <Card style={[styles.card, { backgroundColor: isDark ? colors.surfaceElevated : '#F8FBFF' }]} elevated>
    <View style={styles.header}>
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="wallet-outline" size={22} color={colors.primary} /></View>
      <View style={styles.copy}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="caption" muted>{subtitle}</AppText>
      </View>
      <View style={[styles.status, { backgroundColor: paid ? palette.successSoft : `${palette.warning}18` }]}>
        <Ionicons name={paid ? 'checkmark-circle' : 'time'} size={16} color={paid ? palette.success : palette.warning} />
        <AppText variant="caption" style={{ color: paid ? palette.success : palette.warning, fontWeight: '800' }}>{paid ? 'Achitat' : 'Neachitat'}</AppText>
      </View>
    </View>

    <View style={styles.metrics}>
      <Metric mobile={mobile} label="Total de plată" value={money(summary.totalDue)} icon="receipt-outline" color={colors.primary} />
      <Metric mobile={mobile} label="Încasat" value={money(summary.receivedAmount)} icon="checkmark-circle-outline" color={palette.success} />
      <Metric mobile={mobile} label="Rest de plată" value={money(summary.remainingDue)} icon="time-outline" color={summary.remainingDue > 0 ? palette.warning : palette.success} />
      {showInternal ? <Metric mobile={mobile} label="G-Shop Net" value={money(summary.gshopNet)} icon="trending-up-outline" color={summary.gshopNet >= 0 ? palette.purple : palette.danger} /> : null}
    </View>

    <View style={[styles.details, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Detail mobile={mobile} label="Monedă" value={currency} />
      {currency !== 'RON' ? <Detail mobile={mobile} label="Curs către RON" value={`1 ${currency} = ${financials.exchangeRateToRon} RON`} /> : null}
      <Detail mobile={mobile} label="Preț lucrare" value={money(financials.workPrice)} />
      <Detail mobile={mobile} label="Diagnosticare" value={money(financials.diagnosticFee)} />
      <Detail mobile={mobile} label="Avans" value={money(financials.advancePaid)} />
      <Detail mobile={mobile} label="Reducere" value={`${financials.discountPercent}%`} />
      <Detail mobile={mobile} label="Piese afișate în fișă" value={money(financials.displayedPartsCost)} />
      <Detail mobile={mobile} label="Manoperă afișată în fișă" value={money(financials.displayedLaborCost)} />
      {showInternal ? <>
        <Detail mobile={mobile} label="Cost efectiv piese (intern)" value={money(financials.actualPartsCost)} />
        <Detail mobile={mobile} label="Cheltuieli efective (intern)" value={money(summary.additionalExpenses)} />
        <Detail mobile={mobile} label="Comision colaborator" value={money(summary.collaboratorCost)} />
      </> : null}
    </View>

    {onAction && actionLabel ? <Button compact variant="outline" label={actionLabel} icon={actionIcon} onPress={onAction} style={styles.action} /> : null}
  </Card>;
}

function Metric({ label, value, icon, color, mobile }: { label: string; value: string; icon: IconName; color: string; mobile: boolean }) {
  const { colors } = useAppTheme();
  return <View style={[styles.metric, mobile && styles.metricMobile, { borderColor: colors.border, backgroundColor: colors.surface }]}>
    <View style={[styles.metricIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={18} color={color} /></View>
    <View style={styles.copy}><AppText variant="caption" muted>{label}</AppText><AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ color }}>{value}</AppText></View>
  </View>;
}

function Detail({ label, value, mobile }: { label: string; value: string; mobile: boolean }) {
  return <View style={[styles.detail, mobile && styles.detailMobile]}><AppText variant="caption" muted>{label}</AppText><AppText variant="label">{value}</AppText></View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg, overflow: 'hidden' },
  compactCard: { padding: spacing.md, gap: spacing.md, overflow: 'hidden' },
  compactHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compactIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  compactCopy: { flex: 1, minWidth: 0, gap: 1 },
  compactStatus: { minHeight: 30, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  compactBalanceRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  compactBalance: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 2 },
  compactNet: { width: 104, minWidth: 0, borderRadius: radius.md, padding: spacing.sm, justifyContent: 'center', gap: 2 },
  progressBlock: { gap: 6 },
  progressTrack: { height: 7, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  progressMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  progressMetaStart: { minWidth: 0, flex: 1 },
  progressMetaEnd: { minWidth: 0, flex: 1, textAlign: 'right' },
  compactAction: { minHeight: 46, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compactActionIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  compactActionLabel: { flex: 1 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 160, gap: 2 },
  status: { minHeight: 34, borderRadius: radius.pill, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { flex: 1, flexBasis: 135, minWidth: 128, minHeight: 76, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metricMobile: { flexBasis: '46%', minWidth: 0, flexShrink: 1 },
  metricIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  details: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  detail: { flex: 1, flexBasis: 120, minWidth: 110, gap: 3 },
  detailMobile: { flexBasis: '46%', minWidth: 0, flexShrink: 1 },
  action: { alignSelf: 'flex-start' },
  loadingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  loadingMetric: { flex: 1, flexBasis: 135, minWidth: 128, height: 76, borderRadius: radius.md, opacity: 0.7 },
  loadingMetricMobile: { flexBasis: '46%', minWidth: 0, flexShrink: 1 },
});
