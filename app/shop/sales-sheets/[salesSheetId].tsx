import { AppHeader } from '@/components/layout/AppHeader';
import { SalesSheetActionsModal } from '@/components/sales/SalesSheetActionsModal';
import { SalesPaymentStatusControl } from '@/components/sales/SalesPaymentStatusControl';
import { SalesDocumentsPanel } from '@/components/sales/SalesDocumentsPanel';
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
import { formatDate, normalizePhoneForWhatsApp } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

const paymentLabels = { CASH: 'Numerar', BANK_TRANSFER: 'Transfer bancar', CARD: 'Plată cu cardul' } as const;
const deliveryLabels = { DELIVERY: 'Cu livrare', PICKUP: 'Fără livrare' } as const;
const money = (value: number, currency: string) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const numberValue = (value: string) => { const parsed = Number(value.replace(',', '.')); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; };
type ExpenseDraft = { id: string; name: string; quantity: string; amount: string };

const pdfFilePart = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'Client';

const salesSheetPdfFileName = (sheet: SalesSheet) => {
  const rawNumber = sheet.number.replace(/^FV-?/i, '');
  const match = rawNumber.match(/^(\d{4})-(\d+)$/);
  const number = match ? `${match[1]}-${match[2].padStart(6, '0')}` : pdfFilePart(rawNumber);
  return `FV-${pdfFilePart(sheet.customerName)}-${number}.pdf`;
};

