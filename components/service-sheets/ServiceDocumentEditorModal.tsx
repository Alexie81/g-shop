import { FinanceNumberField } from '@/components/clients/finance/FinanceNumberField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Input } from '@/components/ui/Input';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { ClientFinancialOverview, EstimatedCosts, GenerateServiceDocumentInput, ServiceDocument, ServiceDocumentItem, ServiceDocumentType, ServiceSheet } from '@/types';
import { formatFinanceMoney } from '@/utils/client-finance';
import { calculateEstimatedCosts } from '@/utils/estimated-costs';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

type Props = {
  visible: boolean;
  type: ServiceDocumentType;
  sheet: ServiceSheet;
  document?: ServiceDocument;
  financialOverview?: ClientFinancialOverview;
  onGenerate: (input: GenerateServiceDocumentInput) => Promise<void>;
  onClose: () => void;
};

type DraftItem = ServiceDocumentItem & { key: string; directCost: number };

const TITLES: Record<ServiceDocumentType, { title: string; description: string; icon: keyof typeof Ionicons.glyphMap }> = {
  INTAKE: { title: 'Fișă de intrare', description: 'Acordul inițial și termenul estimat', icon: 'enter-outline' },
  FINAL_ESTIMATE: { title: 'Deviz final', description: 'Constatarea, piesele, manopera și acordul final', icon: 'receipt-outline' },
  EXIT: { title: 'Fișă de ieșire', description: 'Starea produsului și momentul predării', icon: 'exit-outline' },
  WARRANTY: { title: 'Certificat de garanție', description: 'Perioada, obiectul garanției și confirmarea predării', icon: 'shield-checkmark-outline' },
};

let itemSequence = 0;
const draftKey = () => `document-item-${Date.now()}-${itemSequence++}`;
const roundMoney = (value: number) => Math.round(Math.max(0, value) * 100) / 100;

function currentEstimatedCosts(sheet: ServiceSheet, overview?: ClientFinancialOverview): EstimatedCosts {
  const financials = overview?.financials;
  return calculateEstimatedCosts({
    diagnosticFee: financials?.diagnosticFee ?? 0,
    partsCost: financials?.displayedPartsCost ?? sheet.partsCost ?? 0,
    laborCost: financials?.displayedLaborCost ?? sheet.laborCost ?? 0,
    advancePaid: financials?.advancePaid ?? 0,
    discountPercent: financials?.discountPercent ?? 0,
    currencyCode: financials?.currencyCode ?? sheet.currencyCode ?? 'RON',
  });
}

function normalizeEstimatedCosts(value: EstimatedCosts): EstimatedCosts {
  const calculated = calculateEstimatedCosts(value);
  const stored = (key: keyof Pick<EstimatedCosts, 'subtotal' | 'discountAmount' | 'totalDue' | 'receivedAmount' | 'remainingDue'>) => Number.isFinite(value[key]) ? roundMoney(value[key]) : calculated[key];
  return { ...calculated, subtotal: stored('subtotal'), discountAmount: stored('discountAmount'), totalDue: stored('totalDue'), receivedAmount: stored('receivedAmount'), remainingDue: stored('remainingDue') };
}

