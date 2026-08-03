import { CurrencyPickerModal } from '@/components/clients/finance/CurrencyPickerModal';
import { ExpenseEditorModal, ExpenseInput } from '@/components/clients/finance/ExpenseEditorModal';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { FinanceNumberField } from '@/components/clients/finance/FinanceNumberField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DEFAULT_CURRENCY_CODE, findCurrency } from '@/constants/currencies';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { CommissionType } from '@/types';
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
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

export type ClientFinanceSectionProps = {
  value: ClientFinanceValue;
  expenses: readonly ClientFinanceExpense[];
  collaboratorCost?: number;
  collaboratorPaid?: number;
  commissionType?: CommissionType;
  commissionValue?: number;
  disabled?: boolean;
  saving?: boolean;
  onChange: (value: ClientFinanceValue) => void;
  onSave?: (value: ClientFinanceValue) => Promise<void> | void;
  onPaymentStatusChange?: (value: ClientFinanceValue) => Promise<void> | void;
  onAddExpense?: (input: ExpenseInput) => Promise<void> | void;
  onUpdateExpense?: (id: string, input: ExpenseInput) => Promise<void> | void;
  onDeleteExpense?: (id: string) => Promise<void> | void;
};

export function ClientFinanceSection({
  value,
  expenses,
  collaboratorCost = 0,
  collaboratorPaid = 0,
  commissionType,
  commissionValue = 0,
  disabled = false,
  saving = false,
  onChange,
  onSave,
  onPaymentStatusChange,
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
  const [deletingExpense, setDeletingExpense] = useState<ClientFinanceExpense | null>(null);
  const [expenseDeleting, setExpenseDeleting] = useState(false);
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
    return calculateClientFinance(normalizedValue, expenses, liveCollaboratorCost, collaboratorPaid);
  }, [collaboratorCost, collaboratorPaid, commissionType, commissionValue, expenses, normalizedValue]);
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
  const updatePaymentStatus = async (next: ClientFinanceValue['paymentStatus']) => {
    if (next === normalizedValue.paymentStatus) return;
    const nextValue = { ...normalizedValue, paymentStatus: next };
    onChange(nextValue);
    if (!onPaymentStatusChange) return;
    setActionError('');
    try {
      await onPaymentStatusChange(nextValue);
    } catch (caught) {
      onChange(normalizedValue);
      setActionError(caught instanceof Error ? caught.message : 'Statusul plății nu a putut fi salvat automat.');
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
    setActionError('');
    setDeletingExpense(expense);
  };

  const confirmExpenseDelete = async () => {
    if (!deletingExpense || !onDeleteExpense || expenseDeleting) return;
    setExpenseDeleting(true);
    setActionError('');
    try {
      await onDeleteExpense(deletingExpense.id);
      setDeletingExpense(null);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Cheltuiala nu a putut fi ștearsă.');
    } finally {
      setExpenseDeleting(false);
    }
  };

  return <View style={[styles.root, mobile && styles.rootMobile]}>
    <Card style={[styles.hero, mobile && styles.cardMobile, { backgroundColor: isDark ? colors.surfaceElevated : '#F8FBFF' }]} elevated>
      <View style={[styles.heroHeader, mobile && styles.heroHeaderMobile]}>
        <View style={[styles.heroIdentity, mobile && styles.heroIdentityMobile]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="wallet-outline" size={25} color={colors.primary} /></View>
          <View style={styles.headerCopy}>
            <AppText variant="title">Finanțele clientului</AppText>
            <AppText variant="caption" muted>Valori, încasări și profitabilitate, într-un singur loc</AppText>
          </View>
        </View>
        <PaymentStatus mobile={mobile} value={normalizedValue.paymentStatus} disabled={disabled || saving} onChange={(next) => void updatePaymentStatus(next)} />
      </View>
      <View style={[styles.metrics, mobile && styles.compactGap]}>
        <FinanceMetric mobile={mobile} icon="receipt-outline" label="Total" value={money(calculations.totalDue)} helper={ronEquivalent(calculations.totalDue)} color={colors.primary} />
        <FinanceMetric mobile={mobile} icon="checkmark-circle-outline" label="Încasat" value={money(calculations.receivedAmount)} helper={ronEquivalent(calculations.receivedAmount)} color={palette.success} />
        <FinanceMetric mobile={mobile} icon="time-outline" label="Rest de plată" value={money(calculations.remainingDue)} helper={ronEquivalent(calculations.remainingDue)} color={calculations.remainingDue > 0 ? palette.warning : palette.success} />
        <FinanceMetric mobile={mobile} icon="trending-up-outline" label="G-Shop Net" value={money(calculations.gshopNet)} helper={ronEquivalent(calculations.gshopNet)} color={calculations.gshopNet >= 0 ? palette.purple : palette.danger} />
      </View>
    </Card>

    <View style={[styles.columns, mobile && styles.columnsMobile]}>
      <Card style={[styles.formCard, !mobile && styles.formCardDesktop, mobile && styles.formCardMobile, mobile && styles.cardMobile]}>
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
          <FinanceNumberField style={[styles.gridField, mobile && styles.gridFieldMobile]} label={`Preț lucrare (${currency.code})`} value={normalizedValue.workPrice} onChange={(next) => update('workPrice', next)} disabled={disabled} helper={mobile ? undefined : 'Valoarea principală a lucrării'} />
          <FinanceNumberField style={[styles.gridField, mobile && styles.gridFieldMobile]} label={`Diagnosticare (${currency.code})`} value={normalizedValue.diagnosticFee} onChange={(next) => update('diagnosticFee', next)} disabled={disabled} />
          <FinanceNumberField style={[styles.gridField, mobile && styles.gridFieldMobile]} label={`Avans încasat (${currency.code})`} value={normalizedValue.advancePaid} onChange={(next) => update('advancePaid', next)} disabled={disabled} helper={!mobile && normalizedValue.paymentStatus === 'PAID' ? 'Statusul Achitat marchează întregul total ca încasat' : undefined} />
          <FinanceNumberField style={[styles.gridField, mobile && styles.gridFieldMobile]} label="Reducere" value={normalizedValue.discountPercent} onChange={(next) => update('discountPercent', next)} disabled={disabled} percentage error={discountInvalid ? 'Reducerea trebuie să fie între 0 și 100%.' : undefined} />
        </View>
        <View style={[styles.calculationStrip, { backgroundColor: colors.surfaceMuted }]}>
          <CalculationLine label="Subtotal" value={money(calculations.subtotal)} />
          <CalculationLine label={`Reducere (${normalizedValue.discountPercent || 0}%)`} value={`− ${money(calculations.discountAmount)}`} muted />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <CalculationLine label="Total client" value={money(calculations.totalDue)} accent />
        </View>
      </Card>

      <Card style={[styles.formCard, !mobile && styles.formCardDesktop, mobile && styles.formCardMobile, mobile && styles.cardMobile]}>
        <SectionTitle icon="construct-outline" color={palette.purple} title="Costuri și defalcare" subtitle="Vizibil pentru echipă; costul efectiv rămâne intern" />
        <FinanceNumberField label={`Cost efectiv piese (${currency.code})`} value={normalizedValue.actualPartsCost} onChange={(next) => update('actualPartsCost', next)} disabled={disabled} helper="Cost intern, scăzut din G-Shop Net" />
        <View style={[styles.internalDivider, { borderTopColor: colors.border }]}>
          <AppText variant="label">Defalcare afișată în fișa de service</AppText>
          <AppText variant="caption" muted>Informativă: nu se adună din nou la total.</AppText>
        </View>
        <View style={[styles.fieldGrid, mobile && styles.compactGap]}>
          <FinanceNumberField style={[styles.gridField, mobile && styles.gridFieldMobile]} label={`Piese afișate (${currency.code})`} value={normalizedValue.displayedPartsCost} onChange={(next) => update('displayedPartsCost', next)} disabled={disabled} />
          <FinanceNumberField style={[styles.gridField, mobile && styles.gridFieldMobile]} label={`Manoperă afișată (${currency.code})`} value={normalizedValue.displayedLaborCost} onChange={(next) => update('displayedLaborCost', next)} disabled={disabled} />
        </View>
        {breakdownDiffers ? <View style={[styles.notice, { backgroundColor: `${palette.warning}13`, borderColor: `${palette.warning}50` }]}>
          <Ionicons name="information-circle-outline" size={20} color={palette.warning} />
          <AppText variant="caption" style={{ flex: 1 }}>Defalcarea piese + manoperă diferă de prețul lucrării cu {money(Math.abs(calculations.displayedBreakdownDifference))}. Poți salva; valorile sunt informative.</AppText>
        </View> : <View style={[styles.notice, { backgroundColor: `${palette.success}10`, borderColor: `${palette.success}40` }]}><Ionicons name="checkmark-circle-outline" size={20} color={palette.success} /><AppText variant="caption" style={{ color: palette.success, flex: 1 }}>Defalcarea corespunde prețului lucrării.</AppText></View>}
        <View style={[styles.netBreakdown, { borderColor: colors.border }]}>
          <CalculationLine label="Încasat" value={money(calculations.receivedAmount)} />
          <CalculationLine label="Cost efectiv piese" value={`− ${money(normalizedValue.actualPartsCost)}`} muted />
          <CalculationLine label="Cheltuieli suplimentare" value={`− ${money(calculations.additionalExpenses)}`} muted />
          <CalculationLine label="Comision colaborator achitat" value={`− ${money(calculations.collaboratorPaid)}`} muted />
          {calculations.collaboratorCost > calculations.collaboratorPaid ? <CalculationLine label="Comision de achitat (nu se scade încă)" value={money(calculations.collaboratorCost - calculations.collaboratorPaid)} muted /> : null}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <CalculationLine label="G-Shop Net" value={money(calculations.gshopNet)} accent />
        </View>
      </Card>
    </View>

    <Card style={[styles.formCard, !mobile && styles.formCardDesktop, mobile && styles.formCardMobile, mobile && styles.cardMobile]}>
      <View style={styles.sectionHeaderRow}>
        <SectionTitle icon="receipt-outline" color={palette.warning} title="Cheltuieli suplimentare" subtitle="Costuri interne scăzute din profitul G-Shop" />
        {onAddExpense && !disabled ? <Button compact variant="outline" label="Adaugă" icon="add" onPress={() => { setEditingExpense(null); setExpenseOpen(true); }} /> : null}
      </View>
      {expenses.length ? <View style={styles.expenseList}>{expenses.map((expense) => <View key={expense.id} style={[styles.expenseRow, mobile && styles.expenseRowMobile, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.expenseIcon, { backgroundColor: `${palette.warning}18` }]}><Ionicons name="receipt-outline" size={19} color={palette.warning} /></View>
        <View style={styles.headerCopy}><AppText variant="label">{expense.description}</AppText><AppText variant="caption" muted>{expense.updatedAt || expense.createdAt ? formatDate(expense.updatedAt ?? expense.createdAt, true) : 'Cheltuială internă'}</AppText></View>
        <AppText variant="heading">{money(expense.amount)}</AppText>
        {!disabled && onUpdateExpense ? <Pressable accessibilityLabel={`Editează ${expense.description}`} onPress={() => { setEditingExpense(expense); setExpenseOpen(true); }} style={styles.iconButton}><Ionicons name="create-outline" size={19} color={colors.primary} /></Pressable> : null}
        {!disabled && onDeleteExpense ? <Pressable accessibilityLabel={`Șterge ${expense.description}`} onPress={() => requestExpenseDelete(expense)} style={styles.iconButton}><Ionicons name="trash-outline" size={19} color={palette.danger} /></Pressable> : null}
      </View>)}</View> : <EmptyBlock icon="receipt-outline" title="Nicio cheltuială suplimentară" description="Costurile adăugate aici vor fi incluse automat în calculul G-Shop Net." />}
      <View style={[styles.expenseTotal, { borderTopColor: colors.border }]}><AppText variant="label" muted>Total cheltuieli</AppText><AppText variant="heading" style={{ color: palette.warning }}>{money(calculations.additionalExpenses)}</AppText></View>
    </Card>

    <Card style={[styles.formCard, mobile && styles.cardMobile]} elevated>
      <SectionTitle icon="calculator-outline" color={colors.primary} title="Calcul total" subtitle="Rezultatul final după completarea tuturor valorilor" />
      <View style={[styles.calculationStrip, { backgroundColor: colors.surfaceMuted }]}>
        <CalculationLine label="Total client" value={money(calculations.totalDue)} />
        <CalculationLine label="Încasat" value={money(calculations.receivedAmount)} />
        <CalculationLine label="Costuri interne totale" value={`− ${money(calculations.internalCosts)}`} muted />
        <CalculationLine label="Comision colaborator achitat" value={`− ${money(calculations.collaboratorPaid)}`} muted />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <CalculationLine label="G-Shop Net" value={money(calculations.gshopNet)} accent />
      </View>
    </Card>

    {actionError ? <View style={[styles.error, { backgroundColor: `${palette.danger}12`, borderColor: `${palette.danger}40` }]}><Ionicons name="alert-circle-outline" size={20} color={palette.danger} /><AppText variant="caption" style={{ color: palette.danger, flex: 1 }}>{actionError}</AppText></View> : null}
    {onSave ? <Button
      label="Salvează datele financiare"
      icon="checkmark-circle-outline"
      loading={saving}
      disabled={disabled || exchangeInvalid || discountInvalid}
      onPress={() => void save()}
      style={[styles.saveButton, mobile && styles.saveButtonMobile]}
    /> : null}

    <CurrencyPickerModal visible={currencyOpen} value={currency.code} onClose={() => setCurrencyOpen(false)} onSelect={(code) => onChange({ ...normalizedValue, currencyCode: code, exchangeRateToRon: code === DEFAULT_CURRENCY_CODE ? 1 : normalizedValue.currencyCode === DEFAULT_CURRENCY_CODE ? 0 : normalizedValue.exchangeRateToRon })} />
    <ExpenseEditorModal visible={expenseOpen} currencyCode={currency.code} expense={editingExpense} onClose={() => { setExpenseOpen(false); setEditingExpense(null); }} onSubmit={submitExpense} />
    <Modal visible={Boolean(deletingExpense)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !expenseDeleting && setDeletingExpense(null)}>
      <ModalSafeBottom style={[styles.deleteOverlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityLabel="Închide confirmarea" disabled={expenseDeleting} style={StyleSheet.absoluteFill} onPress={() => setDeletingExpense(null)} />
        {deletingExpense ? <View style={[styles.deleteCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={[styles.deleteIcon, { backgroundColor: isDark ? `${palette.danger}22` : palette.dangerSoft }]}><Ionicons name="trash-outline" size={28} color={palette.danger} /></View>
          <AppText variant="title" style={styles.deleteText}>Ștergi cheltuiala?</AppText>
          <AppText muted style={styles.deleteText}>„{deletingExpense.description}” ({money(deletingExpense.amount)}) va fi eliminată din calculul clientului și din fișa de service.</AppText>
          <View style={styles.deleteActions}>
            <Button variant="outline" label="Anulează" disabled={expenseDeleting} onPress={() => setDeletingExpense(null)} style={styles.deleteAction} />
            <Button variant="danger" label="Șterge" icon="trash-outline" loading={expenseDeleting} onPress={() => void confirmExpenseDelete()} style={styles.deleteAction} />
          </View>
        </View> : null}
      </ModalSafeBottom>
    </Modal>
  </View>;
}

function PaymentStatus({ value, disabled, onChange, mobile }: { value: 'UNPAID' | 'PAID'; disabled: boolean; onChange: (value: 'UNPAID' | 'PAID') => void; mobile: boolean }) {
  const { colors } = useAppTheme();
  return <View style={[styles.statusControl, mobile && styles.statusControlMobile, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
    {(['UNPAID', 'PAID'] as const).map((status) => {
      const active = value === status;
      const tone = status === 'PAID' ? palette.success : palette.warning;
      return <Pressable key={status} disabled={disabled} onPress={() => onChange(status)} style={[styles.statusOption, mobile && styles.statusOptionMobile, active && { backgroundColor: tone }]}>
        <Ionicons name={status === 'PAID' ? 'checkmark-circle-outline' : 'time-outline'} size={16} color={active ? '#fff' : colors.textMuted} />
        <AppText variant="caption" style={{ color: active ? '#fff' : colors.textMuted, fontWeight: '800' }}>{status === 'PAID' ? 'Achitat' : 'Neachitat'}</AppText>
      </Pressable>;
    })}
  </View>;
}

function FinanceMetric({ icon, label, value, helper, color, mobile }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; helper?: string; color: string; mobile: boolean }) {
  const { colors } = useAppTheme();
  return <View style={[styles.metric, mobile && styles.metricMobile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  rootMobile: { width: '100%', alignSelf: 'stretch', gap: spacing.md },
  hero: { gap: spacing.xl, overflow: 'hidden' },
  cardMobile: { padding: spacing.md, gap: spacing.md },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md },
  heroHeaderMobile: { width: '100%', flexDirection: 'column', alignItems: 'stretch', flexWrap: 'nowrap' },
  heroIdentity: { flex: 1, flexBasis: 220, minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIdentityMobile: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0, flexShrink: 1 },
  heroIcon: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: { flexGrow: 1, flexBasis: 130, minWidth: 128, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  metricMobile: { flexBasis: '46%', minWidth: 0, flexShrink: 1 },
  metricIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  statusControl: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, borderWidth: 1 },
  statusControlMobile: { width: '100%', alignSelf: 'stretch' },
  statusOption: { minHeight: 34, borderRadius: radius.pill, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusOptionMobile: { flex: 1, justifyContent: 'center', minWidth: 0 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  columnsMobile: { width: '100%', flexDirection: 'column', flexWrap: 'nowrap', gap: spacing.md },
  formCard: { minWidth: 0, gap: spacing.lg },
  formCardDesktop: { flex: 1, flexBasis: 420 },
  formCardMobile: { width: '100%', alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  sectionTitle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  currencyButton: { minHeight: 62, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  currencyCode: { width: 58, height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridField: { flexGrow: 1, flexBasis: 210, minWidth: 210 },
  gridFieldMobile: { flexBasis: '46%', minWidth: 0, flexShrink: 1 },
  compactGap: { gap: spacing.sm },
  calculationStrip: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  calculationLine: { minHeight: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  divider: { height: StyleSheet.hairlineWidth },
  internalDivider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg, gap: spacing.xs },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  netBreakdown: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  expenseList: { gap: spacing.sm },
  expenseRow: { minHeight: 66, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  expenseRowMobile: { flexWrap: 'wrap' },
  expenseIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  expenseTotal: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empty: { borderRadius: radius.md, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emptyCopy: { flex: 1, gap: spacing.xs },
  error: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveButton: { alignSelf: 'flex-end', minWidth: 250 },
  saveButtonMobile: { width: '100%', minWidth: 0, alignSelf: 'stretch' },
  deleteOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  deleteCard: { width: '100%', maxWidth: 460, borderWidth: 1, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', gap: spacing.lg, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 28, elevation: 16 },
  deleteIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  deleteText: { textAlign: 'center' },
  deleteActions: { width: '100%', flexDirection: 'row', gap: spacing.md },
  deleteAction: { flex: 1, minWidth: 0 },
});
