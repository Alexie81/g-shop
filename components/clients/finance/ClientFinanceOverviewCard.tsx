import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { ClientFinancialOverview } from '@/types';
import { formatFinanceMoney } from '@/utils/client-finance';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  overview?: ClientFinancialOverview | null;
  loading?: boolean;
  title?: string;
  subtitle?: string;
  showInternal?: boolean;
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
  actionLabel,
  actionIcon = 'arrow-forward-outline',
  onAction,
}: Props) {
  const { colors, isDark } = useAppTheme();

  if (loading) {
    return <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="wallet-outline" size={22} color={colors.primary} /></View>
        <View style={styles.copy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>Se încarcă valorile financiare…</AppText></View>
      </View>
      <View style={styles.loadingGrid}>{[0, 1, 2, 3].map((item) => <View key={item} style={[styles.loadingMetric, { backgroundColor: colors.surfaceMuted }]} />)}</View>
    </Card>;
  }

  if (!overview) return null;

  const { financials, summary } = overview;
  const currency = financials.currencyCode || 'RON';
  const money = (value: number) => formatFinanceMoney(value, currency);
  const paid = financials.paymentStatus === 'PAID';

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
      <Metric label="Total de plată" value={money(summary.totalDue)} icon="receipt-outline" color={colors.primary} />
      <Metric label="Încasat" value={money(summary.receivedAmount)} icon="checkmark-circle-outline" color={palette.success} />
      <Metric label="Rest de plată" value={money(summary.remainingDue)} icon="time-outline" color={summary.remainingDue > 0 ? palette.warning : palette.success} />
      {showInternal ? <Metric label="G-Shop Net" value={money(summary.gshopNet)} icon="trending-up-outline" color={summary.gshopNet >= 0 ? palette.purple : palette.danger} /> : null}
    </View>

    <View style={[styles.details, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Detail label="Monedă" value={currency} />
      {currency !== 'RON' ? <Detail label="Curs către RON" value={`1 ${currency} = ${financials.exchangeRateToRon} RON`} /> : null}
      <Detail label="Preț lucrare" value={money(financials.workPrice)} />
      <Detail label="Diagnosticare" value={money(financials.diagnosticFee)} />
      <Detail label="Avans" value={money(financials.advancePaid)} />
      <Detail label="Reducere" value={`${financials.discountPercent}%`} />
      <Detail label="Piese afișate în fișă" value={money(financials.displayedPartsCost)} />
      <Detail label="Manoperă afișată în fișă" value={money(financials.displayedLaborCost)} />
      {showInternal ? <>
        <Detail label="Cost efectiv piese (intern)" value={money(financials.actualPartsCost)} />
        <Detail label="Cheltuieli efective (intern)" value={money(summary.additionalExpenses)} />
        <Detail label="Comision colaborator" value={money(summary.collaboratorCost)} />
      </> : null}
    </View>

    {onAction && actionLabel ? <Button compact variant="outline" label={actionLabel} icon={actionIcon} onPress={onAction} style={styles.action} /> : null}
  </Card>;
}

function Metric({ label, value, icon, color }: { label: string; value: string; icon: IconName; color: string }) {
  const { colors } = useAppTheme();
  return <View style={[styles.metric, { borderColor: colors.border, backgroundColor: colors.surface }]}>
    <View style={[styles.metricIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={18} color={color} /></View>
    <View style={styles.copy}><AppText variant="caption" muted>{label}</AppText><AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ color }}>{value}</AppText></View>
  </View>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><AppText variant="caption" muted>{label}</AppText><AppText variant="label">{value}</AppText></View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg, overflow: 'hidden' },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 160, gap: 2 },
  status: { minHeight: 34, borderRadius: radius.pill, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { flex: 1, flexBasis: 135, minWidth: 128, minHeight: 76, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metricIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  details: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  detail: { flex: 1, flexBasis: 120, minWidth: 110, gap: 3 },
  action: { alignSelf: 'flex-start' },
  loadingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  loadingMetric: { flex: 1, flexBasis: 135, minWidth: 128, height: 76, borderRadius: radius.md, opacity: 0.7 },
});
