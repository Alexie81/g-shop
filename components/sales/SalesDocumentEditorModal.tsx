import { FinanceNumberField } from '@/components/clients/finance/FinanceNumberField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Input } from '@/components/ui/Input';
import { KeyboardAwareScrollView } from '@/components/ui/KeyboardAwareScrollView';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { GenerateSalesDocumentInput, SalesDocument, SalesDocumentType, SalesSheet, ServiceDocumentItem } from '@/types';
import { formatFinanceMoney } from '@/utils/client-finance';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

type Props = {
  visible: boolean;
  type: SalesDocumentType;
  sheet: SalesSheet;
  document?: SalesDocument;
  onGenerate: (input: GenerateSalesDocumentInput) => Promise<void>;
  onClose: () => void;
};

type DraftItem = ServiceDocumentItem & { key: string; directCost: number };

const TITLES: Record<SalesDocumentType, { step: string; title: string; description: string; icon: keyof typeof Ionicons.glyphMap }> = {
  FINAL_ESTIMATE: { step: 'Pasul 1 din 2', title: 'Deviz final', description: 'Desfășurător complet pentru client', icon: 'receipt-outline' },
  WARRANTY: { step: 'Pasul 2 din 2', title: 'Certificat de garanție', description: 'Perioadă, termene și condiții clare', icon: 'shield-checkmark-outline' },
};

let draftSequence = 0;
const draftKey = () => `sales-document-${Date.now()}-${draftSequence++}`;
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const nowIso = () => new Date().toISOString();

