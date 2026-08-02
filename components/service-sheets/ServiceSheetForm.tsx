import { ClientFinanceOverviewCard } from '@/components/clients/finance';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { clientRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { apiRequest, ApiError } from '@/services/api';
import { spacing } from '@/theme/tokens';
import { Client, ClientFinancialOverview, ServiceSheet, UUID } from '@/types';
import { calculateNet } from '@/utils/commission';
import { formatFinanceMoney } from '@/utils/client-finance';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
  estimatedAt: string;
  internalNotes: string;
};
type Props = { propertyId: UUID; clientId?: UUID; sheet?: ServiceSheet };

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
  estimatedAt: '',
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
    estimatedAt: sheet.estimatedAt?.slice(0, 10) ?? '',
    internalNotes: sheet.internalNotes ?? '',
  };
}

export function ServiceSheetForm({ propertyId, clientId, sheet }: Props) {
  const associatedClientId = sheet?.clientId ?? clientId;
  const [form, setForm] = useState<Form>(() => sheet ? formFromSheet(sheet) : { ...blank, clientId: clientId ?? '' });
  const [client, setClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [prefilling, setPrefilling] = useState(Boolean(associatedClientId));
  const [financePrefilling, setFinancePrefilling] = useState(false);
  const [financeOverview, setFinanceOverview] = useState<ClientFinancialOverview | null>(null);
  const [financeSourceClientId, setFinanceSourceClientId] = useState<UUID | null>(null);
  const [currencyCode, setCurrencyCode] = useState(sheet?.currencyCode ?? 'RON');
  const [choosingClient, setChoosingClient] = useState(false);
  const { hasPermission } = useAuth();
  const canLoadFinancials = hasPermission('financials.view');
  const { showToast } = useToast();

  const applyClientFinance = useCallback((overview: ClientFinancialOverview, selectedClientId: UUID) => {
    setCurrencyCode(overview.financials.currencyCode || 'RON');
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

  const update = (key: keyof Form, value: string) => {
    if (key === 'clientId') {
      if (form.clientId === value) {
        setChoosingClient(false);
        return;
      }
      setForm((current) => ({
        ...current,
        clientId: value,
        partsCost: '0',
        laborCost: '0',
        actualPartsCost: '0',
      }));
      setClient(clients.find((item) => item.id === value) ?? null);
      setCurrencyCode('RON');
      setFinanceOverview(null);
      setFinanceSourceClientId(null);
      setChoosingClient(false);
      return;
    }
    setForm((current) => ({ ...current, [key]: value }));
  };

  const parts = Number(form.partsCost.replace(',', '.')) || 0;
  const labor = Number(form.laborCost.replace(',', '.')) || 0;
  const actualParts = Number(form.actualPartsCost.replace(',', '.')) || 0;
  const additionalExpenses = financeOverview?.summary.additionalExpenses ?? 0;
  const direct = actualParts + additionalExpenses;
  const total = parts + labor;
  const net = calculateNet(total, direct);

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
      internalNotes: form.internalNotes.trim(),
      estimatedAt: form.estimatedAt,
    };

    setLoading(true);
    try {
      const saved = sheet
        ? await serviceSheetRepository.update(sheet.id, editableFields)
        : await serviceSheetRepository.create({
          ...editableFields,
          propertyId,
          clientId: form.clientId,
          currencyCode,
          receivedAt: new Date().toISOString(),
          status: 'NEW',
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

    {canLoadFinancials && form.clientId ? <ClientFinanceOverviewCard
      overview={financeOverview}
      loading={financePrefilling}
      showInternal
      title="Finanțele clientului în această fișă"
      subtitle="Preț, plăți și costuri sincronizate automat"
    /> : null}

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
      <AppText variant="heading">Costuri și defalcare</AppText>
      <AppText variant="caption" muted>Valorile sunt preluate automat din client și sunt sincronizate în ambele sensuri la salvare.</AppText>
      <View style={styles.row}>
        {canLoadFinancials ? <View style={styles.field}><Input label={`Cost efectiv piese · intern (${currencyCode})`} keyboardType="decimal-pad" value={form.actualPartsCost} onChangeText={(value) => update('actualPartsCost', value)} /></View> : null}
        <View style={styles.field}><Input label={`Piese afișate (${currencyCode})`} keyboardType="decimal-pad" value={form.partsCost} onChangeText={(value) => update('partsCost', value)} /></View>
        <View style={styles.field}><Input label={`Manoperă afișată (${currencyCode})`} keyboardType="decimal-pad" value={form.laborCost} onChangeText={(value) => update('laborCost', value)} /></View>
      </View>
      {canLoadFinancials ? <View style={styles.expensesBlock}><View style={styles.expensesHeader}><AppText variant="label">Cheltuieli suplimentare</AppText><AppText variant="label">{formatFinanceMoney(additionalExpenses, currencyCode)}</AppText></View>{financeOverview?.expenses.length ? financeOverview.expenses.map((expense) => <View key={expense.id} style={styles.expenseRow}><AppText variant="caption" style={styles.expenseName}>{expense.description}</AppText><AppText variant="caption" muted>{formatFinanceMoney(expense.amount, currencyCode)}</AppText></View>) : <AppText variant="caption" muted>Nicio cheltuială suplimentară.</AppText>}</View> : null}
      <View style={styles.calculationTotal}>
        <AppText variant="heading">Calcul total</AppText>
        <View style={styles.totalLine}><AppText variant="caption" muted>Total afișat</AppText><AppText variant="label">{formatFinanceMoney(total, currencyCode)}</AppText></View>
        {canLoadFinancials ? <><View style={styles.totalLine}><AppText variant="caption" muted>Costuri interne totale</AppText><AppText variant="label">{formatFinanceMoney(direct, currencyCode)}</AppText></View><View style={styles.totalLine}><AppText variant="label">Valoare netă</AppText><AppText variant="title" style={{ color: '#14A83B' }}>{formatFinanceMoney(net, currencyCode)}</AppText></View></> : null}
      </View>
    </Card>

    <Card style={styles.section}>
      <AppText variant="heading">Planificare și observații</AppText>
      <Input label="Termen estimat" placeholder="AAAA-LL-ZZ" value={form.estimatedAt} onChangeText={(value) => update('estimatedAt', value)} />
      <Input label="Observații interne" multiline value={form.internalNotes} onChangeText={(value) => update('internalNotes', value)} />
    </Card>

    <Button label={sheet ? 'Salvează modificările' : 'Creează fișa de service'} icon={sheet ? 'save-outline' : 'document-text-outline'} loading={loading} onPress={() => void submit()} />
  </View>;
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  section: { gap: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { minWidth: 210, flex: 1 },
  clientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  clientSummary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  clientCopy: { minWidth: 180, flex: 1, gap: 2 },
  financeHint: { color: '#14A83B', fontWeight: '700' },
  expensesBlock: { gap: spacing.sm, paddingTop: spacing.md },
  expensesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  expenseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  expenseName: { flex: 1 },
  calculationTotal: { gap: spacing.sm, paddingTop: spacing.lg },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
});