async function downloadPdfOnWeb(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('PDF-ul nu a putut fi descărcat.');
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function sharePdfOnWeb(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('PDF-ul nu a putut fi pregătit pentru trimitere.');
  const file = new File([await response.blob()], fileName, { type: 'application/pdf' });
  const shareData = { files: [file], title: fileName };
  if (!navigator.share || (navigator.canShare && !navigator.canShare(shareData))) return false;
  await navigator.share(shareData);
  return true;
}

export default function SalesSheetDetailsScreen() {
  const { salesSheetId } = useLocalSearchParams<{ salesSheetId: string }>();
  const { hasPermission } = useAuth();
  const { colors, isDark } = useAppTheme();
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
  const [pdfAction, setPdfAction] = useState<'download' | 'whatsapp' | null>(null);
  const [actionOpen, setActionOpen] = useState<'status' | 'delete' | null>(null);
  const state = useAsyncData<SalesSheet>(() => salesSheetRepository.get(salesSheetId), [salesSheetId]);
  const sheet = state.data;
  useEffect(() => { if (sheet) setPaymentDraft(String(sheet.advancePaid).replace('.', ',')); }, [sheet]);
  if (!hasPermission('sales_sheets.view')) return <Redirect href="/shop/home" />;
  const canViewFinancials = hasPermission('financials.view');
  const canEditPayment = hasPermission('sales_sheets.update');
  const canEditExpenses = canViewFinancials && hasPermission('sales_sheets.update');
  const canDelete = hasPermission('sales_sheets.delete');
  const changeStatus = async (target: SalesSheet) => {
    try {
      const updated = await salesSheetRepository.setStatus(target.id, target.status === 'CANCELLED' ? 'PUBLISHED' : 'CANCELLED');
      state.setData(updated);
      showToast(updated.status === 'CANCELLED' ? 'Fișa a fost anulată și exclusă din statistici.' : 'Fișa a fost reactivată și inclusă în statistici.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Statusul fișei nu a putut fi actualizat.', 'error');
      throw error;
    }
  };
  const deleteSheet = async (target: SalesSheet) => {
    try {
      await salesSheetRepository.remove(target.id);
      showToast(`Fișa ${target.number} a fost ștearsă definitiv.`, 'success');
      router.replace('/shop/sales-sheets' as never);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Fișa nu a putut fi ștearsă.', 'error');
      throw error;
    }
  };

  const handlePdfAction = async (action: 'download' | 'whatsapp') => {
    if (!sheet?.pdfUrl || pdfAction) return;
    setPdfAction(action);
    try {
      const generatedSheet = await salesSheetRepository.generatePdf(sheet.id);
      state.setData(generatedSheet);
      if (!generatedSheet.pdfUrl) throw new Error('PDF-ul nu a putut fi generat.');
      const fileName = salesSheetPdfFileName(generatedSheet);
      if (Platform.OS === 'web') {
        if (action === 'download') {
          await downloadPdfOnWeb(generatedSheet.pdfUrl, fileName);
          showToast(`PDF descărcat: ${fileName}`, 'success');
          return;
        }
        if (await sharePdfOnWeb(generatedSheet.pdfUrl, fileName)) return;
        const phone = normalizePhoneForWhatsApp(generatedSheet.customerPhone);
        if (!phone) throw new Error('Clientul nu are un număr valid pentru WhatsApp.');
        const message = `Bună ziua! Vă trimitem fișa de vânzare ${generatedSheet.number}: ${generatedSheet.pdfUrl}`;
        await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
        return;
      }

      if (!FileSystem.cacheDirectory) throw new Error('Spațiul temporar nu este disponibil.');
      const localUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      const download = await FileSystem.downloadAsync(generatedSheet.pdfUrl, localUri);
      if (download.status < 200 || download.status >= 300) throw new Error('PDF-ul nu a putut fi descărcat.');
      if (!await Sharing.isAvailableAsync()) throw new Error('Trimiterea fișierelor nu este disponibilă pe acest dispozitiv.');
      await Sharing.shareAsync(download.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: action === 'whatsapp' ? 'Trimite PDF-ul pe WhatsApp' : 'Salvează sau deschide PDF-ul',
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Acțiunea asupra PDF-ului nu a putut fi finalizată.', 'error');
    } finally {
      setPdfAction(null);
    }
  };

  const openWhatsAppConversation = async () => {
    if (!sheet) return;
    const phone = normalizePhoneForWhatsApp(sheet.customerPhone);
    if (!phone) return showToast('Clientul nu are un număr valid pentru WhatsApp.', 'error');
    try {
      await Linking.openURL(`https://wa.me/${phone}`);
    } catch {
      showToast('Conversația WhatsApp nu a putut fi deschisă.', 'error');
    }
  };

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
    if (paymentStatus === 'UNPAID' && collected > sheet.totalPrice) return showToast('Banii încasați nu pot depăși totalul fișei.', 'error');
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
          <Card style={[styles.hero, sheet.status === 'CANCELLED' && { backgroundColor: isDark ? '#303740' : '#E5E8EB', borderColor: isDark ? '#59616A' : '#C9CFD6' }]} elevated>
            <View style={[styles.heroIcon, compact && styles.heroIconCompact, { backgroundColor: sheet.status === 'CANCELLED' ? (isDark ? '#4A525B' : '#CDD2D8') : colors.primarySoft }]}><Ionicons name="document-text-outline" size={compact ? 23 : 26} color={sheet.status === 'CANCELLED' ? colors.textMuted : colors.primary} /></View>
            <View style={styles.copy}>
              <View style={styles.titleRow}><AppText variant={compact ? 'heading' : 'title'}>{sheet.number}</AppText>{sheet.status === 'CANCELLED' ? <View style={[styles.status, { backgroundColor: '#66717D' }]}><Ionicons name="ban-outline" size={14} color="#FFFFFF" /><AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '900' }}>ANULATĂ</AppText></View> : <><View style={[styles.status, { backgroundColor: `${palette.success}16` }]}><Ionicons name="checkmark-circle" size={14} color={palette.success} /><AppText variant="caption" style={{ color: palette.success, fontWeight: '900' }}>DOCUMENT EMIS</AppText></View><PaymentBadge paid={sheet.paymentStatus === 'PAID'} />{sheet.paymentStatus === 'UNPAID' ? <AdvanceBadge value={money(sheet.receivedAmount, sheet.currencyCode)} /> : null}</>}</View>
              <AppText variant={compact ? 'caption' : 'body'} muted>{sheet.customerName} · {sheet.productName}</AppText>
              <AppText variant="caption" muted>{formatDate(sheet.documentAt, true)}{sheet.companyName ? ` · ${sheet.companyName}` : ''}</AppText>
            </View>
            <View style={[styles.heroActions, compact && styles.heroActionsCompact]}>
              {hasPermission('sales_sheets.update') ? <Button compact variant="outline" label="Editează" icon="create-outline" onPress={() => router.push(`/shop/sales-sheets/${sheet.id}/edit` as never)} style={styles.heroAction} /> : null}
              <Button compact label={pdfAction === 'download' ? 'Se descarcă…' : 'Descarcă'} icon="download-outline" loading={pdfAction === 'download'} disabled={!sheet.pdfUrl || pdfAction === 'whatsapp'} onPress={() => void handlePdfAction('download')} style={styles.heroAction} />
              <Button compact label={pdfAction === 'whatsapp' ? 'Se pregătește…' : 'WhatsApp'} icon="logo-whatsapp" loading={pdfAction === 'whatsapp'} disabled={!sheet.pdfUrl || pdfAction === 'download'} onPress={() => void handlePdfAction('whatsapp')} style={[styles.heroAction, styles.whatsAppAction]} />
              <Button compact variant="outline" label="Conversație" icon="chatbubble-ellipses-outline" onPress={() => void openWhatsAppConversation()} style={[styles.heroAction, styles.whatsAppConversationAction]} />
              {hasPermission('sales_sheets.update') ? <Button compact variant={sheet.status === 'CANCELLED' ? 'primary' : 'outline'} label={sheet.status === 'CANCELLED' ? 'Reactivează fișa' : 'Anulează fișa'} icon={sheet.status === 'CANCELLED' ? 'refresh-outline' : 'ban-outline'} onPress={() => setActionOpen('status')} style={styles.heroAction} /> : null}
              {canDelete ? <Button compact variant="danger" label="Șterge fișa" icon="trash-outline" onPress={() => setActionOpen('delete')} style={styles.heroAction} /> : null}
            </View>
          </Card>

          {sheet.status === 'CANCELLED' ? <View style={[styles.cancelledNotice, { backgroundColor: isDark ? '#303740' : '#E5E8EB', borderColor: isDark ? '#59616A' : '#C9CFD6' }]}><Ionicons name="information-circle-outline" size={20} color={colors.textMuted} /><AppText variant="caption" style={styles.copy}>Fișa este anulată: valorile de mai jos sunt păstrate pentru consultare, dar nu sunt incluse în totalurile și statisticile Shop. O poți reactiva oricând.</AppText></View> : null}

          <SalesDocumentsPanel sheet={sheet} onGenerated={() => state.reload(true)} />

          <View style={[styles.metrics, compact && styles.metricsCompact]}>
            <Metric compact={compact} label="Total" value={money(sheet.totalPrice, sheet.currencyCode)} color={colors.primary} />
            <Metric compact={compact} label="Bani încasați" value={money(sheet.receivedAmount, sheet.currencyCode)} color={palette.success} />
            <Metric compact={compact} label="Bani de încasat" value={money(sheet.remainingDue, sheet.currencyCode)} color={sheet.remainingDue > 0 ? palette.warning : palette.success} />
            {canViewFinancials ? <Metric compact={compact} label="Rămâne G-Shop" value={money(sheet.gshopNet ?? sheet.totalPrice - (sheet.expenseTotal ?? 0), sheet.currencyCode)} color={(sheet.gshopNet ?? sheet.totalPrice - (sheet.expenseTotal ?? 0)) >= 0 ? palette.purple : palette.danger} /> : null}
          </View>

          <Card style={styles.section} elevated>
            <View style={styles.paymentTitle}><SectionTitle icon="wallet-outline" title="Situația plății" /><View style={styles.copy} />{canEditPayment ? <SalesPaymentStatusControl value={sheet.paymentStatus} compact={compact} disabled={paymentSaving} onChange={(value) => void savePayment(value)} /> : <PaymentBadge paid={sheet.paymentStatus === 'PAID'} />}</View>
            <View style={[styles.paymentInfo, { backgroundColor: sheet.paymentStatus === 'PAID' ? `${palette.success}12` : `${palette.warning}12`, borderColor: sheet.paymentStatus === 'PAID' ? `${palette.success}45` : `${palette.warning}45` }]}><Ionicons name={sheet.paymentStatus === 'PAID' ? 'checkmark-circle-outline' : 'time-outline'} size={21} color={sheet.paymentStatus === 'PAID' ? palette.success : palette.warning} /><AppText variant="caption" style={styles.copy}>{sheet.paymentStatus === 'PAID' ? 'Întregul total este încasat. Dacă revii la Neachitat, avansul memorat va fi folosit din nou.' : 'Completează avansul încasat până acum; restul de plată se recalculează automat.'}</AppText></View>
            {canEditPayment ? <View style={styles.paymentEditor}><View style={styles.paymentField}><Input label="Avans încasat" icon="cash-outline" value={sheet.paymentStatus === 'PAID' ? String(sheet.receivedAmount).replace('.', ',') : paymentDraft} onChangeText={setPaymentDraft} editable={sheet.paymentStatus === 'UNPAID' && !paymentSaving} keyboardType="decimal-pad" /></View><Button label="Salvează suma" icon="checkmark-outline" loading={paymentSaving} disabled={sheet.paymentStatus === 'PAID'} onPress={() => void savePayment('UNPAID')} style={compact ? styles.full : undefined} /></View> : null}
          </Card>

          <Card style={styles.section} elevated><SectionTitle icon="person-outline" title="Client și livrare" /><View style={styles.dataGrid}><Data label="Nume și prenume / Firmă" value={sheet.customerName} /><Data label="Telefon" value={sheet.customerPhone} /><Data label="E-mail" value={sheet.customerEmail} /><Data label="Adresă de livrare" value={sheet.deliveryAddress} wide /><Data label="Observații client" value={sheet.customerNotes} wide /></View></Card>
          <Card style={styles.section} elevated><SectionTitle icon="cube-outline" title="Produs" /><View style={styles.dataGrid}><Data label="Produs / model" value={sheet.productName} wide /><Data label="Cod produs" value={sheet.productCode} /><Data label="Serie / IMEI" value={sheet.serialNumber} /><Data label="Cantitate" value={String(sheet.quantity)} /><Data label="Garanție" value={sheet.warranty} /></View></Card>
          <Card style={styles.section} elevated><SectionTitle icon="card-outline" title="Plată și valori" /><View style={styles.dataGrid}><Data label="Plată" value={paymentLabels[sheet.paymentMethod]} /><Data label="Livrare" value={deliveryLabels[sheet.deliveryMode]} /><Data label="Preț unitar" value={money(sheet.productUnitPrice, sheet.currencyCode)} /><Data label="Preț produse" value={money(sheet.productPrice, sheet.currencyCode)} /><Data label="Manoperă / servicii" value={money(sheet.deliveryPrice, sheet.currencyCode)} /><Data label="Scadență" value={sheet.dueAt ? formatDate(sheet.dueAt, true) : 'Fără scadență'} /></View></Card>

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
    {hasPermission('sales_sheets.update') || canDelete ? <SalesSheetActionsModal visible={actionOpen !== null} sheet={sheet} confirmOnOpen={actionOpen === 'delete'} statusOnOpen={actionOpen === 'status'} onClose={() => setActionOpen(null)} onStatusChange={hasPermission('sales_sheets.update') ? changeStatus : undefined} onDelete={canDelete ? deleteSheet : undefined} /> : null}
  </>;
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) { const { colors } = useAppTheme(); return <View style={styles.sectionTitle}><View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name={icon} size={20} color={colors.primary} /></View><AppText variant="heading">{title}</AppText></View>; }
function Data({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) { return <View style={[styles.data, wide && styles.dataWide]}><AppText variant="caption" muted>{label.toLocaleUpperCase('ro-RO')}</AppText><AppText variant="label">{value || '—'}</AppText></View>; }
function Metric({ compact, label, value, color }: { compact: boolean; label: string; value: string; color: string }) { return <Card style={[styles.metric, compact && styles.metricCompact]}><AppText variant="caption" muted>{label}</AppText><AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{ color }}>{value}</AppText></Card>; }
function PaymentBadge({ paid }: { paid: boolean }) { return <View style={[styles.status, { backgroundColor: `${paid ? palette.success : palette.warning}16` }]}><Ionicons name={paid ? 'checkmark-circle' : 'time'} size={15} color={paid ? palette.success : palette.warning} /><AppText variant="caption" style={{ color: paid ? palette.success : palette.warning, fontWeight: '900' }}>{paid ? 'ACHITAT' : 'NEACHITAT'}</AppText></View>; }
function AdvanceBadge({ value }: { value: string }) { return <View style={[styles.status, { backgroundColor: `${palette.danger}16` }]}><Ionicons name="cash-outline" size={15} color={palette.danger} /><AppText variant="caption" style={{ color: palette.danger, fontWeight: '900' }}>Avans: {value}</AppText></View>; }

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 920, alignSelf: 'center', gap: spacing.md },
  hero: { padding: spacing.md, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  heroIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  heroIconCompact: { width: 42, height: 42, borderRadius: 12 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroActionsCompact: { width: '100%' },
  heroAction: { minWidth: 96, flexGrow: 1, paddingHorizontal: spacing.sm },
  whatsAppAction: { backgroundColor: '#20B85A', borderColor: '#20B85A' },
  whatsAppConversationAction: { borderColor: '#20B85A' },
  copy: { minWidth: 0, flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  status: { minHeight: 24, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 }, full: { width: '100%' },
  cancelledNotice: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metricsCompact: { flexWrap: 'wrap' },
  metric: { minWidth: 150, flex: 1, gap: spacing.xs, padding: spacing.md },
  metricCompact: { minWidth: 0, flex: 0, flexGrow: 1, flexBasis: '46%', minHeight: 84, justifyContent: 'center' },
  section: { gap: spacing.md }, sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, sectionIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, dataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, data: { minWidth: 180, flexGrow: 1, flexBasis: '30%', gap: 4 }, dataWide: { flexBasis: '64%' },
  paymentTitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, paymentInfo: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, paymentEditor: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.md }, paymentField: { minWidth: 220, flex: 1 },
  signature: { padding: spacing.md, borderWidth: 1.5, borderRadius: radius.lg, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, signatureIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  expenseTitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, internalNote: { padding: spacing.sm, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, expenseList: { gap: spacing.xs }, expenseDisplayRow: { minHeight: 52, paddingVertical: spacing.sm, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, expenseIndex: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, emptyExpenses: { minHeight: 70, padding: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, expenseEditRow: { padding: spacing.sm, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, expenseEditFields: { minWidth: 210, flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm }, expenseName: { minWidth: 190, flex: 2 }, expenseQuantity: { minWidth: 105, flex: 0.65 }, expenseAmount: { minWidth: 145, flex: 1 }, expenseLineTotal: { minWidth: 125, minHeight: 52, justifyContent: 'center', gap: 3 }, deleteExpense: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, expenseActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, actionFlex: { minWidth: 200, flex: 1 }, netSummary: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