export function SalesDocumentEditorModal({ visible, type, sheet, document, onGenerate, onClose }: Props) {
  const { colors } = useAppTheme();
  const definition = TITLES[type];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [documentAt, setDocumentAt] = useState(nowIso());
  const [agreementAt, setAgreementAt] = useState(nowIso());
  const [agreementStatus, setAgreementStatus] = useState<'ACCEPTED' | 'REFUSED'>('ACCEPTED');
  const [technicalAssessment, setTechnicalAssessment] = useState('');
  const [finalNotes, setFinalNotes] = useState('');
  const [parts, setParts] = useState<DraftItem[]>([]);
  const [labor, setLabor] = useState<DraftItem[]>([]);
  const [warrantyPeriod, setWarrantyPeriod] = useState('');
  const [warrantyStartAt, setWarrantyStartAt] = useState(nowIso());
  const [warrantyEndAt, setWarrantyEndAt] = useState('');
  const [warrantyRemediation, setWarrantyRemediation] = useState('10 zile lucrătoare');

  useEffect(() => {
    if (!visible) return;
    const baseDate = document?.documentAt || nowIso();
    setDocumentAt(baseDate);
    setAgreementAt(document?.agreementAt || baseDate);
    setAgreementStatus(document?.agreementStatus || 'ACCEPTED');
    setTechnicalAssessment(document?.technicalAssessment || sheet.customerNotes || sheet.notes || 'Produs verificat conform specificațiilor și configurației agreate.');
    setFinalNotes(document?.finalNotes || sheet.notes || 'Valorile și operațiunile sunt cele prezentate în desfășurătorul de mai jos.');
    setParts(toDraftItems(document?.parts?.length ? document.parts : defaultParts(sheet)));
    setLabor(toDraftItems(document?.labor?.length ? document.labor : defaultLabor(sheet)));
    const period = document?.warrantyPeriod || sheet.warranty || '';
    const start = document?.warrantyStartAt || sheet.documentAt || baseDate;
    setWarrantyPeriod(period);
    setWarrantyStartAt(start);
    setWarrantyEndAt(document?.warrantyEndAt || calculateWarrantyEndAt(start, period));
    setWarrantyRemediation(document?.warrantyRemediation || '10 zile lucrătoare');
    setError('');
  }, [document, sheet, visible]);

  const totals = useMemo(() => ({
    parts: roundMoney(parts.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)),
    labor: roundMoney(labor.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)),
    internal: roundMoney(parts.reduce((sum, item) => sum + item.directCost, 0)),
  }), [labor, parts]);
  const total = roundMoney(totals.parts + totals.labor);
  const received = Math.min(sheet.receivedAmount, total);
  const remaining = Math.max(0, roundMoney(total - received));

  const close = () => { if (!saving) onClose(); };
  const submit = async () => {
    setError('');
    if (!validDate(documentAt)) return setError('Completează o dată validă pentru document.');
    if (type === 'FINAL_ESTIMATE') {
      const invalid = firstInvalidItem([...parts, ...labor]);
      if (invalid) return setError(invalid);
      if (total <= 0) return setError('Devizul trebuie să conțină cel puțin o poziție cu valoare.');
      if (!validDate(agreementAt)) return setError('Completează data acordului final.');
    }
    if (type === 'WARRANTY') {
      if (!warrantyPeriod.trim()) return setError('Completează perioada garanției.');
      if (!validDate(warrantyStartAt)) return setError('Completează data de început a garanției.');
      if (!validDate(warrantyEndAt)) return setError('Completează data de sfârșit a garanției.');
      if (new Date(warrantyEndAt).getTime() < new Date(warrantyStartAt).getTime()) return setError('Data de sfârșit nu poate fi înaintea datei de început.');
    }
    setSaving(true);
    try {
      await onGenerate(type === 'FINAL_ESTIMATE' ? {
        documentAt,
        agreementAt,
        agreementStatus,
        technicalAssessment: technicalAssessment.trim(),
        finalNotes: finalNotes.trim(),
        parts: cleanItems(parts),
        labor: cleanItems(labor),
      } : {
        documentAt,
        warrantyPeriod: warrantyPeriod.trim(),
        warrantyStartAt,
        warrantyEndAt,
        warrantyRemediation: warrantyRemediation.trim(),
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Documentul nu a putut fi generat.');
    } finally { setSaving(false); }
  };

  return <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
    <ModalSafeBottom style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={styles.handleWrap}><View style={[styles.handle, { backgroundColor: colors.border }]} /></View>
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name={definition.icon} size={23} color={colors.primary} /></View>
            <View style={styles.headerCopy}><AppText variant="caption" style={[styles.step, { color: colors.primary }]}>{definition.step}</AppText><AppText variant="title">{definition.title}</AppText><AppText variant="caption" muted>{definition.description}</AppText></View>
            <InfoTooltip title={definition.title} description={type === 'FINAL_ESTIMATE' ? 'Devizul are propriul desfășurător. Fișa emisă rămâne neschimbată, iar situația plății se preia automat din ea.' : 'Certificatul folosește automat clientul, produsul, seria, devizul final, semnătura și ștampila firmei.'} />
            <Pressable accessibilityRole="button" accessibilityLabel="Închide" disabled={saving} onPress={close} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable>
          </View>

          <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" style={styles.content} contentContainerStyle={styles.contentInner}>
            <View style={[styles.autoNotice, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}30` }]}><Ionicons name="sparkles-outline" size={19} color={colors.primary} /><AppText variant="caption" style={styles.noticeCopy}>Firma, clientul, produsul, numerele documentelor, plățile, semnătura și ștampila se completează automat.</AppText></View>

            {type === 'FINAL_ESTIMATE' ? <>
              <View style={styles.titleWithInfo}><AppText variant="heading">Datele devizului</AppText><InfoTooltip title="Document independent" description="Poți detalia sau grupa pozițiile fără să modifici fișa de vânzare deja emisă. Totalul devizului se calculează exclusiv din rândurile de mai jos." /></View>
              <Input label="Constatare / descriere" value={technicalAssessment} onChangeText={setTechnicalAssessment} maxLength={2000} multiline numberOfLines={3} textAlignVertical="top" style={styles.textArea} placeholder="Ce s-a verificat și ce se livrează clientului" />
              <DateTimeField label="Data acordului final" value={agreementAt} onChange={setAgreementAt} allowClear showNow />
              <View style={styles.agreementChoice}><View style={styles.titleWithInfo}><AppText variant="label">Acordul clientului</AppText><InfoTooltip title="Acord final" description="Alegerea apare clar în PDF lângă data acordului. Semnătura salvată în fișa de vânzare este preluată automat." /></View><View accessibilityRole="radiogroup" style={styles.segments}><Segment label="Acceptat" icon="checkmark-circle-outline" selected={agreementStatus === 'ACCEPTED'} onPress={() => setAgreementStatus('ACCEPTED')} /><Segment label="Refuzat" icon="close-circle-outline" selected={agreementStatus === 'REFUSED'} onPress={() => setAgreementStatus('REFUSED')} /></View></View>
              <Input label="Observații finale" value={finalNotes} onChangeText={setFinalNotes} maxLength={2000} multiline numberOfLines={3} textAlignVertical="top" style={styles.textArea} placeholder="Mențiuni care trebuie să apară clientului" />
              <DocumentItemsEditor title="Piese / produse" description="Denumire, cantitate, preț afișat și costul intern." items={parts} onChange={setParts} currencyCode={sheet.currencyCode} showDirectCost />
              <DocumentItemsEditor title="Manoperă / servicii" description="Servicii, instalare, configurare sau livrare." items={labor} onChange={setLabor} currencyCode={sheet.currencyCode} />
              <View style={[styles.summary, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <View style={styles.titleWithInfo}><View style={styles.summaryTitle}><View style={[styles.summaryIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="wallet-outline" size={18} color={colors.primary} /></View><View><AppText variant="heading">Rezumat financiar</AppText><AppText variant="caption" muted>Exact valorile care vor apărea în deviz</AppText></View></View><InfoTooltip title="Calcul automat" description="Totalul devizului este suma pieselor și a serviciilor. Încasat și de încasat folosesc plata curentă din fișa de vânzare, fără a depăși totalul devizului." /></View>
                <View style={styles.summaryGrid}><SummaryValue label="Piese" value={formatFinanceMoney(totals.parts, sheet.currencyCode)} color={colors.primary} /><SummaryValue label="Servicii" value={formatFinanceMoney(totals.labor, sheet.currencyCode)} color={palette.purple} /><SummaryValue label="Cost intern" value={formatFinanceMoney(totals.internal, sheet.currencyCode)} color={palette.warning} internal /><SummaryValue label="Total deviz" value={formatFinanceMoney(total, sheet.currencyCode)} color={colors.primary} accent /></View>
                <View style={styles.paymentGrid}><PaymentValue label="ÎNCASAT" value={received} currency={sheet.currencyCode} color={palette.success} /><PaymentValue label="DE ÎNCASAT" value={remaining} currency={sheet.currencyCode} color={remaining > 0 ? palette.warning : palette.success} /></View>
              </View>
            </> : <>
              <View style={styles.titleWithInfo}><AppText variant="heading">Perioada garanției</AppText><InfoTooltip title="Calculul perioadei" description="Scrie, de exemplu, 90 zile, 24 luni sau 2 ani. Data de final se calculează automat și poate fi corectată manual." /></View>
              <DateTimeField label="Data și ora certificatului" value={documentAt} onChange={setDocumentAt} allowClear showNow />
              <Input label="Perioada garanției *" value={warrantyPeriod} onChangeText={(value) => { setWarrantyPeriod(value); const calculated = calculateWarrantyEndAt(warrantyStartAt, value); if (calculated || !value.trim()) setWarrantyEndAt(calculated); }} maxLength={120} placeholder="ex. 24 luni" />
              <View style={styles.dateRow}><View style={styles.dateField}><DateTimeField label="Garanție de la" value={warrantyStartAt} onChange={(value) => { setWarrantyStartAt(value); const calculated = calculateWarrantyEndAt(value, warrantyPeriod); if (calculated || !value) setWarrantyEndAt(calculated); }} allowClear showNow /></View><View style={styles.dateField}><DateTimeField label="Garanție până la" value={warrantyEndAt} onChange={setWarrantyEndAt} allowClear /></View></View>
              <Input label="Termen estimat de remediere" value={warrantyRemediation} onChangeText={setWarrantyRemediation} maxLength={160} placeholder="ex. 10 zile lucrătoare" />
              <View style={[styles.warrantyPreview, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><View style={[styles.warrantyPreviewIcon, { backgroundColor: `${palette.success}16` }]}><Ionicons name="shield-checkmark" size={23} color={palette.success} /></View><View style={styles.noticeCopy}><AppText variant="label">Certificatul este legat de deviz</AppText><AppText variant="caption" muted>Produsul, seria, valorile financiare, semnătura și ștampila sunt preluate automat. PDF-ul folosește identitatea Calculatoare Profesionale | G-Shop.</AppText></View></View>
            </>}

            {error ? <View accessibilityRole="alert" style={[styles.error, { backgroundColor: `${palette.danger}12`, borderColor: `${palette.danger}35` }]}><Ionicons name="alert-circle-outline" size={19} color={palette.danger} /><AppText variant="caption" style={[styles.noticeCopy, { color: palette.danger }]}>{error}</AppText></View> : null}
          </KeyboardAwareScrollView>

          <View style={styles.actions}><Button compact variant="outline" label="Anulează" disabled={saving} onPress={close} style={styles.action} /><Button compact label={document?.available ? 'Actualizează PDF' : 'Generează PDF'} icon="document-text-outline" loading={saving} onPress={() => void submit()} style={styles.action} /></View>
        </View>
      </KeyboardAvoidingView>
    </ModalSafeBottom>
  </Modal>;
}

function DocumentItemsEditor({ title, description, items, onChange, currencyCode, showDirectCost = false }: { title: string; description: string; items: DraftItem[]; onChange: (items: DraftItem[]) => void; currencyCode: string; showDirectCost?: boolean }) {
  const { colors } = useAppTheme();
  const update = (key: string, patch: Partial<DraftItem>) => onChange(items.map((item) => item.key === key ? { ...item, ...patch } : item));
  return <View style={[styles.itemsSection, { borderColor: colors.border }]}>
    <View style={styles.itemsHeader}><View style={styles.headerCopy}><View style={styles.titleWithInfo}><AppText variant="heading">{title}</AppText>{showDirectCost ? <InfoTooltip title="Cost intern" description="Costul intern este folosit numai pentru calculele G-Shop. Nu apare în PDF și nu este vizibil clientului." /> : null}</View><AppText variant="caption" muted>{description}</AppText></View><Button compact variant="outline" label="Adaugă" icon="add" disabled={items.length >= 60} onPress={() => onChange([...items, { key: draftKey(), name: '', quantity: 1, unitPrice: 0, totalPrice: 0, directCost: 0 }])} /></View>
    {items.length ? <View style={styles.itemList}>{items.map((item, index) => <View key={item.key} style={[styles.itemCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
      <View style={styles.itemHeader}><View style={[styles.position, { backgroundColor: colors.primarySoft }]}><AppText variant="caption" style={{ color: colors.primary, fontWeight: '900' }}>{index + 1}</AppText></View><AppText variant="label" style={styles.positionTitle}>Poziție deviz</AppText><Pressable accessibilityRole="button" accessibilityLabel={`Elimină poziția ${index + 1}`} hitSlop={8} onPress={() => onChange(items.filter((candidate) => candidate.key !== item.key))} style={[styles.remove, { backgroundColor: `${palette.danger}12` }]}><Ionicons name="trash-outline" size={17} color={palette.danger} /></Pressable></View>
      <Input label="Denumire" value={item.name} onChangeText={(name) => update(item.key, { name })} maxLength={180} placeholder={showDirectCost ? 'Ex: Calculator Gaming Ryzen 7' : 'Ex: Instalare și configurare'} />
      <View style={styles.itemFields}><FinanceNumberField label="Cantitate" value={item.quantity} onChange={(quantity) => update(item.key, { quantity, totalPrice: roundMoney(quantity * item.unitPrice) })} style={styles.itemField} /><FinanceNumberField label={`Preț / unitate (${currencyCode})`} value={item.unitPrice} onChange={(unitPrice) => update(item.key, { unitPrice, totalPrice: roundMoney(item.quantity * unitPrice) })} style={styles.itemFieldWide} />{showDirectCost ? <FinanceNumberField label={`Cost intern total (${currencyCode})`} helper="Doar personal" value={item.directCost} onChange={(directCost) => update(item.key, { directCost })} style={styles.itemFieldWide} /> : null}</View>
      <AppText variant="caption" muted style={styles.itemTotal}>Total poziție: {formatFinanceMoney(item.quantity * item.unitPrice, currencyCode)}</AppText>
    </View>)}</View> : <View style={[styles.emptyItems, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="list-outline" size={20} color={colors.textMuted} /><AppText variant="caption" muted>Nu există poziții. Apasă „Adaugă”.</AppText></View>}
  </View>;
}

function Segment({ label, icon, selected, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.segment, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}><Ionicons name={icon} size={18} color={selected ? '#FFFFFF' : colors.primary} /><AppText variant="label" style={{ color: selected ? '#FFFFFF' : colors.text }}>{label}</AppText></Pressable>;
}

function SummaryValue({ label, value, color, accent = false, internal = false }: { label: string; value: string; color: string; accent?: boolean; internal?: boolean }) {
  const { colors } = useAppTheme();
  return <View style={[styles.summaryValue, { backgroundColor: accent ? colors.primarySoft : colors.surface, borderColor: `${color}45` }]}><View style={styles.summaryLabel}><View style={[styles.dot, { backgroundColor: color }]} /><AppText variant="caption" muted>{label}</AppText></View><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: accent ? color : colors.text }}>{value}</AppText>{internal ? <AppText variant="caption" style={{ color: palette.warning, fontWeight: '900' }}>DOAR PERSONAL</AppText> : null}</View>;
}

function PaymentValue({ label, value, currency, color }: { label: string; value: number; currency: string; color: string }) {
  const { colors } = useAppTheme();
  return <View style={[styles.paymentValue, { backgroundColor: colors.surface, borderColor: `${color}45` }]}><AppText variant="caption" style={{ color, fontWeight: '900' }}>{label}</AppText><AppText variant="label" style={{ color }}>{formatFinanceMoney(value, currency)}</AppText></View>;
}

function toDraftItems(items: ServiceDocumentItem[]): DraftItem[] {
  return items.map((item) => ({ key: draftKey(), name: String(item.name ?? '').slice(0, 180), quantity: item.quantity > 0 ? item.quantity : 1, unitPrice: roundMoney(item.unitPrice), totalPrice: roundMoney(item.totalPrice), directCost: roundMoney(item.directCost ?? 0) }));
}
function defaultParts(sheet: SalesSheet): ServiceDocumentItem[] { return [{ name: sheet.productName || 'Produs', quantity: sheet.quantity || 1, unitPrice: sheet.productUnitPrice || 0, totalPrice: sheet.productPrice || 0, directCost: sheet.expenseTotal || 0 }]; }
function defaultLabor(sheet: SalesSheet): ServiceDocumentItem[] { return sheet.deliveryPrice > 0 ? [{ name: sheet.deliveryMode === 'DELIVERY' ? 'Livrare și servicii asociate' : 'Servicii asociate', quantity: 1, unitPrice: sheet.deliveryPrice, totalPrice: sheet.deliveryPrice }] : []; }
function cleanItems(items: DraftItem[]): ServiceDocumentItem[] { return items.filter((item) => item.name.trim() || item.unitPrice > 0 || item.directCost > 0).map((item) => ({ name: item.name.trim(), quantity: roundMoney(item.quantity || 1), unitPrice: roundMoney(item.unitPrice), totalPrice: roundMoney((item.quantity || 1) * item.unitPrice), directCost: roundMoney(item.directCost) })); }
function firstInvalidItem(items: DraftItem[]): string | null { for (const item of items) { if (!item.name.trim() && item.unitPrice <= 0 && item.directCost <= 0) continue; if (!item.name.trim()) return 'Completează denumirea fiecărei poziții cu valori.'; if (!Number.isFinite(item.quantity) || item.quantity <= 0) return 'Cantitatea trebuie să fie mai mare decât zero.'; } return null; }
function validDate(value: string) { return value.trim() !== '' && !Number.isNaN(new Date(value).getTime()); }
function calculateWarrantyEndAt(startAt: string, period: string): string {
  const start = new Date(startAt); if (!startAt.trim() || Number.isNaN(start.getTime())) return '';
  const normalized = period.trim().toLocaleLowerCase('ro-RO').replace(/ă/g, 'a'); const match = normalized.match(/^(\d{1,4})(?:\s*([a-z]+))?/); if (!match) return '';
  const amount = Number(match[1]); const unit = match[2] ?? ''; if (!Number.isInteger(amount) || amount < 1) return '';
  const days = unit === '' || 'zile'.startsWith(unit) || unit === 'zi'; const months = 'luni'.startsWith(unit) || 'luna'.startsWith(unit); const years = 'ani'.startsWith(unit) || unit === 'an'; if (!days && !months && !years) return '';
  const result = new Date(start); if (days) result.setDate(result.getDate() + amount); else { const count = years ? amount * 12 : amount; const day = result.getDate(); result.setDate(1); result.setMonth(result.getMonth() + count); result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate())); } return result.toISOString();
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' }, keyboard: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 820, maxHeight: '95%', alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.md, gap: spacing.md },
  handleWrap: { alignItems: 'center' }, handle: { width: 44, height: 4, borderRadius: radius.pill },
  header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, headerIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, headerCopy: { minWidth: 0, flex: 1, gap: 1 }, step: { fontSize: 10, fontWeight: '900', letterSpacing: .5, textTransform: 'uppercase' }, close: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  content: { minHeight: 0 }, contentInner: { gap: spacing.md, paddingBottom: spacing.sm }, autoNotice: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, noticeCopy: { minWidth: 0, flex: 1 }, titleWithInfo: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, textArea: { minHeight: 78, paddingTop: spacing.md },
  agreementChoice: { gap: spacing.sm }, segments: { flexDirection: 'row', gap: spacing.sm }, segment: { minHeight: 44, flex: 1, borderWidth: 1, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  itemsSection: { borderTopWidth: 1, paddingTop: spacing.md, gap: spacing.sm }, itemsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, itemList: { gap: spacing.sm }, itemCard: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm }, itemHeader: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, position: { width: 27, height: 27, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }, positionTitle: { flex: 1 }, remove: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }, itemFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, itemField: { minWidth: 105, flexBasis: 115 }, itemFieldWide: { minWidth: 180, flex: 1 }, itemTotal: { textAlign: 'right', fontWeight: '800' }, emptyItems: { minHeight: 54, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  summary: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm, gap: spacing.sm }, summaryTitle: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, summaryIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, summaryValue: { minWidth: 130, flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, gap: 4 }, summaryLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 7, height: 7, borderRadius: radius.pill }, paymentGrid: { flexDirection: 'row', gap: spacing.sm }, paymentValue: { minWidth: 130, flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, gap: 3 },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, dateField: { minWidth: 240, flex: 1 }, warrantyPreview: { minHeight: 70, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, warrantyPreviewIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  error: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, actions: { flexDirection: 'row', gap: spacing.sm }, action: { minWidth: 150, flex: 1 },
});
