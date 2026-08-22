import { AppHeader } from '@/components/layout/AppHeader';
import { SalesPaymentStatusControl } from '@/components/sales/SalesPaymentStatusControl';
import { QuickSignatureModal } from '@/components/service-sheets/ScanServiceSheetModal';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { salesSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { SalesPaymentStatus, SalesSheet } from '@/types';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

const paymentLabels = { CASH: 'Numerar', BANK_TRANSFER: 'Transfer bancar', CARD: 'Plată cu cardul' } as const;
const deliveryLabels = { DELIVERY: 'Cu livrare', PICKUP: 'Fără livrare' } as const;
const money = (value: number, currency: string) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const numberValue = (value: string) => { const parsed = Number(value.replace(',', '.')); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; };
type ExpenseDraft = { id: string; name: string; quantity: string; amount: string };

export default function SalesSheetDetailsScreen() {
  const { salesSheetId } = useLocalSearchParams<{ salesSheetId: string }>();
  const { hasPermission } = useAuth();
  const { colors } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const compact = width < 650;
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState('');
  const [expensesEditing, setExpensesEditing] = useState(false);
  const [savingExpenses, setSavingExpenses] = useState(false);
  const [expenseDrafts, setExpenseDrafts] = useState<ExpenseDraft[]>([]);
  const state = useAsyncData<SalesSheet>(() => salesSheetRepository.get(salesSheetId), [salesSheetId]);
  const sheet = state.data;
  useEffect(() => { if (sheet) setPaymentDraft(String(sheet.advancePaid).replace('.', ',')); }, [sheet]);
  if (!hasPermission('sales_sheets.view')) return <Redirect href="/shop/home" />;
  const canViewFinancials = hasPermission('financials.view');
  const canEditPayment = hasPermission('sales_sheets.update');
  const canEditExpenses = canViewFinancials && hasPermission('sales_sheets.update');

  const saveSignature = async (signature: string) => {
    if (!sheet) return;
    setSigning(true);
    try {
      const updated = await salesSheetRepository.saveSignature(sheet.id, signature);
      state.setData(updated);setSignatureOpen(false);
      showToast('Semnătura a fost salvată, iar PDF-ul a fost actualizat.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Semnătura nu a putut fi salvată.', 'error'); }
    finally { setSigning(false); }
  };

  const startExpenseEditing = () => {
    if (!sheet) return;
    setExpenseDrafts((sheet.expenses ?? []).map((expense, index) => ({ id: `${index}-${expense.name}`, name: expense.name, quantity: String(expense.quantity ?? 1).replace('.', ','), amount: String(expense.amount).replace('.', ',') })));
    setExpensesEditing(true);
  };
  const saveExpenses = async () => {
    if (!sheet) return;
    if (expenseDrafts.some((expense) => (expense.name.trim() || expense.amount.trim()) && (!expense.name.trim() || numberValue(expense.quantity) <= 0 || numberValue(expense.amount) <= 0))) return showToast('Completează denumirea, cantitatea și valoarea unitară a fiecărei cheltuieli.', 'error');
    setSavingExpenses(true);
    try {
      const updated = await salesSheetRepository.saveExpenses(sheet.id, expenseDrafts.filter((expense) => expense.name.trim() && numberValue(expense.quantity) > 0 && numberValue(expense.amount) > 0).map((expense) => ({ name: expense.name.trim(), quantity: numberValue(expense.quantity), amount: numberValue(expense.amount) })));
      state.setData(updated);setExpensesEditing(false);showToast('Cheltuielile și suma rămasă pentru G-Shop au fost actualizate.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Cheltuielile nu au putut fi salvate.', 'error'); }
    finally { setSavingExpenses(false); }
  };
  const savePayment = async (paymentStatus: SalesPaymentStatus = sheet?.paymentStatus ?? 'UNPAID') => {
    if (!sheet) return;
    const collected = numberValue(paymentDraft);
    if (collected > sheet.totalPrice) return showToast('Banii încasați nu pot depăși totalul fișei.', 'error');
    setPaymentSaving(true);
    try {
      const updated = await salesSheetRepository.savePayment(sheet.id, paymentStatus, collected);
      state.setData(updated);setPaymentDraft(String(updated.advancePaid).replace('.', ','));
      showToast(paymentStatus === 'PAID' ? 'Fișa a fost marcată achitată și PDF-ul a fost actualizat.' : 'Situația plății și PDF-ul au fost actualizate.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Situația plății nu a putut fi actualizată.', 'error'); }
    finally { setPaymentSaving(false); }
  };

  return <>
    <Screen header={<AppHeader title={sheet?.number ?? 'Fișă de vânzare'} back onBack={() => router.replace('/shop/sales-sheets' as never)} />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
      <View style={styles.stack}>
        {state.loading ? <LoadingState rows={6} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : sheet ? <>
          <Card style={styles.hero} elevated>
            <View style={[styles.heroIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={29} color={colors.primary} /></View>
            <View style={styles.copy}><View style={styles.titleRow}><AppText variant="title">{sheet.number}</AppText><View style={[styles.status, { backgroundColor: `${palette.success}16` }]}><Ionicons name="checkmark-circle" size={15} color={palette.success} /><AppText variant="caption" style={{ color: palette.success, fontWeight: '900' }}>DOCUMENT EMIS</AppText></View><PaymentBadge paid={sheet.paymentStatus === 'PAID'} /></View><AppText muted>{sheet.customerName} · {sheet.productName}</AppText><AppText variant="caption" muted>{formatDate(sheet.documentAt, true)}{sheet.companyName ? ` · ${sheet.companyName}` : ''}</AppText></View>
            <View style={[styles.heroActions, compact && styles.full]}>{hasPermission('sales_sheets.update') ? <Button variant="outline" label="Editează toate datele" icon="create-outline" onPress={() => router.push(`/shop/sales-sheets/${sheet.id}/edit` as never)} style={compact ? styles.full : undefined} /> : null}<Button label="Deschide PDF" icon="open-outline" disabled={!sheet.pdfUrl} onPress={() => sheet.pdfUrl && void Linking.openURL(sheet.pdfUrl)} style={compact ? styles.full : undefined} /></View>
          </Card>

          <View style={[styles.metrics, compact && styles.metricsCompact]}>
            <Metric label="Total" value={money(sheet.totalPrice, sheet.currencyCode)} color={colors.primary} />
            <Metric label="Bani încasați" value={money(sheet.receivedAmount, sheet.currencyCode)} color={palette.success} />
            <Metric label="Rest de plată" value={money(sheet.remainingDue, sheet.currencyCode)} color={sheet.remainingDue > 0 ? palette.warning : palette.success} />
            {canViewFinancials ? <Metric label="Rămâne G-Shop" value={money(sheet.gshopNet ?? sheet.totalPrice - (sheet.expenseTotal ?? 0), sheet.currencyCode)} color={(sheet.gshopNet ?? sheet.totalPrice - (sheet.expenseTotal ?? 0)) >= 0 ? palette.purple : palette.danger} /> : null}
          </View>

          <Card style={styles.section} elevated>
            <View style={styles.paymentTitle}><SectionTitle icon="wallet-outline" title="Situația plății" /><View style={styles.copy} />{canEditPayment ? <SalesPaymentStatusControl value={sheet.paymentStatus} compact={compact} disabled={paymentSaving} onChange={(value) => void savePayment(value)} /> : <PaymentBadge paid={sheet.paymentStatus === 'PAID'} />}</View>
            <View style={[styles.paymentInfo, { backgroundColor: sheet.paymentStatus === 'PAID' ? `${palette.success}12` : `${palette.warning}12`, borderColor: sheet.paymentStatus === 'PAID' ? `${palette.success}45` : `${palette.warning}45` }]}><Ionicons name={sheet.paymentStatus === 'PAID' ? 'checkmark-circle-outline' : 'time-outline'} size={21} color={sheet.paymentStatus === 'PAID' ? palette.success : palette.warning} /><AppText variant="caption" style={styles.copy}>{sheet.paymentStatus === 'PAID' ? 'Întregul total este încasat. Dacă revii la Neachitat, suma parțială memorată va fi folosită din nou.' : 'Completează suma încasată până acum; restul de plată se recalculează automat.'}</AppText></View>
            {canEditPayment ? <View style={styles.paymentEditor}><View style={styles.paymentField}><Input label="Bani încasați" icon="cash-outline" value={sheet.paymentStatus === 'PAID' ? String(sheet.receivedAmount).replace('.', ',') : paymentDraft} onChangeText={setPaymentDraft} editable={sheet.paymentStatus === 'UNPAID' && !paymentSaving} keyboardType="decimal-pad" /></View><Button label="Salvează suma" icon="checkmark-outline" loading={paymentSaving} disabled={sheet.paymentStatus === 'PAID'} onPress={() => void savePayment('UNPAID')} style={compact ? styles.full : undefined} /></View> : null}
          </Card>

          <Card style={styles.section} elevated><SectionTitle icon="person-outline" title="Client și livrare" /><View style={styles.dataGrid}><Data label="Client" value={sheet.customerName} /><Data label="Telefon" value={sheet.customerPhone} /><Data label="E-mail" value={sheet.customerEmail} /><Data label="Adresă de livrare" value={sheet.deliveryAddress} wide /><Data label="Observații client" value={sheet.customerNotes} wide /></View></Card>
          <Card style={styles.section} elevated><SectionTitle icon="cube-outline" title="Produs" /><View style={styles.dataGrid}><Data label="Produs / model" value={sheet.productName} wide /><Data label="Cod produs" value={sheet.productCode} /><Data label="Serie / IMEI" value={sheet.serialNumber} /><Data label="Cantitate" value={String(sheet.quantity)} /><Data label="Garanție" value={sheet.warranty} /></View></Card>
          <Card style={styles.section} elevated><SectionTitle icon="card-outline" title="Plată și valori" /><View style={styles.dataGrid}><Data label="Plată" value={paymentLabels[sheet.paymentMethod]} /><Data label="Livrare" value={deliveryLabels[sheet.deliveryMode]} /><Data label="Preț unitar" value={money(sheet.productUnitPrice, sheet.currencyCode)} /><Data label="Preț produse" value={money(sheet.productPrice, sheet.currencyCode)} /><Data label="Preț livrare" value={money(sheet.deliveryPrice, sheet.currencyCode)} /><Data label="Scadență" value={sheet.dueAt ? formatDate(sheet.dueAt, true) : 'Fără scadență'} /></View></Card>

          {canViewFinancials ? <Card style={styles.section} elevated>
            <View style={styles.expenseTitle}><SectionTitle icon="receipt-outline" title="Cheltuieli interne" /><View style={styles.copy} />{canEditExpenses && !expensesEditing ? <Button compact variant="outline" label={(sheet.expenses?.length ?? 0) ? 'Editează' : 'Adaugă'} icon="create-outline" onPress={startExpenseEditing} /> : null}</View>
            <View style={[styles.internalNote, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}30` }]}><Ionicons name="eye-off-outline" size={19} color={colors.primary} /><AppText variant="caption" style={styles.copy}>Aceste valori sunt interne și nu apar în PDF-ul clientului.</AppText></View>
            {expensesEditing ? <>
              <View style={styles.expenseList}>{expenseDrafts.map((expense, index) => <View key={expense.id} style={[styles.expenseEditRow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <View style={styles.expenseEditFields}><View style={styles.expenseName}><Input label={`Cheltuiala ${index + 1}`} value={expense.name} onChangeText={(name) => setExpenseDrafts((current) => current.map((item) => item.id === expense.id ? { ...item, name } : item))} placeholder="Ex: Cost achiziție produs" /></View><View style={styles.expenseQuantity}><Input label="Cantitate" value={expense.quantity} onChangeText={(quantity) => setExpenseDrafts((current) => current.map((item) => item.id === expense.id ? { ...item, quantity } : item))} keyboardType="decimal-pad" placeholder="1" /></View><View style={styles.expenseAmount}><Input label="Valoare / unitate" value={expense.amount} onChangeText={(amount) => setExpenseDrafts((current) => current.map((item) => item.id === expense.id ? { ...item, amount } : item))} keyboardType="decimal-pad" placeholder="0,00" /></View><View style={styles.expenseLineTotal}><AppText variant="caption" muted>Total poziție</AppText><AppText variant="label">{money(numberValue(expense.quantity) * numberValue(expense.amount), sheet.currencyCode)}</AppText></View></View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Șterge cheltuiala ${index + 1}`} onPress={() => setExpenseDrafts((current) => current.filter((item) => item.id !== expense.id))} style={[styles.deleteExpense, { backgroundColor: `${palette.danger}14` }]}><Ionicons name="trash-outline" size={20} color={palette.danger} /></Pressable>
              </View>)}</View>
              <Button variant="outline" label="Adaugă o cheltuială" icon="add-outline" onPress={() => setExpenseDrafts((current) => [...current, { id: `${Date.now()}-${current.length}`, name: '', quantity: '1', amount: '' }])} />
              <View style={styles.expenseActions}><Button variant="outline" label="Anulează" disabled={savingExpenses} onPress={() => setExpensesEditing(false)} style={styles.actionFlex} /><Button label="Salvează cheltuielile" icon="checkmark-outline" loading={savingExpenses} onPress={() => void saveExpenses()} style={styles.actionFlex} /></View>
            </> : (sheet.expenses?.length ?? 0) ? <View style={styles.expenseList}>{sheet.expenses!.map((expense, index) => <View key={`${expense.name}-${index}`} style={[styles.expenseDisplayRow, { borderBottomColor: colors.border }]}><View style={[styles.expenseIndex, { backgroundColor: colors.surfaceMuted }]}><AppText variant="caption" muted>{index + 1}</AppText></View><View style={styles.copy}><AppText variant="label">{expense.name}</AppText><AppText variant="caption" muted>{new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(expense.quantity ?? 1)} × {money(expense.amount, sheet.currencyCode)} / unitate</AppText></View><AppText variant="label" style={{ color: palette.warning }}>{money((expense.quantity ?? 1) * expense.amount, sheet.currencyCode)}</AppText></View>)}</View> : <View style={[styles.emptyExpenses, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="wallet-outline" size={24} color={colors.textMuted} /><AppText variant="caption" muted>Nu au fost adăugate cheltuieli interne.</AppText></View>}
            <View style={[styles.netSummary, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}35` }]}><Data label="Bani încasați" value={money(sheet.receivedAmount, sheet.currencyCode)} /><Data label="Total cheltuieli" value={money(sheet.expenseTotal ?? 0, sheet.currencyCode)} /><Data label="Rămâne G-Shop" value={money(sheet.gshopNet ?? sheet.totalPrice - (sheet.expenseTotal ?? 0), sheet.currencyCode)} /></View>
          </Card> : null}

          <Card style={styles.section} elevated>
            <SectionTitle icon="pencil-outline" title="Semnătura clientului" />
            <View style={[styles.signature, { backgroundColor: colors.surfaceMuted, borderColor: sheet.signatureUrl ? palette.success : colors.border }]}><View style={[styles.signatureIcon, { backgroundColor: sheet.signatureUrl ? `${palette.success}18` : `${palette.purple}16` }]}><Ionicons name={sheet.signatureUrl ? 'checkmark-circle' : 'pencil-outline'} size={24} color={sheet.signatureUrl ? palette.success : palette.purple} /></View><View style={styles.copy}><AppText variant="label">{sheet.signatureUrl ? 'Fișa este semnată electronic' : 'Fișa nu este încă semnată'}</AppText><AppText variant="caption" muted>{sheet.signedAt ? `Semnat la ${formatDate(sheet.signedAt, true)}. PDF-ul conține semnătura.` : 'Clientul poate semna acum, iar PDF-ul se actualizează automat.'}</AppText></View>{hasPermission('sales_sheets.update') ? <Button compact label={sheet.signatureUrl ? 'Resemnează' : 'Semnează'} icon="pencil-outline" onPress={() => setSignatureOpen(true)} /> : null}</View>
          </Card>

          {sheet.notes ? <Card style={styles.section}><SectionTitle icon="document-text-outline" title="Observații" /><AppText>{sheet.notes}</AppText></Card> : null}
        </> : null}
      </View>
    </Screen>
    {sheet ? <QuickSignatureModal visible={signatureOpen} clientName={sheet.customerName} saving={signing} onClose={() => !signing && setSignatureOpen(false)} onConfirm={(value) => void saveSignature(value)} /> : null}
  </>;
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) { const { colors } = useAppTheme(); return <View style={styles.sectionTitle}><View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name={icon} size={20} color={colors.primary} /></View><AppText variant="heading">{title}</AppText></View>; }
function Data({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) { return <View style={[styles.data, wide && styles.dataWide]}><AppText variant="caption" muted>{label.toLocaleUpperCase('ro-RO')}</AppText><AppText variant="label">{value || '—'}</AppText></View>; }
function Metric({ label, value, color }: { label: string; value: string; color: string }) { return <Card style={styles.metric}><AppText variant="caption" muted>{label}</AppText><AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{ color }}>{value}</AppText></Card>; }
function PaymentBadge({ paid }: { paid: boolean }) { return <View style={[styles.status, { backgroundColor: `${paid ? palette.success : palette.warning}16` }]}><Ionicons name={paid ? 'checkmark-circle' : 'time'} size={15} color={paid ? palette.success : palette.warning} /><AppText variant="caption" style={{ color: paid ? palette.success : palette.warning, fontWeight: '900' }}>{paid ? 'ACHITAT' : 'NEACHITAT'}</AppText></View>; }

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 920, alignSelf: 'center', gap: spacing.lg }, hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, copy: { minWidth: 0, flex: 1, gap: 3 }, titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, status: { minHeight: 26, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 }, full: { width: '100%' },
  metrics: { flexDirection: 'row', gap: spacing.md }, metricsCompact: { flexDirection: 'column' }, metric: { minWidth: 170, flex: 1, gap: spacing.xs }, section: { gap: spacing.lg }, sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, sectionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, dataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, data: { minWidth: 180, flexGrow: 1, flexBasis: '30%', gap: 4 }, dataWide: { flexBasis: '64%' },
  paymentTitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, paymentInfo: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, paymentEditor: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.md }, paymentField: { minWidth: 220, flex: 1 },
  signature: { padding: spacing.md, borderWidth: 1.5, borderRadius: radius.lg, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, signatureIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  expenseTitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, internalNote: { padding: spacing.sm, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, expenseList: { gap: spacing.xs }, expenseDisplayRow: { minHeight: 52, paddingVertical: spacing.sm, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, expenseIndex: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, emptyExpenses: { minHeight: 70, padding: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, expenseEditRow: { padding: spacing.sm, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, expenseEditFields: { minWidth: 210, flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm }, expenseName: { minWidth: 190, flex: 2 }, expenseQuantity: { minWidth: 105, flex: 0.65 }, expenseAmount: { minWidth: 145, flex: 1 }, expenseLineTotal: { minWidth: 125, minHeight: 52, justifyContent: 'center', gap: 3 }, deleteExpense: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, expenseActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, actionFlex: { minWidth: 200, flex: 1 }, netSummary: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
