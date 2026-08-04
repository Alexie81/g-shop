import { ClientFinanceSection, type ExpenseInput } from '@/components/clients/finance';
import { AccessoriesField, hasNoAccessories, NO_ACCESSORIES_VALUE } from '@/components/service-sheets/AccessoriesField';
import { IntakeEstimateSection } from '@/components/service-sheets/IntakeEstimateSection';
import { ServiceSheetCollaborators } from '@/components/service-sheets/ServiceSheetCollaborators';
import { TechnicianField } from '@/components/service-sheets/TechnicianField';
import { DocumentStageGroupHeader, DocumentStageHeader, ServiceDocumentTimeline } from '@/components/service-sheets/ServiceDocumentTimeline';
import { SERVICE_STATUS_LABELS } from '@/components/service-sheets/ServiceSheetStatus';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { clientRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { apiRequest, ApiError } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { Client, ClientFinancialOverview, EstimatedCosts, ServiceSheet, ServiceSheetStatus, UUID } from '@/types';
import { calculateClientFinance, ClientFinanceValue } from '@/utils/client-finance';
import { calculateEstimatedCosts, estimatedCostsFromFinance, estimatedDateFromWorkingDays, financeFromEstimatedCosts } from '@/utils/estimated-costs';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
  technicianId: string;
  technicianName: string;
  warranty: string;
  warrantyStartAt: string;
  warrantyEndAt: string;
  warrantyRemediation: string;
  storageAfter: string;
  handoverNotes: string;
  identityDocument: string;
  approveDiagnostics: boolean;
  approveRepair: boolean;
  repairRefused: boolean;
  productDelivered: boolean;
  receivedAt: string;
  intakeAgreementAt: string;
  estimatedRepairDays: string;
  estimatedAt: string;
  completedAt: string;
  status: ServiceSheetStatus;
  internalNotes: string;
};
type Props = { propertyId: UUID; clientId?: UUID; sheet?: ServiceSheet };

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
  technicianId: '',
  technicianName: '',
  warranty: '',
  warrantyStartAt: '',
  warrantyEndAt: '',
  warrantyRemediation: '',
  storageAfter: '',
  handoverNotes: '',
  identityDocument: '',
  approveDiagnostics: false,
  approveRepair: false,
  repairRefused: false,
  productDelivered: false,
  receivedAt: '',
  intakeAgreementAt: '',
  estimatedRepairDays: '2',
  estimatedAt: '',
  completedAt: '',
  status: 'NEW',
  internalNotes: '',
};

function formFromSheet(sheet: ServiceSheet): Form {
  const repairRefused = sheet.repairRefused ?? false;
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
    technicianId: sheet.technicianId ?? '',
    technicianName: sheet.technicianName ?? '',
    warranty: sheet.warranty ?? '',
    warrantyStartAt: sheet.warrantyStartAt ?? '',
    warrantyEndAt: sheet.warrantyEndAt ?? '',
    warrantyRemediation: sheet.warrantyRemediation ?? '',
    storageAfter: sheet.storageAfter ?? '',
    handoverNotes: sheet.handoverNotes ?? '',
    identityDocument: sheet.identityDocument ?? '',
    approveDiagnostics: sheet.approveDiagnostics ?? false,
    approveRepair: repairRefused ? false : sheet.approveRepair ?? false,
    repairRefused,
    productDelivered: sheet.productDelivered ?? false,
    receivedAt: sheet.receivedAt || new Date().toISOString(),
    intakeAgreementAt: sheet.intakeAgreementAt ?? sheet.signedAt ?? sheet.receivedAt ?? '',
    estimatedRepairDays: sheet.estimatedRepairDays ? String(sheet.estimatedRepairDays) : '',
    estimatedAt: sheet.estimatedAt ?? '',
    completedAt: sheet.completedAt ?? '',
    status: sheet.status,
    internalNotes: sheet.internalNotes ?? '',
  };
}

