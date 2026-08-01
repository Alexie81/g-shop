import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ClientFinanceSection } from '@/components/clients/finance';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { clientRepository, collaboratorRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { Client, ClientExpense, Collaborator, CommissionType, UUID } from '@/types';
import { ClientFinanceValue } from '@/utils/client-finance';
import { formatCurrency } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

type ContactFields = Pick<Client, 'firstName' | 'lastName' | 'phone' | 'secondaryPhone' | 'email' | 'address' | 'city' | 'county' | 'postalCode' | 'notes'>;
type ClientCommissionType = CommissionType;
type PercentageType = Extract<ClientCommissionType, 'PERCENT_NET' | 'PERCENT_TOTAL'>;
type FormState = ContactFields & { collaboratorId: string; commissionType: ClientCommissionType; commissionValue: string };

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  phone: '',
  secondaryPhone: '',
  email: '',
  address: '',
  city: 'București',
  county: 'București',
  postalCode: '',
  notes: '',
  collaboratorId: '',
  commissionType: 'PERCENT_NET',
  commissionValue: '15',
};

const emptyFinance: ClientFinanceValue = {
  currencyCode: 'RON',
  exchangeRateToRon: 1,
  workPrice: 0,
  diagnosticFee: 0,
  advancePaid: 0,
  discountPercent: 0,
  actualPartsCost: 0,
  displayedPartsCost: 0,
  displayedLaborCost: 0,
  paymentStatus: 'UNPAID',
};

const isPreset = (collaborator: Collaborator) => Boolean(collaborator.isPreset);
const parseCommissionValue = (value: string) => Number(value.trim().replace(',', '.'));