export function ServiceDocumentEditorModal({ visible, type, sheet, document, financialOverview, onGenerate, onClose }: Props) {
  const { colors } = useAppTheme();
  const [agreementAt, setAgreementAt] = useState('');
  const [agreementStatus, setAgreementStatus] = useState<'ACCEPTED' | 'REFUSED'>('ACCEPTED');
  const [documentAt, setDocumentAt] = useState('');
  const [estimatedRepairDays, setEstimatedRepairDays] = useState('');
  const [productState, setProductState] = useState<'REPAIRED' | 'INITIAL'>('REPAIRED');
  const [technicalAssessment, setTechnicalAssessment] = useState('');
  const [defectCause, setDefectCause] = useState('');
  const [finalNotes, setFinalNotes] = useState('');
  const [parts, setParts] = useState<DraftItem[]>([]);
  const [labor, setLabor] = useState<DraftItem[]>([]);
  const [finalItemsDirty, setFinalItemsDirty] = useState(false);
  const [estimatedCosts, setEstimatedCosts] = useState<EstimatedCosts>(() => calculateEstimatedCosts({ currencyCode: 'RON' }));
  const [warrantyPeriod, setWarrantyPeriod] = useState('');
  const [warrantyStartAt, setWarrantyStartAt] = useState('');
  const [warrantyEndAt, setWarrantyEndAt] = useState('');
  const [warrantyRemediation, setWarrantyRemediation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const definition = TITLES[type];
  const currencyCode = sheet.currencyCode || 'RON';

  useEffect(() => {
    if (!visible) return;
    const now = new Date().toISOString();
    const estimatedDays = document?.estimatedRepairDays ?? sheet.estimatedRepairDays ?? inferEstimatedDays(sheet) ?? (type === 'INTAKE' ? 2 : undefined);
    setAgreementAt(document?.agreementAt ?? (type === 'INTAKE' ? sheet.intakeAgreementAt ?? sheet.signedAt : undefined) ?? now);
    setAgreementStatus(document?.agreementStatus ?? 'ACCEPTED');
    setDocumentAt(document?.documentAt ?? sheet.completedAt ?? now);
    setEstimatedRepairDays(estimatedDays === undefined ? '' : String(estimatedDays));
    setProductState(document?.productState ?? (sheet.workPerformed?.trim() ? 'REPAIRED' : 'INITIAL'));
    setTechnicalAssessment(document?.technicalAssessment ?? sheet.technicalAssessment ?? '');
    setDefectCause(document?.defectCause ?? '');
    setFinalNotes(document?.finalNotes ?? '');
    setParts(toDraftItems(document?.parts?.length ? document.parts : defaultParts(
      sheet,
      financialOverview?.financials.displayedPartsCost,
      financialOverview?.financials.actualPartsCost,
    )));
    setLabor(toDraftItems(document?.labor?.length ? document.labor : defaultLabor(
      sheet,
      financialOverview?.financials.displayedLaborCost,
    )));
    setFinalItemsDirty(false);
    setEstimatedCosts(normalizeEstimatedCosts(document?.estimatedCosts ?? currentEstimatedCosts(sheet, financialOverview)));
    const nextWarrantyPeriod = document?.warrantyPeriod ?? sheet.warranty ?? '';
    const nextWarrantyStartAt = document?.warrantyStartAt ?? sheet.warrantyStartAt ?? sheet.completedAt ?? now;
    setWarrantyPeriod(nextWarrantyPeriod);
    setWarrantyStartAt(nextWarrantyStartAt);
    setWarrantyEndAt(document?.warrantyEndAt ?? sheet.warrantyEndAt ?? calculateWarrantyEndAt(nextWarrantyStartAt, nextWarrantyPeriod));
    setWarrantyRemediation(document?.warrantyRemediation ?? sheet.warrantyRemediation ?? '');
    setSaving(false);
    setError('');
  }, [document, financialOverview, sheet, type, visible]);

  const totals = useMemo(() => ({
    parts: parts.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    labor: labor.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    internal: parts.reduce((sum, item) => sum + item.directCost, 0),
  }), [labor, parts]);

  const close = () => { if (!saving) onClose(); };
  const submit = async () => {
    const cleanParts = cleanItems(parts);
    const cleanLabor = cleanItems(labor);
    if (type !== 'EXIT' && agreementAt.trim() && !validDate(agreementAt)) return setError('Data acordului nu este validă. Șterge valoarea sau alege o dată corectă.');
    if (type === 'EXIT' && documentAt.trim() && !validDate(documentAt)) return setError('Data predării nu este validă. Șterge valoarea sau alege o dată corectă.');
    if (type === 'WARRANTY' && documentAt.trim() && !validDate(documentAt)) return setError('Data certificatului nu este validă.');
    if (type === 'WARRANTY' && warrantyStartAt.trim() && !validDate(warrantyStartAt)) return setError('Data de început a garanției nu este validă.');
    if (type === 'WARRANTY' && warrantyEndAt.trim() && !validDate(warrantyEndAt)) return setError('Data de sfârșit a garanției nu este validă.');
    if (type === 'WARRANTY' && warrantyPeriod.trim().length < 2) return setError('Completează perioada garanției, de exemplu „90 zile”.');
    const days = estimatedRepairDays.trim() === '' ? undefined : Number(estimatedRepairDays);
    if (type === 'INTAKE' && (days === undefined || !Number.isInteger(days) || days < 0 || days > 730)) return setError('Termenul estimat trebuie să fie un număr între 0 și 730 de zile.');
    if (type === 'INTAKE' && !/^[A-Z]{3}$/.test(estimatedCosts.currencyCode)) return setError('Moneda trebuie să fie un cod din 3 litere, de exemplu RON.');
    const invalidPart = firstInvalidItem(parts);
    const invalidLabor = firstInvalidItem(labor);
    if (invalidPart || invalidLabor) return setError(invalidPart ?? invalidLabor ?? 'Verifică pozițiile documentului.');

    const input: GenerateServiceDocumentInput = type === 'INTAKE'
      ? { agreementAt, agreementStatus, estimatedRepairDays: days, estimatedCosts }
      : type === 'FINAL_ESTIMATE'
        ? { agreementAt, agreementStatus, technicalAssessment: technicalAssessment.trim(), defectCause: defectCause.trim() || undefined, finalNotes: finalNotes.trim() || undefined, parts: cleanParts, labor: cleanLabor, syncFinancialsFromItems: finalItemsDirty }
        : type === 'EXIT'
          ? { documentAt, productState }
          : { documentAt, warrantyPeriod: warrantyPeriod.trim(), warrantyStartAt, warrantyEndAt, warrantyRemediation: warrantyRemediation.trim() };

    setSaving(true);
    setError('');
    try {
      await onGenerate(input);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Documentul nu a putut fi generat.');
    } finally {
      setSaving(false);
    }
  };

  return <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
    <ModalSafeBottom style={{ backgroundColor: colors.overlay }}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel="Închide editorul documentului" style={StyleSheet.absoluteFill} onPress={close} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.handleWrap}><View style={[styles.handle, { backgroundColor: colors.border }]} /></View>
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name={definition.icon} size={24} color={colors.primary} /></View>
          <View style={styles.headerCopy}><AppText variant="title">{definition.title}</AppText><AppText variant="caption" muted>{definition.description}</AppText></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Închide" disabled={saving} onPress={close} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
        </View>

        <ScrollView automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={styles.content} contentContainerStyle={styles.contentInner}>
          <View style={[styles.autoNotice, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}30` }]}><Ionicons name="sparkles-outline" size={20} color={colors.primary} /><AppText variant="caption" style={styles.noticeCopy}>Firma, clientul, echipamentul, numărul fișei, valorile financiare și semnătura se preiau automat.</AppText></View>

          {type === 'INTAKE' ? <View style={styles.section}>
            <DateTimeField label="Data acordului pentru costul estimativ" value={agreementAt} onChange={setAgreementAt} allowClear showNow />
            <Input label="Termen estimat (zile lucrătoare)" value={estimatedRepairDays} keyboardType="number-pad" inputMode="numeric" onChangeText={(value) => setEstimatedRepairDays(value.replace(/\D/g, '').slice(0, 3))} placeholder="ex. 3" />
            <View style={styles.agreementChoice}>
              <AppText variant="label">Acord pentru costul estimativ</AppText>
              <AppText variant="caption" muted>Alegerea completează automat declarația clientului din fișa de intrare.</AppText>
              <View accessibilityRole="radiogroup" style={styles.segments}>
                <Segment label="Sunt de acord" icon="checkmark-circle-outline" selected={agreementStatus === 'ACCEPTED'} onPress={() => setAgreementStatus('ACCEPTED')} />
                <Segment label="Nu sunt de acord" icon="close-circle-outline" selected={agreementStatus === 'REFUSED'} onPress={() => setAgreementStatus('REFUSED')} />
              </View>
            </View>
            <View style={[styles.estimateCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
              <View style={styles.estimateHeader}>
                <View style={[styles.estimateIcon, { backgroundColor: `${palette.cyan}18` }]}><Ionicons name="calculator-outline" size={21} color={palette.cyan} /></View>
                <View style={styles.headerCopy}><AppText variant="heading">Costuri estimative</AppText><AppText variant="caption" muted>Aceste valori apar doar în fișa de intrare și rămân neschimbate când actualizezi ulterior finanțele sau devizul.</AppText></View>
              </View>
              <View style={styles.estimateGrid}>
                <FinanceNumberField label={`Diagnostic (${estimatedCosts.currencyCode})`} value={estimatedCosts.diagnosticFee} onChange={(diagnosticFee) => setEstimatedCosts((current) => calculateEstimatedCosts({ ...current, diagnosticFee }))} style={styles.estimateField} />
                <FinanceNumberField label={`Piese estimate (${estimatedCosts.currencyCode})`} value={estimatedCosts.partsCost} onChange={(partsCost) => setEstimatedCosts((current) => calculateEstimatedCosts({ ...current, partsCost }))} style={styles.estimateField} />
                <FinanceNumberField label={`Manoperă estimată (${estimatedCosts.currencyCode})`} value={estimatedCosts.laborCost} onChange={(laborCost) => setEstimatedCosts((current) => calculateEstimatedCosts({ ...current, laborCost }))} style={styles.estimateField} />
                <FinanceNumberField label={`Avans (${estimatedCosts.currencyCode})`} value={estimatedCosts.advancePaid} onChange={(advancePaid) => setEstimatedCosts((current) => calculateEstimatedCosts({ ...current, advancePaid }))} style={styles.estimateField} />
                <FinanceNumberField label="Reducere" value={estimatedCosts.discountPercent} onChange={(discountPercent) => setEstimatedCosts((current) => calculateEstimatedCosts({ ...current, discountPercent: Math.min(100, discountPercent) }))} percentage style={styles.estimateField} />
                <View style={styles.estimateField}><Input label="Monedă" value={estimatedCosts.currencyCode} autoCapitalize="characters" maxLength={3} onChangeText={(currencyCode) => setEstimatedCosts((current) => calculateEstimatedCosts({ ...current, currencyCode: currencyCode.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) }))} placeholder="RON" /></View>
              </View>
              <View style={styles.estimateSummary}>
                <EstimateMetric label="TOTAL ESTIMAT" value={formatFinanceMoney(estimatedCosts.totalDue, estimatedCosts.currencyCode || 'RON')} color={colors.primary} icon="wallet-outline" />
                <EstimateMetric label="ACHITAT" value={formatFinanceMoney(estimatedCosts.receivedAmount, estimatedCosts.currencyCode || 'RON')} color={palette.success} icon="checkmark-circle-outline" />
                <EstimateMetric label="REST ESTIMAT" value={formatFinanceMoney(estimatedCosts.remainingDue, estimatedCosts.currencyCode || 'RON')} color={estimatedCosts.remainingDue > 0 ? palette.warning : palette.success} icon="time-outline" />
              </View>
            </View>
          </View> : null}

          {type === 'FINAL_ESTIMATE' ? <View style={styles.section}>
            <View style={styles.fieldWithHint}>
              <Input label="Diagnosticare / constatare tehnică" value={technicalAssessment} onChangeText={setTechnicalAssessment} maxLength={2000} multiline numberOfLines={5} textAlignVertical="top" style={styles.textArea} placeholder="Descrie diagnosticul care trebuie să apară în devizul final" />
              <AppText variant="caption" muted>Precompletată din fișa de service. Modificarea de aici este păstrată în devizul final.</AppText>
            </View>
            <DateTimeField label="Data acordului final" value={agreementAt} onChange={setAgreementAt} allowClear showNow />
            <View style={styles.agreementChoice}>
              <AppText variant="label">Acordul clientului</AppText>
              <AppText variant="caption" muted>Textul și bifa din deviz se completează automat.</AppText>
              <View accessibilityRole="radiogroup" style={styles.segments}>
                <Segment label="Sunt de acord" icon="checkmark-circle-outline" selected={agreementStatus === 'ACCEPTED'} onPress={() => setAgreementStatus('ACCEPTED')} />
                <Segment label="Nu sunt de acord" icon="close-circle-outline" selected={agreementStatus === 'REFUSED'} onPress={() => setAgreementStatus('REFUSED')} />
              </View>
            </View>
            <Input label="Cauza defectului" value={defectCause} onChangeText={setDefectCause} maxLength={40} placeholder="Ex: componentă defectă" />
            <Input label="Observații finale" value={finalNotes} onChangeText={setFinalNotes} maxLength={2000} multiline numberOfLines={4} textAlignVertical="top" style={styles.textArea} placeholder="Mențiuni pentru deviz și client" />
            <DocumentItemsEditor title="Piese" description="Costul intern este vizibil doar personalului și nu apare clientului." items={parts} onChange={(items) => { setParts(items); setFinalItemsDirty(true); }} currencyCode={currencyCode} showDirectCost />
            <DocumentItemsEditor title="Manoperă" description="Adaugă doar operațiunile care trebuie să apară în deviz." items={labor} onChange={(items) => { setLabor(items); setFinalItemsDirty(true); }} currencyCode={currencyCode} />
            <View style={[styles.summary, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
              <SummaryValue label="Piese afișate" value={formatFinanceMoney(totals.parts, currencyCode)} />
              <SummaryValue label="Manoperă" value={formatFinanceMoney(totals.labor, currencyCode)} />
              <SummaryValue label="Cost intern piese" value={formatFinanceMoney(totals.internal, currencyCode)} internal />
              <SummaryValue label="Total deviz" value={formatFinanceMoney(totals.parts + totals.labor, currencyCode)} accent />
            </View>
          </View> : null}

          {type === 'EXIT' ? <View style={styles.section}>
            <AppText variant="label">Starea produsului la predare</AppText>
            <View accessibilityRole="radiogroup" style={styles.segments}>
              <Segment label="Reparat" icon="checkmark-circle-outline" selected={productState === 'REPAIRED'} onPress={() => setProductState('REPAIRED')} />
              <Segment label="Stare inițială" icon="return-down-back-outline" selected={productState === 'INITIAL'} onPress={() => setProductState('INITIAL')} />
            </View>
            <DateTimeField label="Data și ora predării" value={documentAt} onChange={setDocumentAt} allowClear showNow />
          </View> : null}

          {type === 'WARRANTY' ? <View style={styles.section}>
            <DateTimeField label="Data și ora certificatului" value={documentAt} onChange={setDocumentAt} allowClear showNow />
            <Input label="Perioada garanției *" value={warrantyPeriod} onChangeText={(value) => {
              setWarrantyPeriod(value);
              const calculated = calculateWarrantyEndAt(warrantyStartAt, value);
              if (calculated || !value.trim()) setWarrantyEndAt(calculated);
            }} maxLength={120} placeholder="ex. 90 zile, 3 luni sau 1 an" />
            <View style={styles.dateRow}>
              <View style={styles.dateField}><DateTimeField label="Garanție de la" value={warrantyStartAt} onChange={(value) => {
                setWarrantyStartAt(value);
                const calculated = calculateWarrantyEndAt(value, warrantyPeriod);
                if (calculated || !value) setWarrantyEndAt(calculated);
              }} allowClear showNow /></View>
              <View style={styles.dateField}><DateTimeField label="Garanție până la" value={warrantyEndAt} onChange={setWarrantyEndAt} allowClear /></View>
            </View>
            <Input label="Remediere estimată" value={warrantyRemediation} onChangeText={setWarrantyRemediation} maxLength={160} placeholder="ex. 10 zile lucrătoare" />
            <View style={[styles.autoNotice, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><Ionicons name="business-outline" size={20} color={colors.primary} /><AppText variant="caption" style={styles.noticeCopy}>Contactul service, firma, echipamentul, numerele documentelor, semnătura clientului și ștampila se completează automat.</AppText></View>
          </View> : null}

          {error ? <View accessibilityRole="alert" style={[styles.error, { backgroundColor: `${palette.danger}12`, borderColor: `${palette.danger}35` }]}><Ionicons name="alert-circle-outline" size={19} color={palette.danger} /><AppText variant="caption" style={[styles.noticeCopy, { color: palette.danger }]}>{error}</AppText></View> : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button variant="outline" label="Anulează" disabled={saving} onPress={close} style={styles.action} />
          <Button label={document?.available ? 'Actualizează PDF-ul' : 'Generează documentul'} icon="document-text-outline" loading={saving} onPress={() => void submit()} style={styles.action} />
        </View>
      </View>
    </KeyboardAvoidingView>
    </ModalSafeBottom>
  </Modal>;
}

function DocumentItemsEditor({ title, description, items, onChange, currencyCode, showDirectCost = false }: { title: string; description: string; items: DraftItem[]; onChange: (items: DraftItem[]) => void; currencyCode: string; showDirectCost?: boolean }) {
  const { colors } = useAppTheme();
  const update = (key: string, patch: Partial<DraftItem>) => onChange(items.map((item) => item.key === key ? { ...item, ...patch } : item));
  const add = () => onChange([...items, { key: draftKey(), name: '', quantity: 1, unitPrice: 0, totalPrice: 0, directCost: 0 }]);
  const remove = (key: string) => onChange(items.filter((item) => item.key !== key));
  return <View style={[styles.itemsSection, { borderColor: colors.border }]}>
    <View style={styles.itemsHeader}><View style={styles.headerCopy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>{description}</AppText></View><Button compact variant="outline" label="Adaugă" icon="add" disabled={items.length >= 60} onPress={add} /></View>
    {items.length ? <View style={styles.itemList}>{items.map((item, index) => <View key={item.key} style={[styles.itemCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
      <View style={styles.itemHeader}><AppText variant="label">Poziția {index + 1}</AppText><Pressable accessibilityRole="button" accessibilityLabel={`Elimină poziția ${index + 1}`} hitSlop={8} onPress={() => remove(item.key)} style={[styles.remove, { backgroundColor: `${palette.danger}12` }]}><Ionicons name="trash-outline" size={18} color={palette.danger} /></Pressable></View>
      <Input label="Denumire" value={item.name} onChangeText={(name) => update(item.key, { name })} maxLength={180} placeholder={showDirectCost ? 'Ex: SSD 1 TB' : 'Ex: diagnosticare și montaj'} />
      <View style={styles.itemFields}>
        <FinanceNumberField label="Cantitate" value={item.quantity} onChange={(quantity) => update(item.key, { quantity, totalPrice: roundMoney(quantity * item.unitPrice) })} style={styles.itemField} />
        <FinanceNumberField label={`Preț afișat / unitate (${currencyCode})`} value={item.unitPrice} onChange={(unitPrice) => update(item.key, { unitPrice, totalPrice: roundMoney(item.quantity * unitPrice) })} style={styles.itemFieldWide} />
        {showDirectCost ? <FinanceNumberField label={`Cost intern total (${currencyCode})`} helper="Doar staff" value={item.directCost} onChange={(directCost) => update(item.key, { directCost })} style={styles.itemFieldWide} /> : null}
      </View>
      <AppText variant="caption" muted style={styles.itemTotal}>Total afișat: {formatFinanceMoney(item.quantity * item.unitPrice, currencyCode)}</AppText>
    </View>)}</View> : <View style={[styles.emptyItems, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="list-outline" size={21} color={colors.textMuted} /><AppText variant="caption" muted>Nu există poziții. Adaugă numai rândurile utile.</AppText></View>}
  </View>;
}

function Segment({ label, icon, selected, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.segment, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.76 : 1 }]}><Ionicons name={icon} size={19} color={selected ? '#fff' : colors.primary} /><AppText variant="label" style={{ color: selected ? '#fff' : colors.text }}>{label}</AppText></Pressable>;
}

function SummaryValue({ label, value, accent = false, internal = false }: { label: string; value: string; accent?: boolean; internal?: boolean }) {
  const { colors } = useAppTheme();
  return <View style={styles.summaryValue}><AppText variant="caption" muted>{label}{internal ? ' · staff' : ''}</AppText><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color: accent ? colors.primary : undefined }}>{value}</AppText></View>;
}

function EstimateMetric({ label, value, color, icon }: { label: string; value: string; color: string; icon: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useAppTheme();
  return <View style={[styles.estimateMetric, { backgroundColor: colors.surface, borderColor: `${color}38` }]}>
    <View style={[styles.estimateMetricIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={17} color={color} /></View>
    <View style={styles.estimateMetricCopy}><AppText variant="caption" style={[styles.estimateMetricLabel, { color }]}>{label}</AppText><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{value}</AppText></View>
  </View>;
}

function toDraftItems(items: ServiceDocumentItem[]): DraftItem[] {
  return items.filter((item) => item.name?.trim() || item.quantity > 0 || item.unitPrice > 0 || (item.directCost ?? 0) > 0).map((item) => ({
    key: draftKey(),
    name: String(item.name ?? '').slice(0, 180),
    quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
    unitPrice: roundMoney(item.unitPrice),
    totalPrice: roundMoney((item.quantity || 1) * item.unitPrice),
    directCost: roundMoney(item.directCost ?? 0),
  }));
}

function defaultParts(sheet: ServiceSheet, displayedPartsCost?: number, actualPartsCost?: number): ServiceDocumentItem[] {
  const name = compactName(sheet.partsUsed, 'Piese și componente');
  const displayedCost = roundMoney(displayedPartsCost ?? sheet.partsCost);
  const internalCost = roundMoney(actualPartsCost ?? 0);
  if (!sheet.partsUsed?.trim() && displayedCost <= 0 && internalCost <= 0) return [];
  return [{ name, quantity: 1, unitPrice: displayedCost, totalPrice: displayedCost, directCost: internalCost }];
}

function defaultLabor(sheet: ServiceSheet, displayedLaborCost?: number): ServiceDocumentItem[] {
  const name = compactName(sheet.workPerformed, 'Manoperă service');
  const displayedCost = roundMoney(displayedLaborCost ?? sheet.laborCost);
  if (!sheet.workPerformed?.trim() && displayedCost <= 0) return [];
  return [{ name, quantity: 1, unitPrice: displayedCost, totalPrice: displayedCost }];
}

function compactName(value: string | undefined, fallback: string) {
  return (value?.replace(/\s+/g, ' ').trim() || fallback).slice(0, 180);
}

function cleanItems(items: DraftItem[]): ServiceDocumentItem[] {
  return items.filter((item) => item.name.trim() || item.quantity > 0 && (item.unitPrice > 0 || item.directCost > 0)).map((item) => ({
    name: item.name.trim(),
    quantity: roundMoney(item.quantity || 1),
    unitPrice: roundMoney(item.unitPrice),
    totalPrice: roundMoney((item.quantity || 1) * item.unitPrice),
    directCost: roundMoney(item.directCost),
  }));
}

function firstInvalidItem(items: DraftItem[]): string | null {
  for (const item of items) {
    const hasValues = item.name.trim() || item.unitPrice > 0 || item.directCost > 0;
    if (!hasValues) continue;
    if (!item.name.trim()) return 'Completează denumirea fiecărei poziții care are valori.';
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return 'Cantitatea trebuie să fie mai mare decât zero.';
  }
  return null;
}

function inferEstimatedDays(sheet: ServiceSheet): number | undefined {
  if (!sheet.estimatedAt || !sheet.receivedAt) return undefined;
  const difference = new Date(sheet.estimatedAt).getTime() - new Date(sheet.receivedAt).getTime();
  if (!Number.isFinite(difference) || difference <= 0) return undefined;
  return Math.max(1, Math.ceil(difference / 86_400_000));
}

function validDate(value: string) { return value.trim() !== '' && !Number.isNaN(new Date(value).getTime()); }

function calculateWarrantyEndAt(startAt: string, period: string): string {
  const start = new Date(startAt);
  if (!startAt.trim() || Number.isNaN(start.getTime())) return '';
  const normalized = period.trim().toLocaleLowerCase('ro-RO').replace(/ă/g, 'a');
  const match = normalized.match(/^(\d{1,4})(?:\s*([a-z]+))?/);
  if (!match) return '';
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount < 1) return '';
  const unit = match[2] ?? '';
  const isDays = unit === '' || 'zile'.startsWith(unit) || unit === 'zi';
  const isMonths = 'luni'.startsWith(unit) || 'luna'.startsWith(unit);
  const isYears = 'ani'.startsWith(unit) || unit === 'an';
  if (!isDays && !isMonths && !isYears) return '';
  const result = new Date(start);
  if (isDays) {
    result.setDate(result.getDate() + amount);
  } else {
    const months = isYears ? amount * 12 : amount;
    const originalDay = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(originalDay, lastDay));
  }
  return result.toISOString();
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 820, maxHeight: '94%', alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  handleWrap: { alignItems: 'center' },
  handle: { width: 48, height: 5, borderRadius: radius.pill },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIcon: { width: 48, height: 48, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { minWidth: 0, flex: 1, gap: 2 },
  close: { width: 42, height: 42, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  content: { minHeight: 0 },
  contentInner: { gap: spacing.lg, paddingBottom: spacing.sm },
  autoNotice: { minHeight: 58, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noticeCopy: { minWidth: 0, flex: 1 },
  section: { gap: spacing.lg },
  agreementChoice: { gap: spacing.sm },
  estimateCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  estimateHeader: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  estimateIcon: { width: 42, height: 42, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  estimateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  estimateField: { minWidth: 190, flex: 1 },
  estimateSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  estimateMetric: { minWidth: 180, minHeight: 64, flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  estimateMetricIcon: { width: 34, height: 34, flexShrink: 0, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  estimateMetricCopy: { minWidth: 0, flex: 1, gap: 2 },
  estimateMetricLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.35 },
  textArea: { minHeight: 94, paddingTop: spacing.md },
  fieldWithHint: { gap: spacing.xs },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dateField: { minWidth: 250, flex: 1 },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segment: { minHeight: 50, minWidth: 180, flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  itemsSection: { borderTopWidth: 1, paddingTop: spacing.lg, gap: spacing.md },
  itemsHeader: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemList: { gap: spacing.md },
  itemCard: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  itemHeader: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  remove: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  itemFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  itemField: { minWidth: 105, flexGrow: 0, flexBasis: 120 },
  itemFieldWide: { minWidth: 190, flex: 1 },
  itemTotal: { textAlign: 'right', fontWeight: '800' },
  emptyItems: { minHeight: 64, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  summary: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryValue: { minWidth: 130, flex: 1, gap: 3 },
  error: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { minWidth: 210, flex: 1 },
});
