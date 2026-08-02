import { ClientFinanceSection } from '@/components/clients/finance';
import { SERVICE_STATUS_LABELS } from '@/components/service-sheets/ServiceSheetStatus';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { clientRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { apiRequest, ApiError } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { Client, ClientFinancialOverview, ServiceSheet, ServiceSheetStatus, UUID } from '@/types';
import { calculateClientFinance, ClientFinanceValue, formatFinanceMoney } from '@/utils/client-finance';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

type Intake = { equipmentType?: string; brand?: string; model?: string; problem?: string; notes?: string; requestType?: string };
type Form = {
  clientId: string;
  equipment: string;
  brand: string;
  model: string;
  serialNumber: string;
  accessories: string;
  reportedIssue: string;
  technicalAssessment: string;
  workPerformed: string;
  partsUsed: string;
  partsCost: string;
  laborCost: string;
  actualPartsCost: string;
  showCompanyDetails: boolean;
  warranty: string;
  storageAfter: string;
  handoverNotes: string;
  identityDocument: string;
  approveDiagnostics: boolean;
  approveRepair: boolean;
  repairRefused: boolean;
  productDelivered: boolean;
  receivedAt: string;
  estimatedAt: string;
  completedAt: string;
  status: ServiceSheetStatus;
  internalNotes: string;
};
type Props = { propertyId: UUID; clientId?: UUID; sheet?: ServiceSheet; initialShowCompanyDetails?: boolean };

const emptyFinance: ClientFinanceValue = {
  currencyCode: 'RON', exchangeRateToRon: 1, workPrice: 0, diagnosticFee: 0, advancePaid: 0,
  discountPercent: 0, actualPartsCost: 0, displayedPartsCost: 0, displayedLaborCost: 0, paymentStatus: 'UNPAID',
};

const blank: Form = {
  clientId: '',
  equipment: '',
  brand: '',
  model: '',
  serialNumber: '',
  accessories: '',
  reportedIssue: '',
  technicalAssessment: '',
  workPerformed: '',
  partsUsed: '',
  partsCost: '0',
  laborCost: '0',
  actualPartsCost: '0',
  showCompanyDetails: true,
  warranty: '',
  storageAfter: '',
  handoverNotes: '',
  identityDocument: '',
  approveDiagnostics: false,
  approveRepair: false,
  repairRefused: false,
  productDelivered: false,
  receivedAt: new Date().toISOString().slice(0, 10),
  estimatedAt: '',
  completedAt: '',
  status: 'NEW',
  internalNotes: '',
};

function formFromSheet(sheet: ServiceSheet): Form {
  return {
    clientId: sheet.clientId,
    equipment: sheet.equipment,
    brand: sheet.brand ?? '',
    model: sheet.model ?? '',
    serialNumber: sheet.serialNumber ?? '',
    accessories: sheet.accessories ?? '',
    reportedIssue: sheet.reportedIssue,
    technicalAssessment: sheet.technicalAssessment ?? '',
    workPerformed: sheet.workPerformed ?? '',
    partsUsed: sheet.partsUsed ?? '',
    partsCost: String(sheet.partsCost ?? 0),
    laborCost: String(sheet.laborCost ?? 0),
    actualPartsCost: '0',
    showCompanyDetails: sheet.showCompanyDetails ?? true,
    warranty: sheet.warranty ?? '',
    storageAfter: sheet.storageAfter ?? '',
    handoverNotes: sheet.handoverNotes ?? '',
    identityDocument: sheet.identityDocument ?? '',
    approveDiagnostics: sheet.approveDiagnostics ?? false,
    approveRepair: sheet.approveRepair ?? false,
    repairRefused: sheet.repairRefused ?? false,
    productDelivered: sheet.productDelivered ?? false,
    receivedAt: sheet.receivedAt?.slice(0, 10) ?? '',
    estimatedAt: sheet.estimatedAt?.slice(0, 10) ?? '',
    completedAt: sheet.completedAt?.slice(0, 10) ?? '',
    status: sheet.status,
    internalNotes: sheet.internalNotes ?? '',
  };
}

export function ServiceSheetForm({ propertyId, clientId, sheet, initialShowCompanyDetails = true }: Props) {
  const associatedClientId = sheet?.clientId ?? clientId;
  const [form, setForm] = useState<Form>(() => sheet ? formFromSheet(sheet) : { ...blank, clientId: clientId ?? '', showCompanyDetails: initialShowCompanyDetails });
  const [client, setClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [prefilling, setPrefilling] = useState(Boolean(associatedClientId));
  const [financePrefilling, setFinancePrefilling] = useState(false);
  const [financeOverview, setFinanceOverview] = useState<ClientFinancialOverview | null>(null);
  const [financeValue, setFinanceValue] = useState<ClientFinanceValue>(() => ({ ...emptyFinance, currencyCode: sheet?.currencyCode ?? 'RON', displayedPartsCost: sheet?.partsCost ?? 0, displayedLaborCost: sheet?.laborCost ?? 0 }));
  const [financeSourceClientId, setFinanceSourceClientId] = useState<UUID | null>(null);
  const [currencyCode, setCurrencyCode] = useState(sheet?.currencyCode ?? 'RON');
  const [choosingClient, setChoosingClient] = useState(false);
  const { hasPermission } = useAuth();
  const { colors } = useAppTheme();
  const canLoadFinancials = hasPermission('financials.view');
  const canEditFinancials = canLoadFinancials && hasPermission('clients.update');
  const { showToast } = useToast();

  const applyClientFinance = useCallback((overview: ClientFinancialOverview, selectedClientId: UUID) => {
    setCurrencyCode(overview.financials.currencyCode || 'RON');
    setFinanceValue({ ...emptyFinance, ...overview.financials });
    setForm((current) => current.clientId !== selectedClientId ? current : {
      ...current,
      partsCost: String(overview.financials.displayedPartsCost ?? 0),
      laborCost: String(overview.financials.displayedLaborCost ?? 0),
      actualPartsCost: String(overview.financials.actualPartsCost ?? 0),
    });
    setFinanceSourceClientId(selectedClientId);
  }, []);

  useEffect(() => {
    clientRepository.list(propertyId).then((result) => setClients(result.data)).catch(() => undefined);
  }, [propertyId]);

  useEffect(() => {
    if (!associatedClientId) return;

    if (sheet) {
      clientRepository.get(associatedClientId)
        .then(setClient)
        .catch((error) => showToast(error instanceof Error ? error.message : 'Clientul nu a putut fi încărcat.', 'error'))
        .finally(() => setPrefilling(false));
      return;
    }

    Promise.all([
      clientRepository.get(associatedClientId),
      apiRequest<Intake | null>('/clients/' + associatedClientId + '/intake').catch(() => null),
    ]).then(([nextClient, intake]) => {
      setClient(nextClient);
      setForm((current) => ({
        ...current,
        clientId: associatedClientId,
        equipment: intake?.equipmentType ?? '',
        brand: intake?.brand ?? '',
        model: intake?.model ?? '',
        reportedIssue: intake?.problem ?? '',
        internalNotes: intake?.notes ?? '',
      }));
    }).catch((error) => {
      showToast(error instanceof Error ? error.message : 'Clientul nu a putut fi încărcat.', 'error');
    }).finally(() => setPrefilling(false));
  }, [associatedClientId, sheet, showToast]);

  useEffect(() => {
    if (!form.clientId || !canLoadFinancials) {
      setFinanceOverview(null);
      setFinancePrefilling(false);
      return;
    }
    const selectedClientId = form.clientId;
    let cancelled = false;
    setFinancePrefilling(true);
    setFinanceOverview(null);
    if (!sheet) setFinanceSourceClientId(null);

    clientRepository.getFinancials(selectedClientId).then((overview) => {
      if (cancelled) return;
      setFinanceOverview(overview);
      applyClientFinance(overview, selectedClientId);
    }).catch((error) => {
      if (!cancelled) showToast(error instanceof Error ? error.message : 'Finanțele clientului nu au putut fi încărcate.', 'error');
    }).finally(() => {
      if (!cancelled) setFinancePrefilling(false);
    });

    return () => { cancelled = true; };
  }, [applyClientFinance, canLoadFinancials, form.clientId, sheet, showToast]);

  const update = <K extends keyof Form>(key: K, value: Form[K]) => {
    if (key === 'clientId') {
      const nextClientId = value as Form['clientId'];
      if (form.clientId === nextClientId) {
        setChoosingClient(false);
        return;
      }
      setForm((current) => ({
        ...current,
        clientId: nextClientId,
        partsCost: '0',
        laborCost: '0',
        actualPartsCost: '0',
      }));
      setClient(clients.find((item) => item.id === nextClientId) ?? null);
      setCurrencyCode('RON');
      setFinanceValue({ ...emptyFinance });
      setFinanceOverview(null);
      setFinanceSourceClientId(null);
      setChoosingClient(false);
      return;
    }
    setForm((current) => ({ ...current, [key]: value }));
  };

  const collaborators = financeOverview?.collaborators ?? (financeOverview?.collaborator ? [financeOverview.collaborator] : []);
  const collaboratorCost = collaborators.reduce((total, item) => total + (item.amount ?? 0), 0);
  const collaboratorPaid = collaborators.reduce((total, item) => total + (item.paid ?? 0), 0);
  const calculations = calculateClientFinance(financeValue, financeOverview?.expenses ?? [], collaboratorCost, collaboratorPaid);
  const parts = financeValue.displayedPartsCost;
  const labor = financeValue.displayedLaborCost;
  const direct = calculations.internalCosts;
  const total = calculations.totalDue;
  const net = calculations.gshopNet;

  const submit = async () => {
    if (!form.clientId || form.equipment.trim().length < 2 || form.reportedIssue.trim().length < 5) {
      return showToast('Alege clientul și completează echipamentul și problema.', 'error');
    }

    const editableFields = {
      equipment: form.equipment.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      serialNumber: form.serialNumber.trim(),
      accessories: form.accessories.trim(),
      reportedIssue: form.reportedIssue.trim(),
      technicalAssessment: form.technicalAssessment.trim(),
      workPerformed: form.workPerformed.trim(),
      partsUsed: form.partsUsed.trim(),
      partsCost: parts,
      laborCost: labor,
      totalCost: total,
      directCosts: direct,
      netValue: net,
      currencyCode: financeValue.currencyCode,
      showCompanyDetails: form.showCompanyDetails,
      warranty: form.warranty.trim(),
      storageAfter: form.storageAfter.trim(),
      handoverNotes: form.handoverNotes.trim(),
      identityDocument: form.identityDocument.trim(),
      approveDiagnostics: form.approveDiagnostics,
      approveRepair: form.approveRepair,
      repairRefused: form.repairRefused,
      productDelivered: form.productDelivered,
      receivedAt: form.receivedAt || new Date().toISOString(),
      completedAt: form.completedAt || undefined,
      status: form.status,
      internalNotes: form.internalNotes.trim(),
      estimatedAt: form.estimatedAt || undefined,
    };

    setLoading(true);
    try {
      if (canEditFinancials) await clientRepository.updateFinancials(form.clientId, financeValue);
      const saved = sheet
        ? await serviceSheetRepository.update(sheet.id, editableFields)
        : await serviceSheetRepository.create({
          ...editableFields,
          propertyId,
          clientId: form.clientId,
          currencyCode: financeValue.currencyCode,
        });
      showToast(sheet ? 'Fișa de service a fost actualizată.' : 'Fișa de service a fost creată.', 'success');
      router.replace(('/service/service-sheets/' + saved.id) as never);
    } catch (error) {
      if (!sheet && error instanceof ApiError && error.status === 409) {
        const details = error.details as { code?: unknown; serviceSheetId?: unknown } | undefined;
        if (details?.code === 'SERVICE_SHEET_ALREADY_EXISTS' && typeof details.serviceSheetId === 'string') {
          showToast('Clientul are deja o fișă de service. Am deschis fișa existentă.', 'success');
          router.replace(('/service/service-sheets/' + details.serviceSheetId) as never);
          return;
        }
      }
      showToast(error instanceof Error ? error.message : 'Fișa nu a putut fi salvată.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return <View style={styles.form}>
    <Card style={styles.section}>
      <AppText variant="heading">Client</AppText>
      {client && !choosingClient ? <View style={styles.clientSummary}>
        <View style={styles.clientCopy}><AppText variant="label">{client.firstName} {client.lastName}</AppText><AppText variant="caption" muted>{client.phone} · {client.email || 'fără email'}</AppText></View>
        {sheet ? null : <Button compact variant="outline" label="Schimbă clientul" icon="swap-horizontal-outline" onPress={() => setChoosingClient(true)} />}
      </View> : prefilling ? <AppText variant="caption" muted>Se încarcă datele clientului…</AppText> : sheet ? <AppText variant="caption" muted>Clientul asociat nu a putut fi încărcat.</AppText> : <View style={styles.clientGrid}>
        {clients.map((item) => <Button key={item.id} compact variant={form.clientId === item.id ? 'primary' : 'outline'} label={item.firstName + ' ' + item.lastName} onPress={() => update('clientId', item.id)} />)}
      </View>}
      {prefilling ? null : sheet ? <AppText variant="caption" muted>Clientul asociat și istoricul fișei rămân neschimbate.</AppText> : clientId === form.clientId ? <AppText variant="caption" style={{ color: '#14A83B' }}>Datele disponibile din formularul QR au fost precompletate.</AppText> : null}
      {financePrefilling ? <AppText variant="caption" muted>Se încarcă valorile financiare ale clientului…</AppText> : financeSourceClientId === form.clientId ? <AppText variant="caption" style={styles.financeHint}>Costurile și moneda sunt sincronizate automat cu finanțele clientului.</AppText> : null}
    </Card>

    <Card style={[styles.documentPreference, { borderColor: form.showCompanyDetails ? colors.primary : colors.border, backgroundColor: form.showCompanyDetails ? colors.primarySoft : colors.surface }]}>
      <View style={[styles.documentIcon, { backgroundColor: form.showCompanyDetails ? colors.primary : colors.surfaceMuted }]}><Ionicons name="business-outline" size={23} color={form.showCompanyDetails ? '#FFFFFF' : colors.textMuted} /></View>
      <View style={styles.documentCopy}><AppText variant="label">Afișează datele firmei</AppText><AppText variant="caption" muted>Denumirea, datele juridice și ștampila vor apărea în PDF.</AppText></View>
      <Switch accessibilityLabel="Afișează datele firmei în fișa de service" value={form.showCompanyDetails} onValueChange={(value) => update('showCompanyDetails', value)} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
    </Card>

    {canLoadFinancials && form.clientId ? <ClientFinanceSection
      value={financeValue}
      expenses={financeOverview?.expenses ?? []}
      collaboratorCost={collaboratorCost}
      collaboratorPaid={collaboratorPaid}
      disabled={!canEditFinancials || financePrefilling}
      onChange={(next) => { setFinanceValue(next); setCurrencyCode(next.currencyCode); }}
    /> : null}

    {financeOverview && collaborators.length ? <Card style={styles.section}>
      <AppText variant="heading">Colaboratorii fișei</AppText>
      <AppText variant="caption" muted>Atribuirile și comisioanele sunt preluate automat din client.</AppText>
      <View style={styles.collaboratorList}>{collaborators.map((collaborator) => <View key={collaborator.id} style={[styles.collaboratorChip, { borderColor: palette.cyan }]}><Ionicons name="person-outline" size={17} color={palette.cyan} /><View style={styles.clientCopy}><AppText variant="label">{collaborator.name}</AppText><AppText variant="caption" muted>{collaborator.commissionType === 'FIXED' ? `${formatFinanceMoney(collaborator.commissionValue ?? 0, currencyCode)} sumă fixă` : `${collaborator.commissionValue ?? 0}% ${collaborator.commissionType === 'PERCENT_TOTAL' ? 'din total' : 'din net'}`} · {collaborator.status === 'PAID' ? 'achitat' : `${formatFinanceMoney(collaborator.due, currencyCode)} de achitat`}</AppText></View></View>)}</View>
    </Card> : null}

    <Card style={styles.section}>
      <AppText variant="heading">Echipament</AppText>
      <View style={styles.row}>
        <View style={styles.field}><Input label="Tip echipament *" value={form.equipment} onChangeText={(value) => update('equipment', value)} /></View>
        <View style={styles.field}><Input label="Marcă" value={form.brand} onChangeText={(value) => update('brand', value)} /></View>
      </View>
      <View style={styles.row}>
        <View style={styles.field}><Input label="Model" value={form.model} onChangeText={(value) => update('model', value)} /></View>
        <View style={styles.field}><Input label="Serie" value={form.serialNumber} onChangeText={(value) => update('serialNumber', value)} /></View>
      </View>
      <Input label="Accesorii predate" value={form.accessories} onChangeText={(value) => update('accessories', value)} />
    </Card>

    <Card style={styles.section}>
      <AppText variant="heading">Diagnostic și lucrări</AppText>
      <Input label="Problemă declarată *" multiline numberOfLines={4} textAlignVertical="top" style={{ minHeight: 90 }} value={form.reportedIssue} onChangeText={(value) => update('reportedIssue', value)} />
      <Input label="Constatare tehnică" multiline value={form.technicalAssessment} onChangeText={(value) => update('technicalAssessment', value)} />
      <Input label="Lucrări efectuate" multiline value={form.workPerformed} onChangeText={(value) => update('workPerformed', value)} />
      <Input label="Piese utilizate / necesare" multiline value={form.partsUsed} onChangeText={(value) => update('partsUsed', value)} />
    </Card>

    <Card style={styles.section}>
      <AppText variant="heading">Planificare și observații</AppText>
      <View style={styles.row}><View style={styles.field}><Input label="Data primirii" placeholder="AAAA-LL-ZZ" value={form.receivedAt} onChangeText={(value) => update('receivedAt', value)} /></View><View style={styles.field}><Input label="Termen estimat" placeholder="AAAA-LL-ZZ" value={form.estimatedAt} onChangeText={(value) => update('estimatedAt', value)} /></View><View style={styles.field}><Input label="Data finalizării" placeholder="AAAA-LL-ZZ" value={form.completedAt} onChangeText={(value) => update('completedAt', value)} /></View></View>
      <Input label="Observații client / service" multiline numberOfLines={4} textAlignVertical="top" style={{ minHeight: 90 }} value={form.handoverNotes} onChangeText={(value) => update('handoverNotes', value)} />
      <Input label="Observații interne (nu apar în PDF)" multiline value={form.internalNotes} onChangeText={(value) => update('internalNotes', value)} />
    </Card>

    <Card style={styles.section}>
      <View style={styles.sectionHeading}><View style={[styles.sectionIcon, { backgroundColor: `${palette.purple}16` }]}><Ionicons name="shield-checkmark-outline" size={21} color={palette.purple} /></View><View style={styles.documentCopy}><AppText variant="heading">Acord, predare și garanție</AppText><AppText variant="caption" muted>Completează toate câmpurile care vor apărea pe pagina a doua a PDF-ului.</AppText></View></View>
      <View style={styles.toggleGrid}>
        <ToggleOption label="Aprobă diagnosticarea" icon="search-outline" active={form.approveDiagnostics} onPress={() => update('approveDiagnostics', !form.approveDiagnostics)} />
        <ToggleOption label="Aprobă reparația" icon="construct-outline" active={form.approveRepair} onPress={() => update('approveRepair', !form.approveRepair)} />
        <ToggleOption label="Refuză reparația" icon="close-circle-outline" active={form.repairRefused} tone="danger" onPress={() => update('repairRefused', !form.repairRefused)} />
        <ToggleOption label="Produs predat" icon="checkmark-done-outline" active={form.productDelivered} onPress={() => update('productDelivered', !form.productDelivered)} />
      </View>
      <View style={styles.row}><View style={styles.field}><Input label="Garanție" placeholder="ex. 90 zile" value={form.warranty} onChangeText={(value) => update('warranty', value)} /></View><View style={styles.field}><Input label="Depozitare după termen" placeholder="ex. 5 RON / zi" value={form.storageAfter} onChangeText={(value) => update('storageAfter', value)} /></View></View>
      <AppText variant="label">Statusul fișei</AppText>
      <View style={styles.statusGrid}>{(Object.keys(SERVICE_STATUS_LABELS) as ServiceSheetStatus[]).map((status) => <Pressable key={status} accessibilityRole="button" accessibilityState={{ selected: form.status === status }} onPress={() => update('status', status)} style={({ pressed }) => [styles.statusButton, { borderColor: form.status === status ? colors.primary : colors.border, backgroundColor: form.status === status ? colors.primary : colors.surfaceMuted, opacity: pressed ? 0.75 : 1 }]}><AppText variant="caption" style={{ color: form.status === status ? '#FFFFFF' : colors.text, fontWeight: '800' }}>{SERVICE_STATUS_LABELS[status]}</AppText></Pressable>)}</View>
    </Card>

    <Button label={sheet ? 'Salvează modificările' : 'Creează fișa de service'} icon={sheet ? 'save-outline' : 'document-text-outline'} loading={loading} onPress={() => void submit()} />
  </View>;
}

function ToggleOption({ label, icon, active, tone = 'primary', onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; tone?: 'primary' | 'danger'; onPress: () => void }) {
  const { colors } = useAppTheme();
  const accent = tone === 'danger' ? palette.danger : colors.primary;
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: active }} onPress={onPress} style={({ pressed }) => [styles.toggleOption, { borderColor: active ? accent : colors.border, backgroundColor: active ? `${accent}12` : colors.surfaceMuted, opacity: pressed ? 0.74 : 1 }]}><View style={[styles.toggleOptionIcon, { backgroundColor: active ? accent : colors.surface }]}><Ionicons name={active ? 'checkmark' : icon} size={18} color={active ? '#FFFFFF' : colors.textMuted} /></View><AppText variant="caption" style={{ flex: 1, fontWeight: '800', color: active ? accent : colors.text }}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  section: { gap: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { minWidth: 210, flex: 1 },
  clientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  clientSummary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  clientCopy: { minWidth: 180, flex: 1, gap: 2 },
  documentPreference: { borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  documentIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  documentCopy: { minWidth: 0, flex: 1, gap: 3 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  toggleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  toggleOption: { minHeight: 52, minWidth: 190, flexGrow: 1, flexBasis: '46%', borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toggleOptionIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusButton: { minHeight: 40, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  financeHint: { color: '#14A83B', fontWeight: '700' },
  expensesBlock: { gap: spacing.sm, paddingTop: spacing.md },
  expensesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  expenseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  expenseName: { flex: 1 },
  collaboratorList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  collaboratorChip: { minWidth: 190, flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  calculationTotal: { gap: spacing.sm, paddingTop: spacing.lg },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
});
