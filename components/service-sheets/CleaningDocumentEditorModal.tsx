import { FinanceNumberField } from '@/components/clients/finance/FinanceNumberField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Input } from '@/components/ui/Input';
import { KeyboardAwareScrollView } from '@/components/ui/KeyboardAwareScrollView';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { clientRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { CleaningOrderDetails, CleaningOrderItem, ClientFinancialOverview, GenerateServiceDocumentInput, ServiceDocument, ServiceSheet } from '@/types';
import { calculateEstimatedCosts } from '@/utils/estimated-costs';
import { formatFinanceMoney } from '@/utils/client-finance';
import { formatDate } from '@/utils/format';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';

type Props = {
  visible: boolean;
  type: 'INTAKE' | 'EXIT';
  sheet: ServiceSheet;
  document?: ServiceDocument;
  intake?: ServiceDocument;
  financialOverview?: ClientFinancialOverview;
  onGenerate: (input: GenerateServiceDocumentInput) => Promise<void>;
  onClose: () => void;
};

const empty = (): CleaningOrderDetails => ({
  items: [], serviceAddress: '', interventionAt: new Date().toISOString(), technicianName: '', notes: '', paymentMethod: '',
  costs: calculateEstimatedCosts({ currencyCode: 'RON' }),
});

export function CleaningDocumentEditorModal({ visible, type, sheet, document, intake, financialOverview, onGenerate, onClose }: Props) {
  const { colors } = useAppTheme();
  const { hasPermission } = useAuth();
  const canEditMoney = hasPermission('financials.view') && hasPermission('clients.update');
  const [draft, setDraft] = useState<CleaningOrderDetails>(empty);
  const [documentAt, setDocumentAt] = useState('');
  const [agreementAt, setAgreementAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pricingNotice, setPricingNotice] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const now = new Date().toISOString();
    const source = document?.cleaning ?? (type === 'EXIT' ? intake?.cleaning : undefined);
    const finance = financialOverview?.financials;
    const workPrice = finance?.workPrice ?? sheet.partsCost + sheet.laborCost;
    const matches = source && Math.abs(source.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice * 100) / 100, 0) - workPrice) < 0.01;
    const costs = calculateEstimatedCosts({ partsCost: 0, laborCost: workPrice, diagnosticFee: finance?.diagnosticFee ?? 0,
      discountPercent: finance?.discountPercent ?? 0, advancePaid: financialOverview?.summary.receivedAmount ?? finance?.advancePaid ?? 0,
      currencyCode: finance?.currencyCode ?? sheet.currencyCode ?? 'RON' });
    setPricingNotice(Boolean(source && !matches));
    setDraft({ ...empty(), ...source, costs,
      items: matches ? source.items : [{ article: sheet.equipment || 'Canapea', service: sheet.workPerformed || sheet.reportedIssue || 'Curățare tapițerie', quantity: 1, unitPrice: workPrice }],
      interventionAt: source?.interventionAt ?? (type === 'EXIT' ? sheet.completedAt : sheet.receivedAt) ?? now,
      technicianName: source?.technicianName ?? sheet.technicianName ?? '',
      notes: source?.notes ?? sheet.handoverNotes ?? '',
    });
    setDocumentAt(document?.documentAt ?? now);
    setAgreementAt(document?.agreementAt ?? (type === 'INTAKE' ? sheet.intakeAgreementAt : undefined) ?? now);
    setError(''); setSaving(false);
    if (!source?.serviceAddress) {
      setLoading(true);
      clientRepository.get(sheet.clientId).then((client) => {
        if (!cancelled) setDraft((current) => ({ ...current, serviceAddress: current.serviceAddress || [client.address, client.city, client.county].filter(Boolean).join(', ') }));
      }).catch(() => { if (!cancelled) setError('Adresa clientului nu a putut fi preluată. O poți completa manual.'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else setLoading(false);
    return () => { cancelled = true; };
  }, [visible, type, sheet, document, intake, financialOverview]);

  const serviceTotal = draft.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice * 100) / 100, 0);
  const costs = calculateEstimatedCosts({ ...draft.costs, partsCost: 0, laborCost: serviceTotal });
  const money = (amount: number) => formatFinanceMoney(amount, costs.currencyCode);
  const update = <K extends keyof CleaningOrderDetails>(key: K, value: CleaningOrderDetails[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateItem = (index: number, patch: Partial<CleaningOrderItem>) => setDraft((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  const close = () => { if (!saving) onClose(); };
  const submit = async () => {
    if (!draft.serviceAddress.trim()) return setError('Completează adresa prestării.');
    if (!draft.items.length || draft.items.some((item) => !item.article.trim() || !item.service.trim() || item.quantity <= 0)) return setError('Completează articolul, serviciul și o cantitate pozitivă pentru fiecare poziție.');
    if (draft.items.length > 60) return setError('Sunt permise maximum 60 de articole.');
    if ([documentAt, draft.interventionAt].some((value) => !value || !Number.isFinite(Date.parse(value)))) return setError('Completează data documentului și a intervenției.');
    if (agreementAt && !Number.isFinite(Date.parse(agreementAt))) return setError('Data acceptării nu este validă.');
    if (costs.discountPercent > 100) return setError('Reducerea poate fi între 0% și 100%.');
    if (!financialOverview) return setError('Valorile financiare nu sunt încă disponibile. Redeschide editorul după reîncărcare.');
    setSaving(true); setError('');
    try {
      await onGenerate({ documentAt, agreementAt, cleaning: { ...draft, costs }, syncCleaningFinancials: canEditMoney, financialUpdatedAt: financialOverview.financials.updatedAt ?? null });
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Documentul nu a putut fi generat.'); }
    finally { setSaving(false); }
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
    <ModalSafeBottom style={{ backgroundColor: colors.overlay }}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}><AppText variant="title">{type === 'INTAKE' ? 'Fișă de intrare a comenzii' : 'Fișă de ieșire a comenzii'}</AppText><AppText variant="caption" muted>Curatatorie Canapele · {sheet.number}</AppText></View>
          <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {loading ? <AppText muted>Se preia adresa clientului…</AppText> : null}
            {type === 'EXIT' ? <AppText variant="caption" muted>{intake?.available ? `Fișă de intrare de referință: ${intake.number} din ${formatDate(intake.documentAt)}` : 'Fișă de intrare de referință: neemisă. Referința se completează automat după emitere.'}</AppText> : null}
            <AppText variant="heading">Datele intervenției</AppText>
            <Input label="Adresa prestării *" value={draft.serviceAddress} onChangeText={(value) => update('serviceAddress', value)} multiline maxLength={500} />
            <Input label="Tehnician / echipă" value={draft.technicianName} onChangeText={(value) => update('technicianName', value)} maxLength={160} />
            <DateTimeField label={type === 'INTAKE' ? 'Data intervenției și ora sosirii' : 'Data intervenției și ora finalizării'} value={draft.interventionAt} onChange={(value) => update('interventionAt', value)} showNow />
            <DateTimeField label="Data documentului" value={documentAt} onChange={setDocumentAt} showNow />
            <AppText variant="heading">{type === 'INTAKE' ? 'Articole și servicii comandate' : 'Articole și servicii efectuate'}</AppText>
            {pricingNotice ? <AppText variant="caption" style={{ color: palette.warning }}>Totalul a fost modificat în finanțele clientului. Am preluat valoarea actuală într-o poziție; poți detalia din nou articolele înainte de generare.</AppText> : null}
            {draft.items.map((item, index) => <View key={index} style={[styles.item, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
              <AppText variant="label">Articol {index + 1} · {money(item.quantity * item.unitPrice)}</AppText>
              <Input label="Articol / dimensiuni *" value={item.article} onChangeText={(article) => updateItem(index, { article })} maxLength={180} />
              <Input label="Serviciu și suprafețe incluse *" value={item.service} onChangeText={(service) => updateItem(index, { service })} multiline maxLength={600} />
              <View style={styles.row}><FinanceNumberField label="Cantitate" value={item.quantity} onChange={(quantity) => updateItem(index, { quantity })} disabled={!canEditMoney} style={styles.flex} /><FinanceNumberField label={`Preț unitar (${costs.currencyCode})`} value={item.unitPrice} onChange={(unitPrice) => updateItem(index, { unitPrice })} disabled={!canEditMoney} style={styles.flex} /></View>
              {canEditMoney && draft.items.length > 1 ? <Button compact variant="ghost" label="Elimină articolul" icon="trash-outline" onPress={() => update('items', draft.items.filter((_, i) => i !== index))} /> : null}
            </View>)}
            {canEditMoney ? <Button variant="outline" label="Adaugă articol" icon="add" disabled={draft.items.length >= 60} onPress={() => update('items', [...draft.items, { article: '', service: '', quantity: 1, unitPrice: 0 }])} /> : null}
            <View style={styles.row}><FinanceNumberField label={`Deplasare (${costs.currencyCode})`} value={draft.costs.diagnosticFee} disabled={!canEditMoney} onChange={(diagnosticFee) => update('costs', { ...draft.costs, diagnosticFee })} style={styles.flex} /><FinanceNumberField label="Reducere (%)" value={draft.costs.discountPercent} percentage disabled={!canEditMoney} onChange={(discountPercent) => update('costs', { ...draft.costs, discountPercent })} helper={`Reducere în document: ${money(costs.discountAmount)}`} style={styles.flex} /></View>
            <FinanceNumberField label={`Achitat / avans (${costs.currencyCode})`} value={draft.costs.advancePaid} disabled={!canEditMoney} onChange={(advancePaid) => update('costs', { ...draft.costs, advancePaid })} />
            <Input label="Modalitate de plată" placeholder="Numerar, card, transfer bancar…" value={draft.paymentMethod} onChangeText={(value) => update('paymentMethod', value)} maxLength={80} />
            <AppText variant="heading">Total: {money(costs.totalDue)} · Rest: {money(costs.remainingDue)}</AppText>
            <Input label="Observații / recomandări de uscare și întreținere" value={draft.notes} onChangeText={(value) => update('notes', value)} multiline maxLength={2000} />
            <DateTimeField label={type === 'INTAKE' ? 'Data și ora acceptării' : 'Data și ora confirmării'} value={agreementAt} onChange={setAgreementAt} allowClear showNow />
            <AppText variant="caption" muted>Semnătura clientului este preluată din dosar. Fiecare document poate fi emis separat. {canEditMoney ? 'Generarea salvează și valorile comenzii în finanțe și rapoarte.' : ''}</AppText>
            {error ? <AppText style={{ color: palette.danger }}>{error}</AppText> : null}
          </KeyboardAwareScrollView>
          <View style={styles.actions}><Button variant="outline" label="Închide" disabled={saving} onPress={close} style={styles.flex} /><Button label="Generează PDF" icon="document-text-outline" loading={saving} disabled={loading || !financialOverview} onPress={() => void submit()} style={styles.flex} /></View>
        </View>
      </KeyboardAvoidingView>
    </ModalSafeBottom>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 760, maxHeight: '94%', alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  header: { padding: spacing.lg, gap: spacing.xs },
  content: { padding: spacing.lg, gap: spacing.md },
  item: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  flex: { flex: 1, minWidth: 140 },
  actions: { padding: spacing.lg, flexDirection: 'row', gap: spacing.md },
});
