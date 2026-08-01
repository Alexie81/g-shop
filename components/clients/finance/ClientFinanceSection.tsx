import { CurrencyPickerModal } from '@/components/clients/finance/CurrencyPickerModal';
import { ExpenseEditorModal, ExpenseInput } from '@/components/clients/finance/ExpenseEditorModal';
import { FinanceNumberField } from '@/components/clients/finance/FinanceNumberField';
import { ClientAuditHistory } from '@/components/clients/ClientAuditHistory';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DEFAULT_CURRENCY_CODE, findCurrency } from '@/constants/currencies';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { AuditLog, CommissionType } from '@/types';
import {
  calculateClientFinance,
  ClientFinanceExpense,
  ClientFinanceValue,
  formatFinanceMoney,
  toRon,
} from '@/utils/client-finance';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

export type ClientFinanceSectionProps = {
  value: ClientFinanceValue;
  expenses: readonly ClientFinanceExpense[];
  collaboratorCost?: number;
  commissionType?: CommissionType;
  commissionValue?: number;
  history?: readonly AuditLog[];
  isAdmin: boolean;
  disabled?: boolean;
  saving?: boolean;
  historyLoading?: boolean;
  onChange: (value: ClientFinanceValue) => void;
  onSave?: (value: ClientFinanceValue) => Promise<void> | void;
  onAddExpense?: (input: ExpenseInput) => Promise<void> | void;
  onUpdateExpense?: (id: string, input: ExpenseInput) => Promise<void> | void;
  onDeleteExpense?: (id: string) => Promise<void> | void;
};