export function ServiceSheetForm({ propertyId, clientId, sheet }: Props) {
  const associatedClientId = sheet?.clientId ?? clientId;
  const [form, setForm] = useState<Form>(() => { const now = new Date().toISOString(); return sheet ? formFromSheet(sheet) : { ...blank, clientId: clientId ?? '', receivedAt: now, intakeAgreementAt: now }; });
  const [client, setClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [prefilling, setPrefilling] = useState(Boolean(associatedClientId));
  const [financePrefilling, setFinancePrefilling] = useState(false);
  const [financeOverview, setFinanceOverview] = useState<ClientFinancialOverview | null>(null);
  const [financeValue, setFinanceValue] = useState<ClientFinanceValue>(() => ({ ...emptyFinance, currencyCode: sheet?.currencyCode ?? 'RON', displayedPartsCost: sheet?.partsCost ?? 0, displayedLaborCost: sheet?.laborCost ?? 0 }));
  const [estimatedCosts, setEstimatedCosts] = useState<EstimatedCosts>(() => calculateEstimatedCosts({ currencyCode: sheet?.currencyCode ?? 'RON', partsCost: sheet?.partsCost ?? 0, laborCost: sheet?.laborCost ?? 0 }));
  const [financeSourceClientId, setFinanceSourceClientId] = useState<UUID | null>(null);
  const { hasPermission } = useAuth();
  const { colors } = useAppTheme();
  const canLoadFinancials = hasPermission('financials.view');
  const canEditFinancials = canLoadFinancials && hasPermission('clients.update');
  const canEditCollaborators = hasPermission('clients.update') && hasPermission('collaborators.view');
  const canManageCollaboratorPayments = hasPermission('collaborators.manage');
  const { showToast } = useToast();
  const estimateTouchedRef = useRef(false);
  const financeTouchedRef = useRef(false);

  const applyClientFinance = useCallback((overview: ClientFinancialOverview, selectedClientId: UUID) => {
    setFinanceValue({ ...emptyFinance, ...overview.financials });
    if (!sheet && !estimateTouchedRef.current) setEstimatedCosts(estimatedCostsFromFinance({ ...emptyFinance, ...overview.financials }));
    setForm((current) => current.clientId !== selectedClientId ? current : {
      ...current,
      partsCost: String(overview.financials.displayedPartsCost ?? 0),
      laborCost: String(overview.financials.displayedLaborCost ?? 0),
      actualPartsCost: String(overview.financials.actualPartsCost ?? 0),
    });
    setFinanceSourceClientId(selectedClientId);
  }, [sheet]);

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
      setFinanceValue({ ...emptyFinance });
      setEstimatedCosts(calculateEstimatedCosts({ currencyCode: 'RON' }));
      estimateTouchedRef.current = false;
      financeTouchedRef.current = false;
      setFinanceOverview(null);
      setFinanceSourceClientId(null);
      return;
    }
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'approveRepair' && value === true) next.repairRefused = false;
      if (key === 'repairRefused' && value === true) next.approveRepair = false;
      if (key === 'completedAt' && value && !current.warrantyStartAt) next.warrantyStartAt = value as string;
      return next;
    });
  };

  const updateEstimatedCosts = (next: EstimatedCosts) => {
    estimateTouchedRef.current = true;
    setEstimatedCosts(next);
    if (!financeTouchedRef.current) setFinanceValue((current) => financeFromEstimatedCosts(current, next));
  };

  const updateFinance = (next: ClientFinanceValue) => {
    financeTouchedRef.current = true;
    setFinanceValue(next);
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

  const refreshCollaborators = useCallback(async () => {
    if (!form.clientId) return;
    const [nextClient, nextOverview] = await Promise.all([
      clientRepository.get(form.clientId),
      clientRepository.getFinancials(form.clientId),
    ]);
    setClient(nextClient);
    setFinanceOverview(nextOverview);
  }, [form.clientId]);

  const refreshExpenses = useCallback(async () => {
    if (!form.clientId) return;
    setFinanceOverview(await clientRepository.getFinancials(form.clientId));
  }, [form.clientId]);

  const addExpense = async (input: ExpenseInput) => {
    if (!form.clientId) throw new Error('Alege clientul înainte să adaugi cheltuiala.');
    await clientRepository.addExpense(form.clientId, input);
    await refreshExpenses();
    showToast('Cheltuiala a fost adăugată.', 'success');
  };

  const updateExpense = async (expenseId: string, input: ExpenseInput) => {
    if (!form.clientId) throw new Error('Clientul asociat nu este disponibil.');
    await clientRepository.updateExpense(form.clientId, expenseId, input);
    await refreshExpenses();
    showToast('Cheltuiala a fost actualizată.', 'success');
  };

  const deleteExpense = async (expenseId: string) => {
    if (!form.clientId) throw new Error('Clientul asociat nu este disponibil.');
    await clientRepository.removeExpense(form.clientId, expenseId);
    await refreshExpenses();
    showToast('Cheltuiala a fost ștearsă.', 'success');
  };

  const submit = async () => {
    if (!form.clientId || form.reportedIssue.trim().length < 5) {
      return showToast('Alege clientul și completează problema declarată.', 'error');
    }
    const estimatedRepairDays = form.estimatedRepairDays.trim() === '' ? undefined : Number(form.estimatedRepairDays);
    if (!sheet && (estimatedRepairDays === undefined || !Number.isInteger(estimatedRepairDays) || estimatedRepairDays < 0 || estimatedRepairDays > 730)) {
      return showToast('Completează termenul estimativ cu un număr între 0 și 730 de zile lucrătoare.', 'error');
    }
    if (!sheet && !/^[A-Z]{3}$/.test(estimatedCosts.currencyCode)) {
      return showToast('Moneda costurilor estimative trebuie să aibă 3 litere, de exemplu RON.', 'error');
    }

    const editableFields = {
      equipment: form.equipment.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      serialNumber: form.serialNumber.trim(),
      accessories: hasNoAccessories(form.accessories) ? NO_ACCESSORIES_VALUE : form.accessories.trim(),
      reportedIssue: form.reportedIssue.trim(),
      technicalAssessment: form.technicalAssessment.trim(),
      workPerformed: form.workPerformed.trim(),
      partsUsed: form.partsUsed.trim(),
      partsCost: parts,
      laborCost: labor,
      totalCost: total,
      ...(canLoadFinancials ? { directCosts: direct, netValue: net } : {}),
      currencyCode: financeValue.currencyCode,
      technicianId: form.technicianId || undefined,
      technicianName: form.technicianName.trim(),
      warranty: form.warranty.trim(),
      warrantyStartAt: form.warrantyStartAt || undefined,
      warrantyEndAt: form.warrantyEndAt || undefined,
      warrantyRemediation: form.warrantyRemediation.trim(),
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
      estimatedAt: sheet
        ? form.estimatedAt || undefined
        : estimatedDateFromWorkingDays(form.receivedAt || new Date().toISOString(), estimatedRepairDays ?? 0),
    };

    setLoading(true);
    try {
      let documentWarning: string | null = null;
      if (canEditFinancials) await clientRepository.updateFinancials(form.clientId, financeValue);
      const saved = sheet
        ? await serviceSheetRepository.update(sheet.id, editableFields)
        : await serviceSheetRepository.create({
          ...editableFields,
          propertyId,
          clientId: form.clientId,
          currencyCode: financeValue.currencyCode,
        });
      if (!sheet) {
        try {
          await serviceSheetRepository.generateDocument(saved.id, 'INTAKE', {
            agreementAt: form.intakeAgreementAt,
            agreementStatus: form.repairRefused ? 'REFUSED' : 'ACCEPTED',
            estimatedRepairDays,
            estimatedCosts,
          });
        } catch (documentError) {
          documentWarning = documentError instanceof Error ? `Fișa a fost salvată, dar documentul de intrare nu a putut fi generat: ${documentError.message}` : 'Fișa a fost salvată, dar documentul de intrare nu a putut fi generat.';
        }
      }
      showToast(documentWarning ?? (sheet ? 'Fișa de service a fost actualizată.' : 'Fișa de service și documentul de intrare au fost create.'), documentWarning ? 'error' : 'success');
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

  const timelineStep: 1 | 2 | 3 | 4 = sheet?.status === 'DELIVERED'
    ? 4
    : sheet?.status === 'COMPLETED'
      ? 3
      : sheet && ['VERIFYING', 'IN_PROGRESS', 'WAITING_PARTS'].includes(sheet.status)
      ? 2
      : 1;

  return <View style={styles.form}>
    <ServiceDocumentTimeline activeStep={timelineStep} />
    <DocumentStageGroupHeader step={1} />
    <Card style={styles.section}>
      <DocumentStageHeader step={1} title="Client asociat" description="Clientul este ales o singură dată și rămâne fix pe această reparație." />
      {client ? <View style={styles.clientSummary}>
        <View style={styles.clientCopy}><AppText variant="label">{client.firstName} {client.lastName}</AppText><AppText variant="caption" muted>{client.phone} · {client.email || 'fără email'}</AppText></View>
      </View> : prefilling ? <AppText variant="caption" muted>Se încarcă datele clientului…</AppText> : sheet ? <AppText variant="caption" muted>Clientul asociat nu a putut fi încărcat.</AppText> : <View style={styles.clientGrid}>
        {clients.map((item) => <Button key={item.id} compact variant={form.clientId === item.id ? 'primary' : 'outline'} label={item.firstName + ' ' + item.lastName} onPress={() => update('clientId', item.id)} />)}
      </View>}
      {prefilling ? null : sheet ? <AppText variant="caption" muted>Clientul asociat și istoricul fișei rămân neschimbate.</AppText> : clientId === form.clientId ? <AppText variant="caption" style={{ color: '#14A83B' }}>Datele disponibile din formularul QR au fost precompletate.</AppText> : null}
      {financePrefilling ? <AppText variant="caption" muted>Se încarcă valorile financiare ale clientului…</AppText> : financeSourceClientId === form.clientId ? <AppText variant="caption" style={styles.financeHint}>Estimarea a fost precompletată din finanțele clientului și rămâne separată după generarea fișei de intrare.</AppText> : null}
    </Card>

    <Card style={styles.section}>
      <DocumentStageHeader step={1} title="Echipamentul primit" description="Aceste informații apar în prima pagină a fișei de intrare." />
      <View style={styles.row}>
        <View style={styles.field}><Input label="Tip echipament" value={form.equipment} onChangeText={(value) => update('equipment', value)} /></View>
        <View style={styles.field}><Input label="Marcă" value={form.brand} onChangeText={(value) => update('brand', value)} /></View>
      </View>
      <View style={styles.row}>
        <View style={styles.field}><Input label="Model" value={form.model} onChangeText={(value) => update('model', value)} /></View>
        <View style={styles.field}><Input label="Serie" value={form.serialNumber} onChangeText={(value) => update('serialNumber', value)} /></View>
      </View>
      <AccessoriesField value={form.accessories} onChange={(value) => update('accessories', value)} />
    </Card>

    <Card style={styles.section}>
      <DocumentStageHeader step={1} title="Problema declarată" description="Notează exact simptomele comunicate de client la predare." />
      <Input label="Problemă declarată *" multiline numberOfLines={4} textAlignVertical="top" style={{ minHeight: 90 }} value={form.reportedIssue} onChangeText={(value) => update('reportedIssue', value)} />
    </Card>

    <Card style={styles.section}>
      <DocumentStageHeader step={1} title="Primire și acord inițial" description="Datele opționale pot fi șterse și lăsate necompletate." />
      <View style={styles.row}>
        <View style={styles.field}><DateTimeField label="Data primirii" value={form.receivedAt} onChange={(value) => update('receivedAt', value)} allowClear showNow /></View>
        {!sheet ? <View style={styles.field}><DateTimeField label="Data acordului" value={form.intakeAgreementAt} onChange={(value) => update('intakeAgreementAt', value)} allowClear showNow /></View> : null}
        {sheet ? <View style={styles.field}><DateTimeField label="Termen estimat" value={form.estimatedAt} onChange={(value) => update('estimatedAt', value)} allowClear /></View> : null}
      </View>
      <TechnicianField propertyId={propertyId} technicianId={form.technicianId || undefined} technicianName={form.technicianName} onChange={({ id, name }) => setForm((current) => ({ ...current, technicianId: id, technicianName: name }))} />
      <Input label="Observații interne (nu apar în PDF)" multiline value={form.internalNotes} onChangeText={(value) => update('internalNotes', value)} />
    </Card>

    <Card style={styles.section}>
      <DocumentStageHeader step={1} title="Acordul pentru fișa de intrare" description="Bifele completează automat declarația și condițiile din document." />
      <View style={styles.toggleGrid}>
        <ToggleOption label="Aprobă diagnosticarea" icon="search-outline" active={form.approveDiagnostics} onPress={() => update('approveDiagnostics', !form.approveDiagnostics)} />
        <ToggleOption label="Aprobă reparația" icon="construct-outline" active={form.approveRepair} onPress={() => update('approveRepair', !form.approveRepair)} />
        <ToggleOption label="Refuză reparația" icon="close-circle-outline" active={form.repairRefused} tone="danger" onPress={() => update('repairRefused', !form.repairRefused)} />
      </View>
    </Card>

    {!sheet ? <IntakeEstimateSection
      value={estimatedCosts}
      estimatedRepairDays={form.estimatedRepairDays}
      onChange={updateEstimatedCosts}
      onEstimatedRepairDaysChange={(estimatedRepairDays) => update('estimatedRepairDays', estimatedRepairDays)}
      description="Aceste valori intră în PDF-ul inițial și nu se modifică atunci când actualizezi mai târziu costurile reale sau devizul final."
    /> : null}

    <DocumentStageGroupHeader step={2} />

    <Card style={styles.section}>
      <DocumentStageHeader step={2} title="Constatarea pentru deviz" description="Poți lăsa gol acum și completa după diagnosticare, înainte de generarea devizului final." />
      <Input label="Constatare tehnică" multiline numberOfLines={4} textAlignVertical="top" style={{ minHeight: 90 }} value={form.technicalAssessment} onChangeText={(value) => update('technicalAssessment', value)} />
      <Input label="Piese utilizate / necesare" multiline numberOfLines={3} textAlignVertical="top" value={form.partsUsed} onChangeText={(value) => update('partsUsed', value)} />
    </Card>

    {canLoadFinancials && form.clientId ? <ClientFinanceSection
      value={financeValue}
      expenses={financeOverview?.expenses ?? []}
      collaboratorCost={collaboratorCost}
      collaboratorPaid={collaboratorPaid}
      disabled={!canEditFinancials || financePrefilling}
      onChange={updateFinance}
      onAddExpense={canEditFinancials && !financePrefilling ? addExpense : undefined}
      onUpdateExpense={canEditFinancials && !financePrefilling ? updateExpense : undefined}
      onDeleteExpense={canEditFinancials && !financePrefilling ? deleteExpense : undefined}
    /> : null}

    <DocumentStageGroupHeader step={3} />

    <Card style={styles.section}>
      <DocumentStageHeader step={3} title="Rezultatul reparației" description="Se completează la final și va fi preluat în fișa de ieșire și în certificat." />
      <Input label="Lucrări efectuate" multiline numberOfLines={4} textAlignVertical="top" style={{ minHeight: 90 }} value={form.workPerformed} onChangeText={(value) => update('workPerformed', value)} />
    </Card>

    <Card style={styles.section}>
      <DocumentStageHeader step={3} title="Predare și închidere" description="Completează aceste date doar când produsul este gata de predare." />
      <View style={styles.toggleGrid}><ToggleOption label="Produs predat" icon="checkmark-done-outline" active={form.productDelivered} onPress={() => update('productDelivered', !form.productDelivered)} /></View>
      <View style={styles.row}><View style={styles.field}><DateTimeField label="Data finalizării" value={form.completedAt} onChange={(value) => update('completedAt', value)} allowClear showNow /></View></View>
      <Input label="Depozitare după termen" placeholder="ex. 5 RON / zi" value={form.storageAfter} onChangeText={(value) => update('storageAfter', value)} />
      <Input label="Observații client / service" multiline numberOfLines={4} textAlignVertical="top" style={{ minHeight: 90 }} value={form.handoverNotes} onChangeText={(value) => update('handoverNotes', value)} />
      <AppText variant="label">Statusul fișei</AppText>
      <View style={styles.statusGrid}>{(Object.keys(SERVICE_STATUS_LABELS) as ServiceSheetStatus[]).map((status) => <Pressable key={status} accessibilityRole="button" accessibilityState={{ selected: form.status === status }} onPress={() => update('status', status)} style={({ pressed }) => [styles.statusButton, { borderColor: form.status === status ? colors.primary : colors.border, backgroundColor: form.status === status ? colors.primary : colors.surfaceMuted, opacity: pressed ? 0.75 : 1 }]}><AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.statusButtonLabel, { color: form.status === status ? '#FFFFFF' : colors.text }]}>{SERVICE_STATUS_LABELS[status]}</AppText></Pressable>)}</View>
    </Card>

    <DocumentStageGroupHeader step={4} />

    <Card style={styles.section}>
      <DocumentStageHeader step={4} title="Datele certificatului" description="Se completează o singură dată și sunt preluate automat la generarea certificatului de garanție." />
      <View style={styles.row}>
        <View style={styles.field}><Input label="Perioada garanției" placeholder="ex. 90 zile" maxLength={120} value={form.warranty} onChangeText={(value) => update('warranty', value)} /></View>
        <View style={styles.field}><Input label="Remediere estimată" placeholder="ex. 10 zile lucrătoare" maxLength={160} value={form.warrantyRemediation} onChangeText={(value) => update('warrantyRemediation', value)} /></View>
      </View>
      <View style={styles.row}>
        <View style={styles.field}><DateTimeField label="Garanție de la" value={form.warrantyStartAt} onChange={(value) => update('warrantyStartAt', value)} allowClear showNow /></View>
        <View style={styles.field}><DateTimeField label="Garanție până la" value={form.warrantyEndAt} onChange={(value) => update('warrantyEndAt', value)} allowClear /></View>
      </View>
      <View style={[styles.automationHint, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><Ionicons name="sparkles-outline" size={20} color={colors.primary} /><AppText variant="caption" style={styles.documentCopy}>Firma, contactul service, numerele documentelor, semnătura și ștampila sunt completate automat.</AppText></View>
    </Card>

    {financeOverview && form.clientId ? <ServiceSheetCollaborators
      propertyId={propertyId}
      clientId={form.clientId}
      overview={financeOverview}
      hasServiceSheet={Boolean(sheet)}
      canEditAssignment={canEditCollaborators}
      canManagePayment={canManageCollaboratorPayments}
      onRefresh={refreshCollaborators}
    /> : null}

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
  documentCopy: { minWidth: 0, flex: 1, gap: 3 },
  automationHint: { minHeight: 58, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  toggleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  toggleOption: { minHeight: 52, minWidth: 190, flexGrow: 1, flexBasis: '46%', borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toggleOptionIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusButton: { minWidth: 136, minHeight: 46, flexBasis: 136, flexGrow: 1, flexShrink: 0, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  statusButtonLabel: { width: '100%', flexShrink: 0, textAlign: 'center', fontWeight: '800' },
  financeHint: { color: '#14A83B', fontWeight: '700' },
  expensesBlock: { gap: spacing.sm, paddingTop: spacing.md },
  expensesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  expenseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  expenseName: { flex: 1 },
  calculationTotal: { gap: spacing.sm, paddingTop: spacing.lg },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
});
