import { FinanceNumberField } from '@/components/clients/finance/FinanceNumberField';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { EstimatedCosts } from '@/types';
import { calculateEstimatedCosts } from '@/utils/estimated-costs';
import { formatFinanceMoney } from '@/utils/client-finance';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

type Props = {
  value: EstimatedCosts;
  estimatedRepairDays: string;
  onChange: (value: EstimatedCosts) => void;
  onEstimatedRepairDaysChange: (value: string) => void;
  description?: string;
};

export function IntakeEstimateSection({ value, estimatedRepairDays, onChange, onEstimatedRepairDaysChange, description }: Props) {
  const { colors } = useAppTheme();
  const update = (patch: Partial<EstimatedCosts>) => onChange(calculateEstimatedCosts({ ...value, ...patch }));
  const currency = value.currencyCode || 'RON';

  return <Card style={styles.card} elevated>
    <View style={styles.header}>
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="calculator-outline" size={23} color={colors.primary} /></View>
      <View style={styles.headerCopy}>
        <AppText variant="title">Costuri și termen estimativ</AppText>
        <AppText variant="caption" muted>{description ?? 'Valorile sunt salvate în fișa de intrare și rămân neschimbate când actualizezi ulterior finanțele sau devizul.'}</AppText>
      </View>
    </View>

    <View style={[styles.term, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
      <View style={[styles.termIcon, { backgroundColor: `${palette.purple}16` }]}><Ionicons name="calendar-outline" size={20} color={palette.purple} /></View>
      <View style={styles.termCopy}><AppText variant="label">Termenul din fișa de intrare</AppText><AppText variant="caption" muted>Număr de zile lucrătoare comunicat clientului.</AppText></View>
      <View style={styles.termField}><Input label="Zile lucrătoare *" value={estimatedRepairDays} keyboardType="number-pad" inputMode="numeric" onChangeText={(text) => onEstimatedRepairDaysChange(text.replace(/\D/g, '').slice(0, 3))} placeholder="ex. 3" /></View>
    </View>

    <View style={styles.grid}>
      <FinanceNumberField label={`Diagnostic (${currency})`} value={value.diagnosticFee} onChange={(diagnosticFee) => update({ diagnosticFee })} style={styles.field} />
      <FinanceNumberField label={`Piese estimate (${currency})`} value={value.partsCost} onChange={(partsCost) => update({ partsCost })} style={styles.field} />
      <FinanceNumberField label={`Manoperă estimată (${currency})`} value={value.laborCost} onChange={(laborCost) => update({ laborCost })} style={styles.field} />
      <FinanceNumberField label={`Avans (${currency})`} value={value.advancePaid} onChange={(advancePaid) => update({ advancePaid })} style={styles.field} />
      <FinanceNumberField label="Reducere" value={value.discountPercent} onChange={(discountPercent) => update({ discountPercent: Math.min(100, discountPercent) })} percentage style={styles.field} />
      <View style={styles.field}><Input label="Monedă" value={currency} autoCapitalize="characters" maxLength={3} onChangeText={(currencyCode) => update({ currencyCode: currencyCode.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) })} placeholder="RON" /></View>
    </View>

    <View style={styles.metrics}>
      <Metric label="TOTAL ESTIMAT" value={formatFinanceMoney(value.totalDue, currency)} color={colors.primary} icon="wallet-outline" />
      <Metric label="AVANS" value={formatFinanceMoney(value.receivedAmount, currency)} color={palette.success} icon="checkmark-circle-outline" />
      <Metric label="REST ESTIMAT" value={formatFinanceMoney(value.remainingDue, currency)} color={value.remainingDue > 0 ? palette.warning : palette.success} icon="time-outline" />
    </View>
  </Card>;
}

function Metric({ label, value, color, icon }: { label: string; value: string; color: string; icon: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useAppTheme();
  return <View style={[styles.metric, { borderColor: `${color}55`, backgroundColor: colors.surfaceMuted }]}><View style={[styles.metricIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={18} color={color} /></View><View style={styles.headerCopy}><AppText variant="caption" muted>{label}</AppText><AppText variant="heading" style={{ color }}>{value}</AppText></View></View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  term: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  termIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  termCopy: { flex: 1, minWidth: 180, gap: 2 },
  termField: { minWidth: 190, flexBasis: 220 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { minWidth: 190, flexGrow: 1, flexBasis: '30%' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { minWidth: 190, flex: 1, minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  metricIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