export function ClientFinanceSection({
  value,
  expenses,
  collaboratorCost = 0,
  commissionType,
  commissionValue = 0,
  history,
  isAdmin,
  disabled = false,
  saving = false,
  historyLoading = false,
  onChange,
  onSave,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
}: ClientFinanceSectionProps) {
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 600;
  const normalizedValue = useMemo<ClientFinanceValue>(() => ({
    ...value,
    currencyCode: value.currencyCode || DEFAULT_CURRENCY_CODE,
    exchangeRateToRon: value.currencyCode === DEFAULT_CURRENCY_CODE || !value.currencyCode ? 1 : value.exchangeRateToRon,
  }), [value]);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ClientFinanceExpense | null>(null);
  const [actionError, setActionError] = useState('');
  const calculations = useMemo(() => {
    const beforeCommission = calculateClientFinance(normalizedValue, expenses, 0);
    const rateOrAmount = Math.max(0, commissionValue);
    const liveCollaboratorCost = commissionType === 'PERCENT_TOTAL'
      ? beforeCommission.totalDue * rateOrAmount / 100
      : commissionType === 'PERCENT_NET'
        ? Math.max(0, beforeCommission.totalDue - beforeCommission.internalCosts) * rateOrAmount / 100
        : commissionType === 'FIXED'
          ? rateOrAmount
          : collaboratorCost;
    return calculateClientFinance(normalizedValue, expenses, liveCollaboratorCost);
  }, [collaboratorCost, commissionType, commissionValue, expenses, normalizedValue]);
  const currency = findCurrency(normalizedValue.currencyCode);
  const usesConversion = currency.code !== DEFAULT_CURRENCY_CODE;
  const exchangeInvalid = usesConversion && normalizedValue.exchangeRateToRon <= 0;
  const discountInvalid = normalizedValue.discountPercent < 0 || normalizedValue.discountPercent > 100;
  const breakdownDiffers = Math.abs(calculations.displayedBreakdownDifference) >= 0.01;

  const update = <K extends keyof ClientFinanceValue>(key: K, next: ClientFinanceValue[K]) => onChange({ ...normalizedValue, [key]: next });
  const money = (amount: number) => formatFinanceMoney(amount, currency.code);
  const ronEquivalent = (amount: number) => usesConversion
    ? `≈ ${formatFinanceMoney(toRon(amount, currency.code, normalizedValue.exchangeRateToRon), DEFAULT_CURRENCY_CODE)}`
    : undefined;

  const save = async () => {
    if (!onSave || exchangeInvalid || discountInvalid) return;
    setActionError('');
    try {
      await onSave(normalizedValue);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Datele financiare nu au putut fi salvate.');
    }
  };

  const submitExpense = async (input: ExpenseInput) => {
    if (editingExpense) {
      if (!onUpdateExpense) throw new Error('Editarea cheltuielilor nu este disponibilă.');
      await onUpdateExpense(editingExpense.id, input);
      return;
    }
    if (!onAddExpense) throw new Error('Adăugarea cheltuielilor nu este disponibilă.');
    await onAddExpense(input);
  };

  const requestExpenseDelete = (expense: ClientFinanceExpense) => {
    if (!onDeleteExpense) return;
    Alert.alert(
      'Ștergi cheltuiala?',
      `„${expense.description}” (${money(expense.amount)}) va fi eliminată definitiv din calculul clientului.`,
      [
        { text: 'Anulează', style: 'cancel' },
        {
          text: 'Șterge',
          style: 'destructive',
          onPress: () => void Promise.resolve(onDeleteExpense(expense.id)).catch((caught: unknown) => setActionError(caught instanceof Error ? caught.message : 'Cheltuiala nu a putut fi ștearsă.')),
        },
      ],
    );
  };

  return <View style={[styles.root, mobile && styles.rootMobile]}>
    <Card style={[styles.hero, mobile && styles.cardMobile, { backgroundColor: isDark ? colors.surfaceElevated : '#F8FBFF' }]} elevated>
      <View style={styles.heroHeader}>
        <View style={styles.heroIdentity}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="wallet-outline" size={25} color={colors.primary} /></View>
          <View style={styles.headerCopy}>
            <AppText variant="title">Finanțele clientului</AppText>
            <AppText variant="caption" muted>Valori, încasări și profitabilitate, într-un singur loc</AppText>
          </View>
        </View>
        <PaymentStatus value={normalizedValue.paymentStatus} disabled={disabled} onChange={(next) => update('paymentStatus', next)} />
      </View>
      <View style={[styles.metrics, mobile && styles.compactGap]}>
        <FinanceMetric icon="receipt-outline" label="Total" value={money(calculations.totalDue)} helper={ronEquivalent(calculations.totalDue)} color={colors.primary} />
        <FinanceMetric icon="checkmark-circle-outline" label="Încasat" value={money(calculations.receivedAmount)} helper={ronEquivalent(calculations.receivedAmount)} color={palette.success} />
        <FinanceMetric icon="time-outline" label="Rest de plată" value={money(calculations.remainingDue)} helper={ronEquivalent(calculations.remainingDue)} color={calculations.remainingDue > 0 ? palette.warning : palette.success} />
        <FinanceMetric icon="trending-up-outline" label="G-Shop Net" value={money(calculations.gshopNet)} helper={ronEquivalent(calculations.gshopNet)} color={calculations.gshopNet >= 0 ? palette.purple : palette.danger} />
      </View>
    </Card>

    <View style={styles.columns}>
      <Card style={[styles.formCard, mobile && styles.cardMobile]}>
        <SectionTitle icon="cash-outline" color={colors.primary} title="Valori comerciale" subtitle="Sumele comunicate și încasate de la client" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Monedă, ${currency.code}`}
          disabled={disabled}
          onPress={() => setCurrencyOpen(true)}
          style={({ pressed }) => [styles.currencyButton, { borderColor: colors.border, backgroundColor: pressed ? colors.primarySoft : colors.input, opacity: disabled ? 0.55 : 1 }]}
        >
          <View style={[styles.currencyCode, { backgroundColor: colors.primary }]}><AppText variant="label" style={{ color: '#fff' }}>{currency.code}</AppText></View>
          <View style={styles.headerCopy}><AppText variant="caption" muted>Moneda clientului</AppText><AppText variant="label">{currency.name}</AppText></View>
          <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
        </Pressable>
        {usesConversion ? <FinanceNumberField
          label={`Curs ${currency.code} către RON`}
          value={normalizedValue.exchangeRateToRon}
          onChange={(next) => update('exchangeRateToRon', next)}
          helper={`1 ${currency.code} = ${normalizedValue.exchangeRateToRon || 0} RON`}
          error={exchangeInvalid ? 'Introdu un curs mai mare decât zero.' : undefined}
          disabled={disabled}
        /> : null}
        <View style={[styles.fieldGrid, mobile && styles.compactGap]}>
          <FinanceNumberField style={styles.gridField} label={`Preț lucrare (${currency.code})`} value={normalizedValue.workPrice} onChange={(next) => update('workPrice', next)} disabled={disabled} helper={mobile ? undefined : 'Valoarea principală a lucrării'} />
          <FinanceNumberField style={styles.gridField} label={`Diagnosticare (${currency.code})`} value={normalizedValue.diagnosticFee} onChange={(next) => update('diagnosticFee', next)} disabled={disabled} />
          <FinanceNumberField style={styles.gridField} label={`Avans încasat (${currency.code})`} value={normalizedValue.advancePaid} onChange={(next) => update('advancePaid', next)} disabled={disabled} helper={!mobile && normalizedValue.paymentStatus === 'PAID' ? 'Statusul Achitat marchează întregul total ca încasat' : undefined} />
          <FinanceNumberField style={styles.gridField} label="Reducere" value={normalizedValue.discountPercent} onChange={(next) => update('discountPercent', next)} disabled={disabled} percentage error={discountInvalid ? 'Reducerea trebuie să fie între 0 și 100%.' : undefined} />
        </View>
        <View style={[styles.calculationStrip, { backgroundColor: colors.surfaceMuted }]}>
          <CalculationLine label="Subtotal" value={money(calculations.subtotal)} />
          <CalculationLine label={`Reducere (${normalizedValue.discountPercent || 0}%)`} value={`− ${money(calculations.discountAmount)}`} muted />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <CalculationLine label="Total client" value={money(calculations.totalDue)} accent />
        </View>
      </Card>

      <Card style={[styles.formCard, mobile && styles.cardMobile]}>
        <SectionTitle icon="construct-outline" color={palette.purple} title="Costuri și defalcare" subtitle="Vizibil pentru echipă; costul efectiv rămâne intern" />
        <FinanceNumberField label={`Cost efectiv piese (${currency.code})`} value={normalizedValue.actualPartsCost} onChange={(next) => update('actualPartsCost', next)} disabled={disabled} helper="Cost intern, scăzut din G-Shop Net" />
        <View style={[styles.internalDivider, { borderTopColor: colors.border }]}>
          <AppText variant="label">Defalcare afișată în fișa de service</AppText>
          <AppText variant="caption" muted>Informativă: nu se adună din nou la total.</AppText>
        </View>
        <View style={[styles.fieldGrid, mobile && styles.compactGap]}>
          <FinanceNumberField style={styles.gridField} label={`Piese afișate (${currency.code})`} value={normalizedValue.displayedPartsCost} onChange={(next) => update('displayedPartsCost', next)} disabled={disabled} />
          <FinanceNumberField style={styles.gridField} label={`Manoperă afișată (${currency.code})`} value={normalizedValue.displayedLaborCost} onChange={(next) => update('displayedLaborCost', next)} disabled={disabled} />
        </View>
        {breakdownDiffers ? <View style={[styles.notice, { backgroundColor: `${palette.warning}13`, borderColor: `${palette.warning}50` }]}>
          <Ionicons name="information-circle-outline" size={20} color={palette.warning} />
          <AppText variant="caption" style={{ flex: 1 }}>Defalcarea piese + manoperă diferă de prețul lucrării cu {money(Math.abs(calculations.displayedBreakdownDifference))}. Poți salva; valorile sunt informative.</AppText>
        </View> : <View style={[styles.notice, { backgroundColor: `${palette.success}10`, borderColor: `${palette.success}40` }]}><Ionicons name="checkmark-circle-outline" size={20} color={palette.success} /><AppText variant="caption" style={{ color: palette.success, flex: 1 }}>Defalcarea corespunde prețului lucrării.</AppText></View>}
        <View style={[styles.netBreakdown, { borderColor: colors.border }]}>
          <CalculationLine label="Total client" value={money(calculations.totalDue)} />
          <CalculationLine label="Cost efectiv piese" value={`− ${money(normalizedValue.actualPartsCost)}`} muted />
          <CalculationLine label="Cheltuieli suplimentare" value={`− ${money(calculations.additionalExpenses)}`} muted />
          <CalculationLine label="Comision colaborator" value={`− ${money(calculations.collaboratorCost)}`} muted />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <CalculationLine label="G-Shop Net" value={money(calculations.gshopNet)} accent />
        </View>
      </Card>
    </View>

    <Card style={[styles.formCard, mobile && styles.cardMobile]}>
      <View style={styles.sectionHeaderRow}>
        <SectionTitle icon="receipt-outline" color={palette.warning} title="Cheltuieli suplimentare" subtitle="Costuri interne scăzute din profitul G-Shop" />
        {onAddExpense && !disabled ? <Button compact variant="outline" label="Adaugă" icon="add" onPress={() => { setEditingExpense(null); setExpenseOpen(true); }} /> : null}
      </View>
      {expenses.length ? <View style={styles.expenseList}>{expenses.map((expense) => <View key={expense.id} style={[styles.expenseRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.expenseIcon, { backgroundColor: `${palette.warning}18` }]}><Ionicons name="receipt-outline" size={19} color={palette.warning} /></View>
        <View style={styles.headerCopy}><AppText variant="label">{expense.description}</AppText><AppText variant="caption" muted>{expense.updatedAt || expense.createdAt ? formatDate(expense.updatedAt ?? expense.createdAt, true) : 'Cheltuială internă'}</AppText></View>
        <AppText variant="heading">{money(expense.amount)}</AppText>
        {!disabled && onUpdateExpense ? <Pressable accessibilityLabel={`Editează ${expense.description}`} onPress={() => { setEditingExpense(expense); setExpenseOpen(true); }} style={styles.iconButton}><Ionicons name="create-outline" size={19} color={colors.primary} /></Pressable> : null}
        {!disabled && onDeleteExpense ? <Pressable accessibilityLabel={`Șterge ${expense.description}`} onPress={() => requestExpenseDelete(expense)} style={styles.iconButton}><Ionicons name="trash-outline" size={19} color={palette.danger} /></Pressable> : null}
      </View>)}</View> : <EmptyBlock icon="receipt-outline" title="Nicio cheltuială suplimentară" description="Costurile adăugate aici vor fi incluse automat în calculul G-Shop Net." />}
      <View style={[styles.expenseTotal, { borderTopColor: colors.border }]}><AppText variant="label" muted>Total cheltuieli</AppText><AppText variant="heading" style={{ color: palette.warning }}>{money(calculations.additionalExpenses)}</AppText></View>
    </Card>

    {actionError ? <View style={[styles.error, { backgroundColor: `${palette.danger}12`, borderColor: `${palette.danger}40` }]}><Ionicons name="alert-circle-outline" size={20} color={palette.danger} /><AppText variant="caption" style={{ color: palette.danger, flex: 1 }}>{actionError}</AppText></View> : null}
    {onSave ? <Button
      label="Salvează datele financiare"
      icon="checkmark-circle-outline"
      loading={saving}
      disabled={disabled || exchangeInvalid || discountInvalid}
      onPress={() => void save()}
      style={styles.saveButton}
    /> : null}

    {isAdmin ? <View style={styles.historyArea}>
      <Card style={[styles.formCard, mobile && styles.cardMobile]}>
        <SectionTitle icon="time-outline" color={palette.purple} title="Istoric client" subtitle="Cine a făcut modificarea, ce a schimbat și momentul exact" />
        {historyLoading ? <LoadingRows /> : <ClientAuditHistory items={history ?? []} compact limit={30} />}
      </Card>
    </View> : null}

    <CurrencyPickerModal visible={currencyOpen} value={currency.code} onClose={() => setCurrencyOpen(false)} onSelect={(code) => onChange({ ...normalizedValue, currencyCode: code, exchangeRateToRon: code === DEFAULT_CURRENCY_CODE ? 1 : normalizedValue.currencyCode === DEFAULT_CURRENCY_CODE ? 0 : normalizedValue.exchangeRateToRon })} />
    <ExpenseEditorModal visible={expenseOpen} currencyCode={currency.code} expense={editingExpense} onClose={() => { setExpenseOpen(false); setEditingExpense(null); }} onSubmit={submitExpense} />
  </View>;
}

function PaymentStatus({ value, disabled, onChange }: { value: 'UNPAID' | 'PAID'; disabled: boolean; onChange: (value: 'UNPAID' | 'PAID') => void }) {
  const { colors } = useAppTheme();
  return <View style={[styles.statusControl, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
    {(['UNPAID', 'PAID'] as const).map((status) => {
      const active = value === status;
      const tone = status === 'PAID' ? palette.success : palette.warning;
      return <Pressable key={status} disabled={disabled} onPress={() => onChange(status)} style={[styles.statusOption, active && { backgroundColor: tone }]}>
        <Ionicons name={status === 'PAID' ? 'checkmark-circle-outline' : 'time-outline'} size={16} color={active ? '#fff' : colors.textMuted} />
        <AppText variant="caption" style={{ color: active ? '#fff' : colors.textMuted, fontWeight: '800' }}>{status === 'PAID' ? 'Achitat' : 'Neachitat'}</AppText>
      </Pressable>;
    })}
  </View>;
}

function FinanceMetric({ icon, label, value, helper, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; helper?: string; color: string }) {
  const { colors } = useAppTheme();
  return <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={[styles.metricIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={19} color={color} /></View>
    <AppText variant="caption" muted>{label}</AppText>
    <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ color }}>{value}</AppText>
    {helper ? <AppText variant="caption" muted numberOfLines={1}>{helper}</AppText> : null}
  </View>;
}

function SectionTitle({ icon, color, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; subtitle: string }) {
  return <View style={styles.sectionTitle}><View style={[styles.sectionIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={20} color={color} /></View><View style={styles.headerCopy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>{subtitle}</AppText></View></View>;
}

function CalculationLine({ label, value, muted, accent }: { label: string; value: string; muted?: boolean; accent?: boolean }) {
  const { colors } = useAppTheme();
  return <View style={styles.calculationLine}><AppText variant={accent ? 'label' : 'caption'} muted={muted}>{label}</AppText><AppText variant={accent ? 'heading' : 'label'} style={accent ? { color: colors.primary } : undefined}>{value}</AppText></View>;
}

function EmptyBlock({ icon, title, description }: { icon: keyof typeof Ionicons.glyphMap; title: string; description: string }) {
  const { colors } = useAppTheme();
  return <View style={[styles.empty, { backgroundColor: colors.surfaceMuted }]}><Ionicons name={icon} size={30} color={colors.textMuted} /><View style={styles.emptyCopy}><AppText variant="label">{title}</AppText><AppText variant="caption" muted>{description}</AppText></View></View>;
}

function LoadingRows() {
  const { colors } = useAppTheme();
  return <View style={styles.loadingRows}>{[0, 1, 2].map((item) => <View key={item} style={[styles.loadingRow, { backgroundColor: colors.surfaceMuted }]} />)}</View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  rootMobile: { gap: spacing.md },
  hero: { gap: spacing.xl, overflow: 'hidden' },
  cardMobile: { padding: spacing.md, gap: spacing.md },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md },
  heroIdentity: { flex: 1, flexBasis: 220, minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: { flexGrow: 1, flexBasis: 130, minWidth: 128, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  metricIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  statusControl: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, borderWidth: 1 },
  statusOption: { minHeight: 34, borderRadius: radius.pill, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 5 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  formCard: { flex: 1, flexBasis: 420, minWidth: 0, gap: spacing.lg },
  sectionTitle: { flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  currencyButton: { minHeight: 62, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  currencyCode: { width: 58, height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridField: { flexGrow: 1, flexBasis: 135, minWidth: 128 },
  compactGap: { gap: spacing.sm },
  calculationStrip: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  calculationLine: { minHeight: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  divider: { height: StyleSheet.hairlineWidth },
  internalDivider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg, gap: spacing.xs },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  netBreakdown: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  expenseList: { gap: spacing.sm },
  expenseRow: { minHeight: 66, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  expenseIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  expenseTotal: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empty: { borderRadius: radius.md, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emptyCopy: { flex: 1, gap: spacing.xs },
  error: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveButton: { alignSelf: 'flex-end', minWidth: 250 },
  historyArea: { marginTop: spacing.lg },
  loadingRows: { gap: spacing.sm },
  loadingRow: { height: 64, borderRadius: radius.md, opacity: 0.65 },
});
