import { ClientCollaboratorFinanceCard } from '@/components/clients/finance/ClientCollaboratorFinanceCard';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { clientRepository, collaboratorRepository } from '@/repositories/api-repositories';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { ClientFinancialCollaborator, ClientFinancialOverview, Collaborator, CommissionType, UUID } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

type AssignmentDraft = {
  collaboratorId: UUID;
  commissionType: CommissionType;
  commissionValue: string;
};

type Props = {
  propertyId: UUID;
  clientId: UUID;
  overview: ClientFinancialOverview;
  hasServiceSheet: boolean;
  canEditAssignment: boolean;
  canManagePayment: boolean;
  onRefresh: () => Promise<void>;
};

const normalizeAssignments = (items: ClientFinancialCollaborator[]): AssignmentDraft[] => items.map((item) => ({
  collaboratorId: item.id,
  commissionType: item.commissionType ?? 'PERCENT_NET',
  commissionValue: String(item.commissionValue ?? 0),
}));

const parseValue = (value: string) => Number(value.trim().replace(',', '.'));

export function ServiceSheetCollaborators({ propertyId, clientId, overview, hasServiceSheet, canEditAssignment, canManagePayment, onRefresh }: Props) {
  const { colors } = useAppTheme();
  const { showToast } = useToast();
  const assigned = overview.collaborators ?? (overview.collaborator ? [overview.collaborator] : []);
  const [editorOpen, setEditorOpen] = useState(false);
  const [available, setAvailable] = useState<Collaborator[]>([]);
  const [drafts, setDrafts] = useState<AssignmentDraft[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ro');
    return available.filter((item) => !needle || `${item.name} ${item.role ?? ''}`.toLocaleLowerCase('ro').includes(needle));
  }, [available, query]);

  const openEditor = async () => {
    if (!canEditAssignment) return;
    setDrafts(normalizeAssignments(assigned));
    setQuery('');
    setError('');
    setEditorOpen(true);
    setLoading(true);
    void Haptics.selectionAsync().catch(() => undefined);
    try {
      setAvailable(await collaboratorRepository.list(propertyId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Colaboratorii nu au putut fi încărcați.');
    } finally {
      setLoading(false);
    }
  };

  const toggleCollaborator = (collaborator: Collaborator) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setDrafts((current) => current.some((item) => item.collaboratorId === collaborator.id)
      ? current.filter((item) => item.collaboratorId !== collaborator.id)
      : [...current, {
        collaboratorId: collaborator.id,
        commissionType: collaborator.defaultCommissionType,
        commissionValue: String(collaborator.defaultCommissionValue),
      }]);
    setError('');
  };

  const updateDraft = (collaboratorId: UUID, patch: Partial<AssignmentDraft>) => {
    setDrafts((current) => current.map((item) => item.collaboratorId === collaboratorId ? { ...item, ...patch } : item));
    setError('');
  };

  const save = async () => {
    for (const draft of drafts) {
      const value = parseValue(draft.commissionValue);
      if (!Number.isFinite(value) || value < 0 || (draft.commissionType !== 'FIXED' && value > 100)) {
        setError('Introdu valori valide. Procentele trebuie să fie între 0 și 100%.');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      await clientRepository.update(clientId, {
        collaborators: drafts.map((item, index) => ({
          collaboratorId: item.collaboratorId,
          name: available.find((collaborator) => collaborator.id === item.collaboratorId)?.name ?? 'Colaborator',
          commissionType: item.commissionType,
          commissionValue: parseValue(item.commissionValue),
          sortOrder: index + 1,
        })),
      });
      await onRefresh();
      setEditorOpen(false);
      showToast('Colaboratorii și comisioanele au fost actualizate.', 'success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Atribuirile nu au putut fi salvate.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (collaboratorId: UUID) => {
    const remaining = normalizeAssignments(assigned).filter((item) => item.collaboratorId !== collaboratorId);
    await clientRepository.update(clientId, {
      collaborators: remaining.map((item, index) => ({
        collaboratorId: item.collaboratorId,
        name: assigned.find((collaborator) => collaborator.id === item.collaboratorId)?.name ?? 'Colaborator',
        commissionType: item.commissionType,
        commissionValue: parseValue(item.commissionValue),
        sortOrder: index + 1,
      })),
    });
    await onRefresh();
    showToast('Atribuirea colaboratorului a fost eliminată.', 'success');
  };

  const setPaid = async (collaboratorId: UUID, paid: boolean) => {
    await apiRequest('/commissions/client-status', {
      method: 'PUT',
      body: JSON.stringify({ propertyId, collaboratorId, clientId, paid }),
    });
    await onRefresh();
    showToast(paid ? 'Comisionul a fost marcat achitat.' : 'Comisionul a fost marcat neachitat.', 'success');
  };

  return <>
    {assigned.length ? assigned.map((collaborator) => <ClientCollaboratorFinanceCard
      key={collaborator.id}
      collaborator={collaborator}
      currencyCode={overview.financials.currencyCode}
      hasServiceSheet={hasServiceSheet}
      canEditAssignment={canEditAssignment}
      canManagePayment={canManagePayment}
      onEditAssignment={() => void openEditor()}
      onRemoveAssignment={() => remove(collaborator.id)}
      onSetPaid={(paid) => setPaid(collaborator.id, paid)}
    />) : <ClientCollaboratorFinanceCard
      collaborator={null}
      currencyCode={overview.financials.currencyCode}
      hasServiceSheet={hasServiceSheet}
      canEditAssignment={canEditAssignment}
      canManagePayment={canManagePayment}
      onEditAssignment={() => void openEditor()}
      onRemoveAssignment={() => undefined}
      onSetPaid={() => undefined}
    />}

    <Modal visible={editorOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => !saving && setEditorOpen(false)}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityLabel="Închide editorul" style={StyleSheet.absoluteFill} onPress={() => !saving && setEditorOpen(false)} />
        <Card style={[styles.sheet, { borderColor: colors.border }]} elevated>
          <View style={styles.handleWrap}><View style={[styles.handle, { backgroundColor: colors.border }]} /></View>
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: `${palette.cyan}18` }]}><Ionicons name="people-outline" size={23} color={palette.cyan} /></View>
            <View style={styles.copy}><AppText variant="title">Colaboratori și comision</AppText><AppText variant="caption" muted>Modificările se sincronizează automat cu clientul.</AppText></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Închide" disabled={saving} onPress={() => setEditorOpen(false)} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
          </View>

          <Input label="Caută colaborator" value={query} onChangeText={setQuery} placeholder="Nume sau rol" />
          {error ? <View style={[styles.notice, { backgroundColor: `${palette.danger}12` }]}><Ionicons name="alert-circle-outline" size={19} color={palette.danger} /><AppText variant="caption" style={[styles.copy, { color: palette.danger }]}>{error}</AppText></View> : null}

          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
            <View style={styles.options}>
              {loading ? <AppText muted>Se încarcă lista…</AppText> : filtered.map((item) => {
                const selected = drafts.some((draft) => draft.collaboratorId === item.id);
                return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleCollaborator(item)} style={({ pressed }) => [styles.option, { backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.76 : 1 }]}>
                  <View style={[styles.optionIcon, { backgroundColor: selected ? colors.primary : colors.surface }]}><Ionicons name={selected ? 'checkmark' : 'person-outline'} size={18} color={selected ? '#FFFFFF' : colors.primary} /></View>
                  <View style={styles.copy}><AppText variant="label">{item.name}</AppText><AppText variant="caption" muted>{item.role || 'Colaborator'}</AppText></View>
                </Pressable>;
              })}
            </View>

            {drafts.map((draft) => {
              const collaborator = available.find((item) => item.id === draft.collaboratorId);
              return <View key={draft.collaboratorId} style={[styles.assignment, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <View style={styles.assignmentHeader}><View style={styles.copy}><AppText variant="heading">{collaborator?.name ?? assigned.find((item) => item.id === draft.collaboratorId)?.name ?? 'Colaborator'}</AppText><AppText variant="caption" muted>Regula aplicată acestui client și fișei sale</AppText></View><Button compact variant="danger" icon="trash-outline" label="Elimină" onPress={() => setDrafts((current) => current.filter((item) => item.collaboratorId !== draft.collaboratorId))} /></View>
                <View style={styles.segments}>
                  <Segment label="Sumă fixă" active={draft.commissionType === 'FIXED'} onPress={() => updateDraft(draft.collaboratorId, { commissionType: 'FIXED' })} />
                  <Segment label="% din net" active={draft.commissionType === 'PERCENT_NET'} onPress={() => updateDraft(draft.collaboratorId, { commissionType: 'PERCENT_NET' })} />
                  <Segment label="% din total" active={draft.commissionType === 'PERCENT_TOTAL'} onPress={() => updateDraft(draft.collaboratorId, { commissionType: 'PERCENT_TOTAL' })} />
                </View>
                <Input label={draft.commissionType === 'FIXED' ? 'Sumă fixă' : 'Procent'} keyboardType="decimal-pad" value={draft.commissionValue} onChangeText={(value) => updateDraft(draft.collaboratorId, { commissionValue: value })} />
              </View>;
            })}
          </ScrollView>

          <Button label="Salvează colaboratorii" icon="checkmark-circle-outline" loading={saving} disabled={loading} onPress={() => void save()} />
        </Card>
      </View>
    </Modal>
  </>;
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={({ pressed }) => [styles.segment, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.78 : 1 }]}><AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit style={{ color: active ? '#FFFFFF' : colors.text, fontWeight: '800' }}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 720, maxHeight: '92%', alignSelf: 'center', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: spacing.lg, gap: spacing.md },
  handleWrap: { alignItems: 'center', paddingBottom: spacing.xs },
  handle: { width: 48, height: 5, borderRadius: radius.pill },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIcon: { width: 46, height: 46, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  copy: { minWidth: 0, flex: 1, gap: 2 },
  close: { width: 44, height: 44, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  notice: { borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  content: { flexGrow: 0 },
  contentInner: { gap: spacing.md, paddingBottom: spacing.sm },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minWidth: 210, flexGrow: 1, flexBasis: '46%', borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionIcon: { width: 38, height: 38, flexShrink: 0, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  assignment: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  assignmentHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segment: { minHeight: 42, flexGrow: 1, flexBasis: 110, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
});
