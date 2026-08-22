import { AppHeader } from '@/components/layout/AppHeader';
import { QuickSignatureModal } from '@/components/service-sheets/ScanServiceSheetModal';
import { SalesPaymentStatusControl } from '@/components/sales/SalesPaymentStatusControl';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { salesSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { SalesDeliveryMode, SalesPaymentMethod, SalesPaymentStatus, SalesSheet } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

const numberValue = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const money = (value: number, currency = 'RON') => new Intl.NumberFormat('ro-RO', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
type ExpenseDraft = { id: string; name: string; quantity: string; amount: string };

export function SalesSheetForm({ initialSheet }: { initialSheet?: SalesSheet }) {
  const { activeProperty } = useProperty();
  const { hasPermission } = useAuth();
  const { colors } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const [saving, setSaving] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [documentAt, setDocumentAt] = useState(initialSheet?.documentAt ?? new Date().toISOString());
  const [customerName, setCustomerName] = useState(initialSheet?.customerName ?? '');
  const [customerPhone, setCustomerPhone] = useState(initialSheet?.customerPhone ?? '');
  const [customerEmail, setCustomerEmail] = useState(initialSheet?.customerEmail ?? '');
  const [deliveryAddress, setDeliveryAddress] = useState(initialSheet?.deliveryAddress ?? '');
  const [customerNotes, setCustomerNotes] = useState(initialSheet?.customerNotes ?? '');
  const [productName, setProductName] = useState(initialSheet?.productName ?? '');
  const [productCode, setProductCode] = useState(initialSheet?.productCode ?? '');
  const [serialNumber, setSerialNumber] = useState(initialSheet?.serialNumber ?? '');
  const [quantity, setQuantity] = useState(initialSheet ? String(initialSheet.quantity).replace('.', ',') : '1');
  const [warranty, setWarranty] = useState(initialSheet?.warranty ?? '');
  const [paymentMethod, setPaymentMethod] = useState<SalesPaymentMethod>(initialSheet?.paymentMethod ?? 'CASH');
  const [paymentStatus, setPaymentStatus] = useState<SalesPaymentStatus>(initialSheet?.paymentStatus ?? 'UNPAID');
  const [deliveryMode, setDeliveryMode] = useState<SalesDeliveryMode>(initialSheet?.deliveryMode ?? 'PICKUP');
  const [productUnitPrice, setProductUnitPrice] = useState(initialSheet ? String(initialSheet.productUnitPrice).replace('.', ',') : '');
  const [deliveryPrice, setDeliveryPrice] = useState(initialSheet ? String(initialSheet.deliveryPrice).replace('.', ',') : '');
  const [advancePaid, setAdvancePaid] = useState(initialSheet ? String(initialSheet.advancePaid).replace('.', ',') : '');
  const [dueAt, setDueAt] = useState(initialSheet?.dueAt ?? '');
  const [currencyCode, setCurrencyCode] = useState(initialSheet?.currencyCode ?? 'RON');
  const [notes, setNotes] = useState(initialSheet?.notes ?? '');
  const [expenses, setExpenses] = useState<ExpenseDraft[]>(() => (initialSheet?.expenses ?? []).map((expense, index) => ({
    id: `${index}-${expense.name}`,
    name: expense.name,
    quantity: String(expense.quantity ?? 1).replace('.', ','),
    amount: String(expense.amount).replace('.', ','),
  })));
  const canManageFinancials = hasPermission('financials.view');

  const totals = useMemo(() => {
    const product = numberValue(quantity) * numberValue(productUnitPrice);
    const delivery = deliveryMode === 'DELIVERY' ? numberValue(deliveryPrice) : 0;
    const total = product + delivery;
    const collected = paymentStatus === 'PAID' ? total : Math.min(total, numberValue(advancePaid));
    const expenseTotal = expenses.reduce((sum, expense) => sum + numberValue(expense.quantity) * numberValue(expense.amount), 0);
    return { product, delivery, total, collected, expenseTotal, gshopNet: total - expenseTotal, remaining: Math.max(0, total - collected) };
  }, [advancePaid, deliveryMode, deliveryPrice, expenses, paymentStatus, productUnitPrice, quantity]);

  const submit = async () => {
    if (!activeProperty && !initialSheet) return;
    if (customerName.trim().length < 2) return showToast('Completează numele clientului.', 'error');
    if (customerPhone.trim().length < 3) return showToast('Completează telefonul clientului.', 'error');
    if (numberValue(advancePaid) > totals.total) return showToast('Banii încasați nu pot depăși totalul fișei.', 'error');
    if (canManageFinancials && expenses.some((expense) => (expense.name.trim() || expense.amount.trim()) && (!expense.name.trim() || numberValue(expense.quantity) <= 0 || numberValue(expense.amount) <= 0))) return showToast('Completează denumirea, cantitatea și valoarea unitară a fiecărei cheltuieli.', 'error');
    setSaving(true);
    try {
      const payload = {
        propertyId: initialSheet?.propertyId ?? activeProperty!.id, documentAt, customerName: customerName.trim(), customerPhone: customerPhone.trim(), customerEmail: customerEmail.trim(),
        deliveryAddress: deliveryAddress.trim(), customerNotes: customerNotes.trim(), productName: productName.trim(), productCode: productCode.trim(), serialNumber: serialNumber.trim(),
        quantity: numberValue(quantity) || 1, warranty: warranty.trim(), paymentMethod, deliveryMode, productUnitPrice: numberValue(productUnitPrice), deliveryPrice: totals.delivery,
        advancePaid: numberValue(advancePaid), paymentStatus, dueAt, currencyCode: currencyCode.trim().toUpperCase() || 'RON', notes: notes.trim(), expenses: canManageFinancials ? expenses.filter((expense) => expense.name.trim() && numberValue(expense.quantity) > 0 && numberValue(expense.amount) > 0).map((expense) => ({ name: expense.name.trim(), quantity: numberValue(expense.quantity), amount: numberValue(expense.amount) })) : [], ...(signature ? { signature } : {}),
      };
      let saved = initialSheet
        ? await salesSheetRepository.update(initialSheet.id, payload)
        : await salesSheetRepository.create(payload);
      if (initialSheet && signature) saved = await salesSheetRepository.saveSignature(initialSheet.id, signature);
      showToast(initialSheet ? 'Fișa și PDF-ul au fost actualizate.' : 'Fișa de vânzare și PDF-ul au fost emise.', 'success');
      router.replace(`/shop/sales-sheets/${saved.id}` as never);
    } catch (error) { showToast(error instanceof Error ? error.message : initialSheet ? 'Fișa nu a putut fi actualizată.' : 'Fișa de vânzare nu a putut fi emisă.', 'error'); }
    finally { setSaving(false); }
  };

  return <>
    <Screen header={<AppHeader title={initialSheet ? `Editare ${initialSheet.number}` : 'Fișă de vânzare nouă'} back onBack={() => router.replace(initialSheet ? `/shop/sales-sheets/${initialSheet.id}` as never : '/shop/sales-sheets' as never)} />}>
      <View style={styles.stack}>
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="receipt-outline" size={28} color={colors.primary} /></View>
          <View style={styles.copy}><AppText variant="title">{initialSheet ? 'Editează toate datele fișei' : 'Emite fișa în câțiva pași'}</AppText><AppText muted>{initialSheet ? 'Modificările recalculează totalurile și regenerează automat PDF-ul existent.' : 'Completezi o singură dată. Firma activă din Shop, totalurile, restul de plată și PDF-ul se completează automat.'}</AppText></View>
        </View>

        <StepCard number={1} title="Client" subtitle="Date de identificare și livrare" icon="person-outline">
          <View style={[styles.fields, compact && styles.fieldsCompact]}>
            <Field compact={compact}><Input label="Nume și prenume *" icon="person-outline" value={customerName} onChangeText={setCustomerName} placeholder="Ex: Andrei Popescu" autoCapitalize="words" /></Field>
            <Field compact={compact}><Input label="Telefon *" icon="call-outline" value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" placeholder="07..." /></Field>
            <Field compact={compact}><Input label="E-mail" icon="mail-outline" value={customerEmail} onChangeText={setCustomerEmail} keyboardType="email-address" autoCapitalize="none" /></Field>
            <Field compact={compact}><Input label="Adresă de livrare" icon="location-outline" value={deliveryAddress} onChangeText={setDeliveryAddress} /></Field>
            <View style={styles.wide}><Input label="Observații client" icon="chatbox-ellipses-outline" value={customerNotes} onChangeText={setCustomerNotes} maxLength={500} /></View>
          </View>
        </StepCard>

        <StepCard number={2} title="Produs" subtitle="Identificare și garanție" icon="cube-outline">
          <View style={[styles.fields, compact && styles.fieldsCompact]}>
            <View style={styles.wide}><Input label="Produs / model" icon="laptop-outline" value={productName} onChangeText={setProductName} placeholder="Ex: Laptop Lenovo ThinkPad T14" /></View>
            <Field compact={compact}><Input label="Cod produs" icon="barcode-outline" value={productCode} onChangeText={setProductCode} autoCapitalize="characters" /></Field>
            <Field compact={compact}><Input label="Serie / IMEI" icon="finger-print-outline" value={serialNumber} onChangeText={setSerialNumber} autoCapitalize="characters" /></Field>
            <Field compact={compact}><Input label="Cantitate" icon="layers-outline" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" /></Field>
            <Field compact={compact}><Input label="Garanție" icon="shield-checkmark-outline" value={warranty} onChangeText={setWarranty} placeholder="Ex: 24 luni" /></Field>
          </View>
        </StepCard>

        <StepCard number={3} title="Plată și livrare" subtitle="Alege opțiunile tranzacției" icon="card-outline">
          <ChoiceGroup label="Modalitate de plată" compact={compact}>
            <Choice selected={paymentMethod === 'CASH'} icon="cash-outline" label="Numerar" onPress={() => setPaymentMethod('CASH')} />
            <Choice selected={paymentMethod === 'BANK_TRANSFER'} icon="swap-horizontal-outline" label="Transfer bancar" onPress={() => setPaymentMethod('BANK_TRANSFER')} />
            <Choice selected={paymentMethod === 'CARD'} icon="card-outline" label="Plată cu cardul" onPress={() => setPaymentMethod('CARD')} />
          </ChoiceGroup>
          <ChoiceGroup label="Livrare" compact={compact}>
            <Choice selected={deliveryMode === 'DELIVERY'} icon="car-outline" label="Cu livrare" onPress={() => setDeliveryMode('DELIVERY')} />
            <Choice selected={deliveryMode === 'PICKUP'} icon="storefront-outline" label="Fără livrare" onPress={() => { setDeliveryMode('PICKUP'); setDeliveryPrice(''); }} />
          </ChoiceGroup>
        </StepCard>

        <StepCard number={4} title="Valori și scadență" subtitle="Totalurile se calculează automat" icon="calculator-outline">
          <View style={styles.paymentHeading}>
            <View style={styles.copy}><AppText variant="label">Statusul plății</AppText><AppText variant="caption" muted>La „Achitat”, totalul fișei este considerat încasat automat.</AppText></View>
            <SalesPaymentStatusControl value={paymentStatus} compact={compact} onChange={setPaymentStatus} />
          </View>
          <View style={[styles.fields, compact && styles.fieldsCompact]}>
            <Field compact={compact}><Input label="Preț produs / unitate" icon="cash-outline" value={productUnitPrice} onChangeText={setProductUnitPrice} keyboardType="decimal-pad" placeholder="0,00" /></Field>
            <Field compact={compact}><Input label="Preț livrare" icon="car-outline" value={deliveryPrice} onChangeText={setDeliveryPrice} keyboardType="decimal-pad" editable={deliveryMode === 'DELIVERY'} placeholder={deliveryMode === 'DELIVERY' ? '0,00' : 'Fără livrare'} /></Field>
            <Field compact={compact}><Input label="Bani încasați" icon="wallet-outline" value={paymentStatus === 'PAID' ? String(totals.total).replace('.', ',') : advancePaid} onChangeText={setAdvancePaid} keyboardType="decimal-pad" editable={paymentStatus === 'UNPAID'} placeholder="0,00" /></Field>
            <Field compact={compact}><Input label="Monedă" icon="pricetag-outline" value={currencyCode} onChangeText={setCurrencyCode} maxLength={3} autoCapitalize="characters" /></Field>
            <View style={styles.wide}><DateTimeField label="Data scadenței" value={dueAt} onChange={setDueAt} allowClear showNow /></View>
          </View>
          <View style={[styles.summary, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}35` }]}>
            <Summary label="Produse" value={money(totals.product, currencyCode)} color={colors.primary} />
            <Summary label="Livrare" value={money(totals.delivery, currencyCode)} color={palette.cyan} />
            <Summary label="Total" value={money(totals.total, currencyCode)} color={palette.purple} />
            <Summary label="Bani încasați" value={money(totals.collected, currencyCode)} color={palette.success} />
            <Summary label="Rest de plată" value={money(totals.remaining, currencyCode)} color={totals.remaining > 0 ? palette.warning : palette.success} />
          </View>
        </StepCard>

        {canManageFinancials ? <StepCard number={5} title="Cheltuieli interne" subtitle="Nu apar în PDF-ul clientului" icon="receipt-outline">
          <View style={styles.expenseHeading}>
            <View style={styles.copy}><AppText variant="label">Poziții de cheltuieli</AppText><AppText variant="caption" muted>Cost produs, transport, ambalare sau orice alt cost intern.</AppText></View>
            <Button compact variant="outline" label="Adaugă" icon="add-outline" onPress={() => setExpenses((current) => [...current, { id: `${Date.now()}-${current.length}`, name: '', quantity: '1', amount: '' }])} />
          </View>
          {expenses.length ? <View style={styles.expenseList}>{expenses.map((expense, index) => <View key={expense.id} style={[styles.expenseRow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <View style={[styles.expenseNumber, { backgroundColor: colors.primarySoft }]}><AppText variant="label" style={{ color: colors.primary }}>{index + 1}</AppText></View>
            <View style={styles.expenseFields}>
              <View style={styles.expenseName}><Input label="Denumire" value={expense.name} onChangeText={(name) => setExpenses((current) => current.map((item) => item.id === expense.id ? { ...item, name } : item))} placeholder="Ex: Cost achiziție produs" /></View>
              <View style={styles.expenseQuantity}><Input label="Cantitate" value={expense.quantity} onChangeText={(quantity) => setExpenses((current) => current.map((item) => item.id === expense.id ? { ...item, quantity } : item))} keyboardType="decimal-pad" placeholder="1" /></View>
              <View style={styles.expenseAmount}><Input label="Valoare / unitate" value={expense.amount} onChangeText={(amount) => setExpenses((current) => current.map((item) => item.id === expense.id ? { ...item, amount } : item))} keyboardType="decimal-pad" placeholder="0,00" /></View>
              <View style={styles.expenseLineTotal}><AppText variant="caption" muted>Total poziție</AppText><AppText variant="label">{money(numberValue(expense.quantity) * numberValue(expense.amount), currencyCode)}</AppText></View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Șterge cheltuiala ${index + 1}`} onPress={() => setExpenses((current) => current.filter((item) => item.id !== expense.id))} style={[styles.expenseDelete, { backgroundColor: `${palette.danger}14` }]}><Ionicons name="trash-outline" size={20} color={palette.danger} /></Pressable>
          </View>)}</View> : <View style={[styles.expenseEmpty, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><Ionicons name="wallet-outline" size={25} color={colors.textMuted} /><View style={styles.copy}><AppText variant="label">Nicio cheltuială adăugată</AppText><AppText variant="caption" muted>Poți emite fișa și fără cheltuieli interne.</AppText></View></View>}
          <View style={[styles.expenseSummary, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}35` }]}>
            <Summary label="Bani încasați" value={money(totals.collected, currencyCode)} color={palette.success} />
            <Summary label="Total cheltuieli" value={money(totals.expenseTotal, currencyCode)} color={palette.warning} />
            <Summary label="Rămâne G-Shop" value={money(totals.gshopNet, currencyCode)} color={totals.gshopNet >= 0 ? colors.primary : palette.danger} />
          </View>
        </StepCard> : null}

        <StepCard number={canManageFinancials ? 6 : 5} title="Confirmare" subtitle="Data, observațiile și semnătura clientului" icon="checkmark-done-outline">
          <DateTimeField label="Data și ora fișei" value={documentAt} onChange={setDocumentAt} showNow />
          <Input label="Observații" icon="document-text-outline" value={notes} onChangeText={setNotes} multiline numberOfLines={3} style={styles.textArea} />
          <View style={[styles.signature, { backgroundColor: colors.surfaceMuted, borderColor: signature || initialSheet?.signatureUrl ? palette.success : colors.border }]}>
            <View style={[styles.signatureIcon, { backgroundColor: signature || initialSheet?.signatureUrl ? `${palette.success}18` : `${palette.purple}16` }]}><Ionicons name={signature || initialSheet?.signatureUrl ? 'checkmark-circle' : 'pencil-outline'} size={24} color={signature || initialSheet?.signatureUrl ? palette.success : palette.purple} /></View>
            <View style={styles.copy}><AppText variant="label">{signature ? 'Semnătura nouă este pregătită' : initialSheet?.signatureUrl ? 'Fișa are deja semnătura clientului' : 'Semnătură electronică client'}</AppText><AppText variant="caption" muted>{signature ? 'Va înlocui semnătura existentă când salvezi.' : initialSheet?.signatureUrl ? 'Rămâne neschimbată dacă nu alegi Resemnează.' : 'Clientul poate semna acum, direct pe telefon sau tabletă.'}</AppText></View>
            <Button compact variant={signature || initialSheet?.signatureUrl ? 'outline' : 'primary'} label={signature || initialSheet?.signatureUrl ? 'Resemnează' : 'Semnează'} icon="pencil-outline" onPress={() => setSignatureOpen(true)} />
          </View>
        </StepCard>

        <View style={[styles.emitBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={styles.emitCopy}><Ionicons name="sparkles-outline" size={20} color={colors.primary} /><AppText variant="caption" muted style={styles.copy}>{initialSheet ? 'Toate câmpurile și totalurile sunt salvate, iar PDF-ul este regenerat.' : 'La salvare se alocă numărul FV, se fixează firma activă și se emite PDF-ul.'}</AppText></View>
          <Button label={initialSheet ? 'Salvează și actualizează PDF-ul' : 'Emite fișa și PDF-ul'} icon="document-text-outline" loading={saving} onPress={() => void submit()} style={styles.emitButton} />
        </View>
      </View>
    </Screen>
    <QuickSignatureModal visible={signatureOpen} clientName={customerName.trim() || 'Client'} saving={false} onClose={() => setSignatureOpen(false)} onConfirm={(value) => { setSignature(value); setSignatureOpen(false); }} />
  </>;
}

function StepCard({ number, title, subtitle, icon, children }: { number: number; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return <Card style={styles.step} elevated><View style={styles.stepHeading}><View style={[styles.number, { backgroundColor: colors.primary }]}><AppText variant="label" style={styles.numberText}>{number}</AppText></View><View style={[styles.stepIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name={icon} size={20} color={colors.primary} /></View><View style={styles.copy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>{subtitle}</AppText></View></View>{children}</Card>;
}
function Field({ children, compact }: { children: React.ReactNode; compact: boolean }) { return <View style={[styles.field, compact && styles.fieldCompact]}>{children}</View>; }
function ChoiceGroup({ label, compact, children }: { label: string; compact: boolean; children: React.ReactNode }) { return <View style={styles.choiceGroup}><AppText variant="label">{label}</AppText><View style={[styles.choices, compact && styles.choicesCompact]}>{children}</View></View>; }
function Choice({ selected, icon, label, onPress }: { selected: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) { const { colors } = useAppTheme(); return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.choice, { backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.75 : 1 }]}><View style={[styles.choiceIcon, { backgroundColor: selected ? colors.primary : colors.surface }]}><Ionicons name={selected ? 'checkmark' : icon} size={19} color={selected ? '#FFFFFF' : colors.primary} /></View><AppText variant="label" style={styles.copy}>{label}</AppText></Pressable>; }
function Summary({ label, value, color }: { label: string; value: string; color: string }) { return <View style={styles.summaryItem}><AppText variant="caption" muted>{label}</AppText><AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color }}>{value}</AppText></View>; }

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 920, alignSelf: 'center', gap: spacing.lg }, intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, introIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, copy: { minWidth: 0, flex: 1 },
  step: { gap: spacing.lg }, stepHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, number: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, numberText: { color: '#FFFFFF', fontWeight: '900' }, stepIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, fieldsCompact: { flexDirection: 'column', flexWrap: 'nowrap' }, field: { minWidth: 240, flexGrow: 1, flexBasis: '46%' }, fieldCompact: { minWidth: 0, flexBasis: 'auto', width: '100%' }, wide: { width: '100%' },
  choiceGroup: { gap: spacing.sm }, choices: { flexDirection: 'row', gap: spacing.sm }, choicesCompact: { flexDirection: 'column' }, choice: { minHeight: 58, flex: 1, padding: spacing.sm, borderWidth: 1.5, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, choiceIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  paymentHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  summary: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, summaryItem: { minWidth: 130, flex: 1, gap: 3 }, textArea: { minHeight: 78, textAlignVertical: 'top' },
  expenseHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, expenseList: { gap: spacing.sm }, expenseRow: { padding: spacing.sm, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, expenseNumber: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, expenseFields: { minWidth: 210, flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm }, expenseName: { minWidth: 190, flex: 2 }, expenseQuantity: { minWidth: 105, flex: 0.65 }, expenseAmount: { minWidth: 145, flex: 1 }, expenseLineTotal: { minWidth: 125, minHeight: 52, justifyContent: 'center', gap: 3 }, expenseDelete: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, expenseEmpty: { minHeight: 76, padding: spacing.md, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, expenseSummary: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  signature: { padding: spacing.md, borderWidth: 1.5, borderRadius: radius.lg, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, signatureIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  emitBar: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, emitCopy: { minWidth: 220, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, emitButton: { minWidth: 250 },
});