function SegmentOption({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentOption,
        {
          backgroundColor: active ? colors.primary : 'transparent',
          borderColor: active ? colors.primary : colors.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <AppText variant="label" style={{ color: active ? '#FFFFFF' : colors.text }}>{label}</AppText>
    </Pressable>
  );
}

export function ClientForm({ propertyId, client }: { propertyId: UUID; client?: Client }) {
  const { colors } = useAppTheme();
  const { hasPermission } = useAuth();
  const canViewFinancials = hasPermission('financials.view');
  const canEditFinancials = canViewFinancials && hasPermission('clients.update');
  const [form, setForm] = useState<FormState>(() => client ? {
    firstName: client.firstName,
    lastName: client.lastName,
    phone: client.phone,
    secondaryPhone: client.secondaryPhone ?? '',
    email: client.email ?? '',
    address: client.address ?? '',
    city: client.city ?? '',
    county: client.county ?? '',
    postalCode: client.postalCode ?? '',
    notes: client.notes ?? '',
    collaboratorId: client.collaboratorId ?? '',
    commissionType: client.commissionType ?? 'PERCENT_NET',
    commissionValue: String(client.commissionValue ?? 15),
  } : { ...emptyForm });
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(Boolean(propertyId));
  const [collaboratorsError, setCollaboratorsError] = useState<string>();
  const [collaboratorsReloadKey, setCollaboratorsReloadKey] = useState(0);
  const [percentageType, setPercentageType] = useState<PercentageType>(client?.commissionType === 'PERCENT_TOTAL' ? 'PERCENT_TOTAL' : 'PERCENT_NET');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFields, string>>>({});
  const [commissionError, setCommissionError] = useState<string>();
  const [finance, setFinance] = useState<ClientFinanceValue>({ ...emptyFinance });
  const [financeExpenses, setFinanceExpenses] = useState<ClientExpense[]>([]);
  const [financeCollaboratorCost, setFinanceCollaboratorCost] = useState(0);
  const [financeLoading, setFinanceLoading] = useState(Boolean(client && canViewFinancials));
  const [financeError, setFinanceError] = useState<string>();
  const [financeReloadKey, setFinanceReloadKey] = useState(0);
  const presetPropertyRef = useRef<UUID | undefined>(undefined);
  const collaboratorChoiceTouchedRef = useRef(Boolean(client));
  const { showToast } = useToast();

  useEffect(() => {
    if (!client || !canViewFinancials) {
      setFinanceLoading(false);
      return;
    }

    let active = true;
    setFinanceLoading(true);
    setFinanceError(undefined);
    clientRepository.getFinancials(client.id).then((overview) => {
      if (!active) return;
      setFinance(overview.financials);
      setFinanceExpenses(overview.expenses);
      setFinanceCollaboratorCost(overview.summary.collaboratorCost);
    }).catch((error) => {
      if (!active) return;
      setFinanceError(error instanceof Error ? error.message : 'Datele financiare nu au putut fi încărcate.');
    }).finally(() => {
      if (active) setFinanceLoading(false);
    });

    return () => { active = false; };
  }, [canViewFinancials, client, financeReloadKey]);

  useEffect(() => {
    if (!propertyId) {
      setCollaborators([]);
      setCollaboratorsLoading(false);
      setCollaboratorsError(undefined);
      return;
    }

    setCollaborators([]);
    setCollaboratorsLoading(true);
    setCollaboratorsError(undefined);
    if (!client && presetPropertyRef.current !== propertyId) {
      collaboratorChoiceTouchedRef.current = false;
      setForm((current) => ({ ...current, collaboratorId: '' }));
    }
    let active = true;
    collaboratorRepository.list(propertyId).then((items) => {
      if (!active) return;
      setCollaborators(items);
      setCollaboratorsLoading(false);

      if (!client && presetPropertyRef.current !== propertyId) {
        presetPropertyRef.current = propertyId;
        collaboratorChoiceTouchedRef.current = false;
        const preset = items.find(isPreset);
        const type = preset?.defaultCommissionType;
        setForm((current) => ({
          ...current,
          collaboratorId: preset?.id ?? '',
          commissionType: type ?? current.commissionType,
          commissionValue: preset ? String(preset.defaultCommissionValue) : current.commissionValue,
        }));
        if (type && type !== 'FIXED') setPercentageType(type);
      }
    }).catch(() => {
      if (!active) return;
      setCollaboratorsLoading(false);
      setCollaboratorsError('Colaboratorii nu au putut fi încărcați. Reîncearcă înainte să salvezi clientul.');
    });

    return () => { active = false; };
  }, [client, collaboratorsReloadKey, propertyId]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    if (key === 'commissionType' || key === 'commissionValue') collaboratorChoiceTouchedRef.current = true;
    setForm((current) => ({ ...current, [key]: value }));
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const selectCollaborator = (next: Collaborator) => {
    collaboratorChoiceTouchedRef.current = true;
    const type = next.defaultCommissionType;
    setForm((current) => ({
      ...current,
      collaboratorId: next.id,
      commissionType: type,
      commissionValue: String(next.defaultCommissionValue),
    }));
    if (type !== 'FIXED') setPercentageType(type);
    setCommissionError(undefined);
  };

  const removeCollaborator = () => {
    collaboratorChoiceTouchedRef.current = true;
    setForm((current) => ({ ...current, collaboratorId: '' }));
    setCommissionError(undefined);
  };

  const selectPercentageType = (type: PercentageType) => {
    setPercentageType(type);
    update('commissionType', type);
  };

  const selectedCollaborator = collaborators.find((item) => item.id === form.collaboratorId);
  const numericCommission = parseCommissionValue(form.commissionValue);
  const safeCommission = Number.isFinite(numericCommission) ? Math.max(0, numericCommission) : 0;
  const exampleBase = form.commissionType === 'PERCENT_TOTAL' ? 1000 : 700;
  const preview = form.commissionType === 'FIXED' ? safeCommission : Math.round(exampleBase * safeCommission) / 100;

  const submit = async () => {
    if (!client && (collaboratorsLoading || collaboratorsError)) {
      showToast(collaboratorsLoading ? 'Așteaptă încărcarea colaboratorilor.' : 'Reîncarcă lista colaboratorilor înainte să salvezi.', 'error');
      return;
    }

    const nextErrors: typeof errors = {};
    if (form.firstName.trim().length < 2) nextErrors.firstName = 'Introdu prenumele.';
    if (form.lastName.trim().length < 2) nextErrors.lastName = 'Introdu numele.';
    if (form.phone.replace(/\D/g, '').length < 9) nextErrors.phone = 'Numărul de telefon nu este valid.';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = 'Adresa de email nu este validă.';

    let nextCommissionError: string | undefined;
    if (form.collaboratorId && (!form.commissionValue.trim() || !Number.isFinite(numericCommission) || numericCommission < 0)) {
      nextCommissionError = 'Introdu o valoare validă, mai mare sau egală cu zero.';
    } else if (form.collaboratorId && form.commissionType !== 'FIXED' && numericCommission > 100) {
      nextCommissionError = 'Procentul nu poate depăși 100%.';
    }

    if (Object.keys(nextErrors).length || nextCommissionError) {
      setErrors(nextErrors);
      setCommissionError(nextCommissionError);
      showToast('Verifică datele marcate.', 'error');
      return;
    }

    if (canEditFinancials && client && (financeLoading || financeError)) {
      showToast(financeLoading ? 'Așteaptă încărcarea datelor financiare.' : 'Reîncarcă datele financiare înainte să salvezi.', 'error');
      return;
    }
    if (canEditFinancials && finance.currencyCode !== 'RON' && finance.exchangeRateToRon <= 0) {
      showToast('Introdu un curs către RON mai mare decât zero.', 'error');
      return;
    }
    if (canEditFinancials && (finance.discountPercent < 0 || finance.discountPercent > 100)) {
      showToast('Reducerea trebuie să fie între 0 și 100%.', 'error');
      return;
    }

    setLoading(true);
    const { commissionValue, collaboratorId, ...rest } = form;
    const includeCollaboratorChoice = Boolean(client) || collaboratorChoiceTouchedRef.current;
    const hasExplicitAssignment = includeCollaboratorChoice && Boolean(collaboratorId);
    const payload = {
      ...rest,
      ...(includeCollaboratorChoice ? { collaboratorId } : {}),
      commissionValue: hasExplicitAssignment ? numericCommission : undefined,
      commissionType: hasExplicitAssignment ? form.commissionType : undefined,
    };

    try {
      const saved = client
        ? await clientRepository.update(client.id, payload)
        : await clientRepository.create({ ...payload, propertyId, status: 'NEW' });
      if (canEditFinancials) {
        try {
          await clientRepository.updateFinancials(saved.id, finance);
        } catch (error) {
          showToast(`Clientul a fost salvat, dar finanțele nu au putut fi salvate: ${error instanceof Error ? error.message : 'eroare necunoscută'}`, 'error');
          router.replace(`/service/clients/${saved.id}`);
          return;
        }
      }
      showToast(client ? 'Clientul a fost actualizat.' : 'Clientul și codul QR au fost create.', 'success');
      router.replace(`/service/clients/${saved.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Salvarea a eșuat.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.form}>
      <Card style={styles.section}>
        <AppText variant="heading">Date de contact</AppText>
        <View style={styles.row}>
          <View style={styles.field}><Input label="Prenume *" value={form.firstName} onChangeText={(value) => update('firstName', value)} error={errors.firstName} /></View>
          <View style={styles.field}><Input label="Nume *" value={form.lastName} onChangeText={(value) => update('lastName', value)} error={errors.lastName} /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.field}><Input label="Telefon *" keyboardType="phone-pad" value={form.phone} onChangeText={(value) => update('phone', value)} error={errors.phone} /></View>
          <View style={styles.field}><Input label="Telefon secundar" keyboardType="phone-pad" value={form.secondaryPhone} onChangeText={(value) => update('secondaryPhone', value)} /></View>
        </View>
        <Input label="Email" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(value) => update('email', value)} error={errors.email} />
      </Card>

      <Card style={styles.section}>
        <AppText variant="heading">Adresă</AppText>
        <Input label="Adresă completă" value={form.address} onChangeText={(value) => update('address', value)} />
        <View style={styles.row}>
          <View style={styles.field}><Input label="Oraș / localitate" value={form.city} onChangeText={(value) => update('city', value)} /></View>
          <View style={styles.field}><Input label="Județ / sector" value={form.county} onChangeText={(value) => update('county', value)} /></View>
        </View>
        <Input label="Cod poștal" keyboardType="number-pad" value={form.postalCode} onChangeText={(value) => update('postalCode', value)} />
      </Card>

      {canViewFinancials ? financeLoading ? <Card style={styles.section}><AppText variant="heading">Finanțele clientului</AppText><AppText muted>Se încarcă valorile financiare…</AppText></Card> : financeError ? <Card style={styles.section}>
        <AppText variant="heading">Finanțele clientului</AppText>
        <AppText style={{ color: palette.danger }}>{financeError}</AppText>
        <Button compact variant="outline" label="Reîncearcă" icon="refresh-outline" onPress={() => setFinanceReloadKey((current) => current + 1)} />
      </Card> : <>
        <ClientFinanceSection
          value={finance}
          expenses={financeExpenses}
          collaboratorCost={financeCollaboratorCost}
          commissionType={form.collaboratorId ? form.commissionType : undefined}
          commissionValue={form.collaboratorId ? safeCommission : 0}
          disabled={!canEditFinancials}
          onChange={setFinance}
        />
        <AppText variant="caption" muted>{client ? 'Valorile de mai sus se salvează împreună cu modificările clientului. Cheltuielile, participanții și istoricul se gestionează din profilul clientului.' : 'Finanțele vor fi salvate imediat după crearea clientului și a codului QR.'}</AppText>
      </> : null}

      <Card style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="people-outline" size={21} color={colors.primary} />
          </View>
          <View style={styles.sectionTitleCopy}>
            <AppText variant="heading">Colaborator și comision</AppText>
            <AppText variant="caption" muted>Atribuirea poate fi schimbată doar pentru acest client.</AppText>
          </View>
        </View>

        <View style={styles.block}>
          <AppText variant="label">Alege colaboratorul</AppText>
          <View style={styles.options}>
            {collaborators.map((item) => (
              <Button
                key={item.id}
                compact
                variant={form.collaboratorId === item.id ? 'primary' : 'outline'}
                icon={isPreset(item) ? 'star-outline' : 'person-outline'}
                label={item.name}
                onPress={() => selectCollaborator(item)}
              />
            ))}
          </View>
          {collaboratorsLoading ? <AppText variant="caption" muted>Se încarcă lista colaboratorilor…</AppText> : null}
          {collaboratorsError ? (
            <View style={[styles.collaboratorError, { backgroundColor: palette.dangerSoft, borderColor: palette.danger }]}>
              <Ionicons name="cloud-offline-outline" size={19} color={palette.danger} />
              <View style={styles.collaboratorErrorCopy}>
                <AppText variant="caption" style={{ color: palette.danger }}>{collaboratorsError}</AppText>
                <Button compact variant="outline" label="Reîncearcă" onPress={() => setCollaboratorsReloadKey((current) => current + 1)} />
              </View>
            </View>
          ) : null}
          {!collaboratorsLoading && !collaboratorsError && !collaborators.length ? <AppText variant="caption" muted>Nu există colaboratori disponibili pentru această proprietate.</AppText> : null}
        </View>

        {form.collaboratorId ? (
          <View style={[styles.assignmentCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <View style={styles.assignmentHeader}>
              <View style={styles.assignmentIdentity}>
                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                  <Ionicons name="person" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.assignmentName}>
                  <View style={styles.nameRow}>
                    <AppText variant="label">{selectedCollaborator?.name ?? 'Colaborator atribuit'}</AppText>
                    {selectedCollaborator && isPreset(selectedCollaborator) ? (
                      <View style={[styles.presetBadge, { backgroundColor: colors.primarySoft }]}>
                        <Ionicons name="star" size={11} color={colors.primary} />
                        <AppText variant="caption" style={{ color: colors.primary }}>Presetat</AppText>
                      </View>
                    ) : null}
                  </View>
                  <AppText variant="caption" muted>Setările de mai jos se aplică acestui client.</AppText>
                </View>
              </View>
              <Button compact variant="danger" icon="trash-outline" label="Elimină" onPress={removeCollaborator} />
            </View>

            <View style={styles.block}>
              <AppText variant="label">Tipul comisionului</AppText>
              <View style={[styles.segment, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <SegmentOption label="Sumă fixă" active={form.commissionType === 'FIXED'} onPress={() => update('commissionType', 'FIXED')} />
                <SegmentOption label="Procent" active={form.commissionType !== 'FIXED'} onPress={() => update('commissionType', percentageType)} />
              </View>
            </View>

            {form.commissionType !== 'FIXED' ? (
              <View style={styles.block}>
                <AppText variant="label">Procent calculat din</AppText>
                <View style={[styles.segment, styles.secondarySegment, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <SegmentOption label="Din net" active={form.commissionType === 'PERCENT_NET'} onPress={() => selectPercentageType('PERCENT_NET')} />
                  <SegmentOption label="Din total" active={form.commissionType === 'PERCENT_TOTAL'} onPress={() => selectPercentageType('PERCENT_TOTAL')} />
                </View>
              </View>
            ) : null}

            <Input
              label={form.commissionType === 'FIXED' ? 'Sumă fixă (lei)' : 'Procent (%)'}
              keyboardType="decimal-pad"
              value={form.commissionValue}
              onChangeText={(value) => {
                update('commissionValue', value);
                setCommissionError(undefined);
              }}
              error={commissionError}
            />

            <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.previewIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="calculator-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.previewCopy}>
                <AppText variant="caption" muted>
                  {form.commissionType === 'FIXED'
                    ? 'Comisionul calculat pentru fiecare fișă'
                    : form.commissionType === 'PERCENT_TOTAL'
                      ? 'Exemplu pentru un total de 1.000 lei'
                      : 'Exemplu pentru 1.000 lei total, 300 lei costuri și 700 lei net'}
                </AppText>
                <AppText variant="heading" style={{ color: colors.primary }}>{formatCurrency(preview)}</AppText>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.emptyAssignment, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <Ionicons name="person-remove-outline" size={21} color={colors.textMuted} />
            <View style={styles.emptyCopy}>
              <AppText variant="label">Fără colaborator atribuit</AppText>
              <AppText variant="caption" muted>Clientul poate fi salvat fără comision.</AppText>
            </View>
          </View>
        )}
      </Card>

      <Card style={styles.section}>
        <AppText variant="heading">Observații</AppText>
        <Input multiline numberOfLines={4} textAlignVertical="top" placeholder="Informații utile despre client…" value={form.notes} onChangeText={(value) => update('notes', value)} style={{ minHeight: 90 }} />
      </Card>

      <Button label={client ? 'Salvează modificările' : 'Adaugă clientul'} icon="checkmark-circle-outline" loading={loading} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  section: { gap: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { minWidth: 230, flex: 1 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionTitleCopy: { flex: 1, gap: 2 },
  block: { gap: spacing.sm },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  collaboratorError: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  collaboratorErrorCopy: { flex: 1, alignItems: 'flex-start', gap: spacing.sm },
  assignmentCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.lg },
  assignmentHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  assignmentIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 210, gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  assignmentName: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  presetBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.md, padding: spacing.xs, gap: spacing.xs },
  secondarySegment: { maxWidth: 430 },
  segmentOption: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  preview: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  previewCopy: { flex: 1, gap: 2 },
  emptyAssignment: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emptyCopy: { flex: 1, gap: 2 },
});
