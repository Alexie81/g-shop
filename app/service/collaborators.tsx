import { CollaboratorFinanceSheet } from '@/components/dashboard/CollaboratorFinanceSheet';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { collaboratorRepository } from '@/repositories/api-repositories';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { Collaborator, CollaboratorFinanceGroup, CollaboratorFinanceSummary, CommissionType } from '@/types';
import { calculateCommission, calculateNet } from '@/utils/commission';
import { formatCurrency } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

type Filter = 'ALL' | CommissionType;
type EditorTarget = 'new' | Collaborator | null;

type CollaboratorForm = {
  name: string;
  role: string;
  phone: string;
  email: string;
  bankAccount: string;
  notes: string;
  isPreset: boolean;
  commissionType: CommissionType;
  commissionValue: string;
};

const emptyFinance: CollaboratorFinanceSummary = {
  paid: 0,
  due: 0,
  total: 0,
  collaborators: [],
};

const emptyForm: CollaboratorForm = {
  name: '',
  role: '',
  phone: '',
  email: '',
  bankAccount: '',
  notes: '',
  isPreset: false,
  commissionType: 'PERCENT_NET',
  commissionValue: '15',
};

function formFromCollaborator(collaborator: Collaborator): CollaboratorForm {
  return {
    name: collaborator.name,
    role: collaborator.role ?? '',
    phone: collaborator.phone ?? '',
    email: collaborator.email ?? '',
    bankAccount: collaborator.bankAccount ?? '',
    notes: collaborator.notes ?? '',
    isPreset: collaborator.isPreset ?? false,
    commissionType: collaborator.defaultCommissionType,
    commissionValue: String(collaborator.defaultCommissionValue),
  };
}

export default function CollaboratorsScreen() {
  const { activeProperty } = useProperty();
  const { hasPermission } = useAuth();
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const propertyId = activeProperty?.id ?? '';
  const canManage = hasPermission('collaborators.manage');
  const compact = width < 620;
  const cardBasis = width >= 1060 ? 320 : width >= 700 ? 300 : Math.max(280, width - 32);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [actionsFor, setActionsFor] = useState<Collaborator | null>(null);
  const [editor, setEditor] = useState<EditorTarget>(null);
  const [form, setForm] = useState<CollaboratorForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmFor, setConfirmFor] = useState<Collaborator | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [financeFor, setFinanceFor] = useState<Collaborator | null>(null);
  const [heroHeight, setHeroHeight] = useState(190);

  const state = useAsyncData(async () => {
    const collaborators = await collaboratorRepository.list(propertyId);
    const finance = await apiRequest<CollaboratorFinanceSummary>(`/collaborator-finances?propertyId=${propertyId}`).catch(() => emptyFinance);
    return { collaborators, finance };
  }, [propertyId]);

  const financeByCollaborator = useMemo(() => new Map(
    (state.data?.finance.collaborators ?? []).map((item) => [item.collaboratorId, item]),
  ), [state.data?.finance.collaborators]);

  const collaborators = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ro-RO');
    return (state.data?.collaborators ?? []).filter((item) => {
      if (filter !== 'ALL' && item.defaultCommissionType !== filter) return false;
      if (!normalizedQuery) return true;
      return [item.name, item.role, item.phone, item.email]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase('ro-RO').includes(normalizedQuery));
    });
  }, [filter, query, state.data?.collaborators]);

  const assignedClients = state.data?.finance.collaborators.reduce((total, item) => total + item.clientsCount, 0) ?? 0;

  const openEditor = (target: 'new' | Collaborator) => {
    setForm(target === 'new' ? { ...emptyForm } : formFromCollaborator(target));
    setEditor(target);
  };

  const updateForm = (key: keyof CollaboratorForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveCollaborator = async () => {
    const value = Number(form.commissionValue.replace(',', '.'));
    if (form.name.trim().length < 3) {
      showToast('Numele trebuie să aibă minimum 3 caractere.', 'error');
      return;
    }
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      showToast('Adresa de email nu este validă.', 'error');
      return;
    }
    const isPercentage = form.commissionType !== 'FIXED';
    if (!Number.isFinite(value) || value < 0 || (isPercentage && value > 100)) {
      showToast(isPercentage ? 'Procentul trebuie să fie între 0 și 100.' : 'Suma comisionului nu este validă.', 'error');
      return;
    }

    const payload = {
      name: form.name.trim(),
      role: form.role.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      bankAccount: form.bankAccount.trim(),
      notes: form.notes.trim(),
      isPreset: form.isPreset,
      defaultCommissionType: form.commissionType,
      defaultCommissionValue: value,
    };

    setSaving(true);
    try {
      if (editor === 'new') {
        await collaboratorRepository.create({ ...payload, propertyIds: [propertyId] });
        showToast('Colaboratorul a fost adăugat.', 'success');
      } else if (editor) {
        await collaboratorRepository.update(editor.id, { ...payload, propertyId });
        showToast('Colaboratorul a fost actualizat.', 'success');
      }
      setEditor(null);
      await state.reload(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Datele nu au putut fi salvate.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteCollaborator = async () => {
    if (!confirmFor) return;
    setDeleting(true);
    try {
      await collaboratorRepository.remove(confirmFor.id, propertyId);
      showToast(`${confirmFor.name} a fost șters. Istoricul a fost păstrat.`, 'success');
      setConfirmFor(null);
      await state.reload(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Colaboratorul nu a putut fi șters.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const runAfterMenuClose = (action: () => void) => {
    setActionsFor(null);
    setTimeout(action, 160);
  };

  return <Screen
    header={<AppHeader title="Colaboratori" back />}
    scroll={false}
    bottomInset={false}
    style={styles.screen}
  >
    <View style={styles.pageRoot}>
    <LinearGradient
      onLayout={(event) => {
        const nextHeight = event.nativeEvent.layout.height;
        if (Math.abs(nextHeight - heroHeight) > 1) setHeroHeight(nextHeight);
      }}
      colors={isDark ? ['#0A2261', '#075CFF'] : ['#092A8A', '#0878FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, styles.fixedHero]}
    >
      <View style={styles.heroDecorationOne} />
      <View style={styles.heroDecorationTwo} />
      <View style={styles.heroCopy}>
        <View style={styles.eyebrow}>
          <Ionicons name="people" size={15} color="#BFD7FF" />
          <AppText variant="label" style={styles.eyebrowText}>ECHIPA TA</AppText>
        </View>
        <AppText variant="display" style={styles.heroTitle}>Colaboratori și comisioane</AppText>
        <AppText style={styles.heroSubtitle}>Gestionează echipa, regulile de plată și situația fiecărui client dintr-un singur loc.</AppText>
      </View>
      {canManage ? <Button
        label="Colaborator nou"
        icon="person-add-outline"
        variant="secondary"
        onPress={() => openEditor('new')}
        style={[styles.heroButton, compact && styles.heroButtonCompact]}
      /> : null}
    </LinearGradient>

    <ScrollView
      style={styles.pageScroll}
      contentContainerStyle={[styles.pageScrollContent, { paddingTop: heroHeight + spacing.lg }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.reload(true)} tintColor={colors.primary} />}
    >
      <View style={[styles.pageSheet, { backgroundColor: colors.background, shadowColor: colors.shadow }]}>
        <View style={[styles.pageSheetHandle, { backgroundColor: colors.border }]} />

    <View style={styles.summaryGrid}>
      <SummaryCard icon="people-outline" color={palette.electric} label="Colaboratori activi" value={String(state.data?.collaborators.length ?? 0)} />
      <SummaryCard icon="person-circle-outline" color={palette.cyan} label="Clienți atribuiți" value={String(assignedClients)} />
      <SummaryCard icon="checkmark-circle-outline" color={palette.success} label="Achitat" value={formatCurrency(state.data?.finance.paid ?? 0)} />
      <SummaryCard icon="time-outline" color={palette.warning} label="De achitat" value={formatCurrency(state.data?.finance.due ?? 0)} />
    </View>

    <View style={styles.toolbar}>
      <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Caută colaborator"
          placeholder="Caută după nume, rol sau contact"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          style={[styles.searchInput, { color: colors.text }]}
        />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Șterge căutarea" hitSlop={8} onPress={() => setQuery('')}>
          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
        </Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <FilterPill label="Toți" active={filter === 'ALL'} onPress={() => setFilter('ALL')} />
        <FilterPill label="Procent din net" active={filter === 'PERCENT_NET'} onPress={() => setFilter('PERCENT_NET')} />
        <FilterPill label="Procent din total" active={filter === 'PERCENT_TOTAL'} onPress={() => setFilter('PERCENT_TOTAL')} />
        <FilterPill label="Sumă fixă" active={filter === 'FIXED'} onPress={() => setFilter('FIXED')} />
      </ScrollView>
    </View>

    <View style={styles.sectionHeading}>
      <View>
        <AppText variant="title">Echipa activă</AppText>
        <AppText variant="caption" muted>{collaborators.length} {collaborators.length === 1 ? 'rezultat' : 'rezultate'}</AppText>
      </View>
    </View>

    {state.loading ? <LoadingState rows={4} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !state.data?.collaborators.length ? <EmptyState
      icon="people-circle-outline"
      title="Niciun colaborator"
      message="Adaugă primul colaborator și configurează regula implicită de comision."
      action={canManage ? 'Adaugă colaborator' : undefined}
      onAction={canManage ? () => openEditor('new') : undefined}
    /> : !collaborators.length ? <EmptyState
      icon="search-outline"
      title="Niciun rezultat"
      message="Încearcă un alt termen de căutare sau elimină filtrul selectat."
      action="Resetează filtrele"
      onAction={() => { setQuery(''); setFilter('ALL'); }}
    /> : <View style={styles.cards}>
      {collaborators.map((item, index) => <CollaboratorCard
        key={item.id}
        collaborator={item}
        finance={financeByCollaborator.get(item.id)}
        accent={[palette.electric, palette.cyan, palette.purple, palette.warning][index % 4]}
        basis={cardBasis}
        selected={actionsFor?.id === item.id}
        onFinance={() => setFinanceFor(item)}
        onMenu={() => setActionsFor(item)}
      />)}
    </View>}

      </View>
    </ScrollView>

    <ActionSheet
      collaborator={actionsFor}
      canManage={canManage}
      onClose={() => setActionsFor(null)}
      onFinance={(item) => runAfterMenuClose(() => setFinanceFor(item))}
      onEdit={(item) => runAfterMenuClose(() => openEditor(item))}
      onDeactivate={(item) => runAfterMenuClose(() => setConfirmFor(item))}
    />

    <EditorModal
      visible={editor !== null}
      isEditing={editor !== null && editor !== 'new'}
      compact={compact}
      form={form}
      saving={saving}
      onChange={updateForm}
      onSave={() => void saveCollaborator()}
      onClose={() => { if (!saving) setEditor(null); }}
    />

    <ConfirmDeleteModal
      collaborator={confirmFor}
      loading={deleting}
      onConfirm={() => void deleteCollaborator()}
      onClose={() => { if (!deleting) setConfirmFor(null); }}
    />

    <CollaboratorFinanceSheet
      visible={financeFor !== null}
      propertyId={propertyId}
      collaboratorId={financeFor?.id}
      collaboratorName={financeFor?.name}
      onClose={() => setFinanceFor(null)}
      onChanged={() => void state.reload(true)}
    />
    </View>
  </Screen>;
}

function SummaryCard({ icon, color, label, value }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; value: string }) {
  const { colors, isDark } = useAppTheme();
  return <Card style={styles.summaryCard}>
    <View style={[styles.summaryIcon, { backgroundColor: isDark ? `${color}22` : `${color}12` }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <View style={styles.summaryCopy}>
      <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{value}</AppText>
      <AppText variant="caption" numberOfLines={1} style={{ color: colors.textMuted }}>{label}</AppText>
    </View>
  </Card>;
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={({ pressed }) => [
      styles.filter,
      { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.75 : 1 },
    ]}
  >
    {active ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
    <AppText variant="label" style={{ color: active ? '#fff' : colors.text }}>{label}</AppText>
  </Pressable>;
}

function CollaboratorCard({ collaborator, finance, accent, basis, selected, onFinance, onMenu }: {
  collaborator: Collaborator;
  finance?: CollaboratorFinanceGroup;
  accent: string;
  basis: number;
  selected: boolean;
  onFinance: () => void;
  onMenu: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  const initials = collaborator.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toLocaleUpperCase('ro-RO');
  const commission = collaborator.defaultCommissionType === 'FIXED'
    ? `${formatCurrency(collaborator.defaultCommissionValue)} / client`
    : `${collaborator.defaultCommissionValue}% din ${collaborator.defaultCommissionType === 'PERCENT_TOTAL' ? 'total' : 'net'}`;

  return <Card style={[styles.collaboratorCard, { flexBasis: basis, borderColor: selected ? colors.primary : colors.border }]} elevated>
    <View style={styles.cardHeader}>
      <View style={[styles.avatar, { backgroundColor: isDark ? `${accent}30` : `${accent}15`, borderColor: `${accent}55` }]}>
        <AppText variant="heading" style={{ color: accent }}>{initials}</AppText>
        <View style={[styles.activeDot, { backgroundColor: palette.success, borderColor: colors.surfaceElevated }]} />
      </View>
      <View style={styles.cardIdentity}>
        <AppText variant="heading" numberOfLines={1}>{collaborator.name}</AppText>
        <View style={styles.cardMeta}>
          <AppText variant="caption" muted numberOfLines={1} style={styles.cardRole}>{collaborator.role || 'Colaborator'}</AppText>
          {collaborator.isPreset ? <View style={[styles.presetBadge, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="sparkles" size={12} color={colors.primary} />
            <AppText variant="caption" style={[styles.presetBadgeText, { color: colors.primary }]}>Presetat</AppText>
          </View> : null}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Acțiuni pentru ${collaborator.name}`}
        hitSlop={4}
        onPress={onMenu}
        style={({ pressed }) => [styles.menuButton, { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' }]}
      >
        <Ionicons name="ellipsis-vertical" size={21} color={colors.textMuted} />
      </Pressable>
    </View>

    <View style={styles.contactList}>
      <ContactRow icon="call-outline" value={collaborator.phone || 'Telefon nespecificat'} />
      <ContactRow icon="mail-outline" value={collaborator.email || 'Email nespecificat'} />
    </View>

    <View style={[styles.commissionPill, { backgroundColor: isDark ? `${accent}20` : `${accent}0F` }]}>
      <Ionicons name={collaborator.defaultCommissionType === 'FIXED' ? 'cash-outline' : 'pie-chart-outline'} size={16} color={accent} />
      <AppText variant="label" style={{ color: accent }}>{commission}</AppText>
    </View>

    <View style={[styles.financeMetrics, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
      <CardMetric label="Clienți" value={String(finance?.clientsCount ?? 0)} color={colors.text} />
      <CardMetric label="Achitat" value={formatCurrency(finance?.paid ?? 0)} color={palette.success} />
      <CardMetric label="De achitat" value={formatCurrency(finance?.due ?? 0)} color={palette.warning} />
    </View>

    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Vezi situația financiară pentru ${collaborator.name}`}
      onPress={onFinance}
      style={({ pressed }) => [styles.financeButton, { backgroundColor: pressed ? colors.primarySoft : 'transparent' }]}
    >
      <AppText variant="label" style={{ color: colors.primary }}>Vezi situația financiară</AppText>
      <Ionicons name="arrow-forward" size={17} color={colors.primary} />
    </Pressable>
  </Card>;
}

function ContactRow({ icon, value }: { icon: keyof typeof Ionicons.glyphMap; value: string }) {
  const { colors } = useAppTheme();
  return <View style={styles.contactRow}>
    <Ionicons name={icon} size={16} color={colors.textMuted} />
    <AppText variant="caption" muted numberOfLines={1} style={styles.contactText}>{value}</AppText>
  </View>;
}

function CardMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={styles.cardMetric}>
    <AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62} style={{ color }}>{value}</AppText>
    <AppText variant="caption" muted>{label}</AppText>
  </View>;
}

function ActionSheet({ collaborator, canManage, onClose, onFinance, onEdit, onDeactivate }: {
  collaborator: Collaborator | null;
  canManage: boolean;
  onClose: () => void;
  onFinance: (item: Collaborator) => void;
  onEdit: (item: Collaborator) => void;
  onDeactivate: (item: Collaborator) => void;
}) {
  const { colors } = useAppTheme();
  if (!collaborator) return null;

  const call = () => collaborator.phone && void Linking.openURL(`tel:${collaborator.phone.replace(/\s/g, '')}`);
  const email = () => collaborator.email && void Linking.openURL(`mailto:${collaborator.email}`);

  return <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.modalRoot}>
      <Pressable accessibilityRole="button" accessibilityLabel="Închide meniul" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.actionSheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={styles.actionHandle} />
        <View style={styles.actionHeader}>
          <View style={[styles.actionAvatar, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="person-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.actionIdentity}>
            <AppText variant="heading" numberOfLines={1}>{collaborator.name}</AppText>
            {collaborator.isPreset ? <View style={[styles.actionPresetBadge, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="sparkles" size={12} color={colors.primary} />
              <AppText variant="caption" style={{ color: colors.primary }}>Presetat pentru clienții noi</AppText>
            </View> : <AppText variant="caption" muted>Ce dorești să faci?</AppText>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Închide" onPress={onClose} style={[styles.actionClose, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.actionList}>
          <ActionRow icon="wallet-outline" label="Vezi situația financiară" color={colors.primary} onPress={() => onFinance(collaborator)} />
          {canManage ? <ActionRow icon="create-outline" label="Editează colaboratorul" color={colors.text} onPress={() => onEdit(collaborator)} /> : null}
          {collaborator.phone ? <ActionRow icon="call-outline" label={`Sună ${collaborator.phone}`} color={colors.text} onPress={call} /> : null}
          {collaborator.email ? <ActionRow icon="mail-outline" label="Trimite email" color={colors.text} onPress={email} /> : null}
          {canManage ? <View style={[styles.dangerDivider, { borderTopColor: colors.border }]}>
            <ActionRow icon="trash-outline" label="Șterge colaboratorul" color={palette.danger} onPress={() => onDeactivate(collaborator)} />
          </View> : null}
        </View>
      </View>
    </View>
  </Modal>;
}

function ActionRow({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [styles.actionRow, { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' }]}
  >
    <View style={[styles.actionRowIcon, { backgroundColor: `${color}14` }]}><Ionicons name={icon} size={19} color={color} /></View>
    <AppText variant="label" style={{ color, flex: 1 }}>{label}</AppText>
    <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
  </Pressable>;
}

function EditorModal({ visible, isEditing, compact, form, saving, onChange, onSave, onClose }: {
  visible: boolean;
  isEditing: boolean;
  compact: boolean;
  form: CollaboratorForm;
  saving: boolean;
  onChange: (key: keyof CollaboratorForm, value: string | boolean) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const commissionValue = Number(form.commissionValue.replace(',', '.')) || 0;

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel="Închide formularul" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[
        styles.editor,
        compact ? styles.editorCompact : styles.editorWide,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}>
        <View style={[styles.editorHeader, { borderBottomColor: colors.border }]}>
          {compact ? <View style={[styles.editorHandle, { backgroundColor: colors.border }]} /> : null}
          <View style={styles.editorHeaderRow}>
            <View style={[styles.editorHeaderIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name={isEditing ? 'create-outline' : 'person-add-outline'} size={22} color={colors.primary} />
            </View>
            <View style={styles.editorHeaderCopy}>
              <AppText variant="title">{isEditing ? 'Editează colaboratorul' : 'Colaborator nou'}</AppText>
              <AppText variant="caption" muted>{isEditing ? 'Actualizează datele și regula pentru lucrările viitoare.' : 'Adaugă datele de contact și regula implicită de plată.'}</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Închide" onPress={onClose} style={[styles.actionClose, { backgroundColor: colors.surfaceMuted }]}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editorContent} showsVerticalScrollIndicator={false}>
          <View style={styles.formSection}>
            <View style={styles.formSectionTitle}>
              <Ionicons name="person-outline" size={18} color={colors.primary} />
              <AppText variant="heading">Date principale</AppText>
            </View>
            <Input label="Nume complet *" icon="person-outline" value={form.name} onChangeText={(value) => onChange('name', value)} />
            <Input label="Rol / specializare" icon="briefcase-outline" placeholder="Ex: Tehnician colaborator" value={form.role} onChangeText={(value) => onChange('role', value)} />
            <View style={styles.formRow}>
              <View style={styles.formField}><Input label="Telefon" icon="call-outline" keyboardType="phone-pad" value={form.phone} onChangeText={(value) => onChange('phone', value)} /></View>
              <View style={styles.formField}><Input label="Email" icon="mail-outline" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(value) => onChange('email', value)} /></View>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.formSectionTitle}>
              <Ionicons name="people-circle-outline" size={18} color={colors.primary} />
              <AppText variant="heading">Atribuire automată</AppText>
            </View>
            <View style={[
              styles.presetSwitchCard,
              {
                backgroundColor: form.isPreset ? colors.primarySoft : colors.surface,
                borderColor: form.isPreset ? colors.primary : colors.border,
              },
            ]}>
              <View style={[
                styles.presetSwitchIcon,
                { backgroundColor: form.isPreset ? colors.primary : colors.surfaceMuted },
              ]}>
                <Ionicons name="sparkles" size={21} color={form.isPreset ? '#fff' : colors.textMuted} />
              </View>
              <View style={styles.presetSwitchCopy}>
                <AppText variant="heading">Colaborator presetat</AppText>
                <AppText variant="caption" muted>
                  Se atribuie automat fiecărui client nou. Îl poți elimina sau îi poți modifica regula direct din client.
                </AppText>
              </View>
              <Switch
                accessibilityLabel="Colaborator presetat"
                accessibilityHint="Activează atribuirea automată la clienții noi"
                value={form.isPreset}
                onValueChange={(value) => onChange('isPreset', value)}
                disabled={saving}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.formSectionTitle}>
              <Ionicons name="calculator-outline" size={18} color={colors.primary} />
              <AppText variant="heading">Regulă de comision</AppText>
            </View>
            <View style={styles.commissionChoices}>
              <CommissionChoice
                label="Procent din net"
                description="Se aplică după scăderea costurilor directe"
                icon="pie-chart-outline"
                active={form.commissionType === 'PERCENT_NET'}
                onPress={() => onChange('commissionType', 'PERCENT_NET')}
              />
              <CommissionChoice
                label="Procent din total"
                description="Se aplică la valoarea totală a fișei"
                icon="analytics-outline"
                active={form.commissionType === 'PERCENT_TOTAL'}
                onPress={() => onChange('commissionType', 'PERCENT_TOTAL')}
              />
              <CommissionChoice
                label="Sumă fixă"
                description="Aceeași sumă pentru fiecare client"
                icon="cash-outline"
                active={form.commissionType === 'FIXED'}
                onPress={() => onChange('commissionType', 'FIXED')}
              />
            </View>
            <Input
              label={form.commissionType === 'FIXED' ? 'Sumă fixă (lei)' : 'Procent (%)'}
              icon={form.commissionType === 'FIXED' ? 'wallet-outline' : 'analytics-outline'}
              keyboardType="decimal-pad"
              value={form.commissionValue}
              onChangeText={(value) => onChange('commissionValue', value)}
            />
            <View style={[styles.example, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
              <View style={styles.exampleCopy}>
                <AppText variant="caption" muted>Exemplu: 1.000 lei total · 700 lei net</AppText>
                <AppText variant="label" style={{ color: colors.primary }}>{formatCurrency(calculateCommission(1000, 300, form.commissionType, commissionValue))} comision</AppText>
              </View>
              <AppText variant="caption" muted>Net: {formatCurrency(calculateNet(1000, 300))}</AppText>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.formSectionTitle}>
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              <AppText variant="heading">Detalii opționale</AppText>
            </View>
            <Input label="Cont bancar / IBAN" icon="card-outline" autoCapitalize="characters" value={form.bankAccount} onChangeText={(value) => onChange('bankAccount', value)} />
            <Input label="Observații interne" multiline numberOfLines={3} textAlignVertical="top" style={styles.notesInput} value={form.notes} onChangeText={(value) => onChange('notes', value)} />
          </View>
        </ScrollView>

        <View style={[styles.editorFooter, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <Button variant="ghost" label="Anulează" onPress={onClose} style={styles.footerButton} />
          <Button label={isEditing ? 'Salvează modificările' : 'Adaugă colaboratorul'} icon="checkmark-circle-outline" loading={saving} onPress={onSave} style={styles.footerPrimary} />
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function CommissionChoice({ label, description, icon, active, onPress }: {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return <Pressable
    accessibilityRole="radio"
    accessibilityState={{ checked: active }}
    onPress={onPress}
    style={({ pressed }) => [styles.commissionChoice, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface, opacity: pressed ? 0.8 : 1 }]}
  >
    <View style={[styles.choiceIcon, { backgroundColor: active ? colors.primary : colors.surfaceMuted }]}>
      <Ionicons name={icon} size={19} color={active ? '#fff' : colors.textMuted} />
    </View>
    <View style={styles.choiceCopy}>
      <AppText variant="label" style={{ color: active ? colors.primary : colors.text }}>{label}</AppText>
      <AppText variant="caption" muted>{description}</AppText>
    </View>
    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? colors.primary : colors.textMuted} />
  </Pressable>;
}

function ConfirmDeleteModal({ collaborator, loading, onConfirm, onClose }: {
  collaborator: Collaborator | null;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  if (!collaborator) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={[styles.confirmOverlay, { backgroundColor: colors.overlay }]}>
      <View style={[styles.confirm, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={[styles.confirmIcon, { backgroundColor: isDark ? `${palette.danger}22` : palette.dangerSoft }]}>
          <Ionicons name="trash-outline" size={28} color={palette.danger} />
        </View>
        <AppText variant="title" style={styles.confirmText}>Ștergi colaboratorul?</AppText>
        <AppText muted style={styles.confirmText}>
          {collaborator.name} va dispărea din echipa activă. Istoricul și situația financiară rămân păstrate.
        </AppText>
        <View style={[styles.warningBox, { backgroundColor: isDark ? `${palette.warning}18` : palette.warningSoft }]}>
          <Ionicons name="information-circle-outline" size={18} color={palette.warning} />
          <AppText variant="caption" style={{ color: palette.warning, flex: 1 }}>Ștergerea este permisă doar după realocarea clienților și achitarea sumelor restante.</AppText>
        </View>
        <View style={styles.confirmActions}>
          <Button variant="ghost" label="Renunță" disabled={loading} onPress={onClose} style={styles.footerButton} />
          <Button variant="danger" label="Șterge" icon="trash-outline" loading={loading} onPress={onConfirm} style={styles.footerPrimary} />
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 0, paddingBottom: 0 },
  pageRoot: { flex: 1, overflow: 'hidden' },
  pageScroll: { flex: 1 },
  pageScrollContent: { flexGrow: 1 },
  pageSheet: { minHeight: 760, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 112, gap: spacing.xl, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  pageSheetHandle: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginBottom: spacing.xs },
  hero: { minHeight: 190, borderRadius: 28, padding: spacing.xxl, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xl },
  fixedHero: { position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg },
  heroDecorationOne: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: '#FFFFFF0C', right: -36, top: -92 },
  heroDecorationTwo: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: '#FFFFFF0B', right: 138, bottom: -76 },
  heroCopy: { minWidth: 240, flex: 1, gap: spacing.sm },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyebrowText: { color: '#BFD7FF', letterSpacing: 1.2 },
  heroTitle: { color: '#fff', maxWidth: 650 },
  heroSubtitle: { color: '#DDE9FF', maxWidth: 670 },
  heroButton: { backgroundColor: '#FFFFFF' },
  heroButtonCompact: { width: '100%' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: -48 },
  summaryCard: { minWidth: 140, flexBasis: 150, flexGrow: 1, minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  summaryIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { minWidth: 0, flex: 1, gap: 2 },
  toolbar: { gap: spacing.md },
  search: { minHeight: 54, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  searchInput: { minWidth: 0, flex: 1, minHeight: 50, paddingVertical: 0, fontSize: 15 },
  filters: { gap: spacing.sm, paddingRight: spacing.lg },
  filter: { minHeight: 40, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: spacing.md },
  collaboratorCard: { minWidth: 280, flexGrow: 1, maxWidth: 420, gap: spacing.md, padding: spacing.lg, borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  activeDot: { position: 'absolute', right: -2, bottom: -2, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  cardIdentity: { minWidth: 0, flex: 1, gap: 2 },
  cardMeta: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  cardRole: { minWidth: 70, flexShrink: 1 },
  presetBadge: { minHeight: 23, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4 },
  presetBadgeText: { fontWeight: '700' },
  menuButton: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  contactList: { gap: spacing.sm },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  contactText: { minWidth: 0, flex: 1 },
  commissionPill: { minHeight: 40, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  financeMetrics: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.md },
  cardMetric: { minWidth: 0, flex: 1, alignItems: 'center', gap: 2 },
  financeButton: { minHeight: 42, marginHorizontal: -spacing.sm, marginBottom: -spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  actionSheet: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg },
  actionHandle: { width: 44, height: 5, borderRadius: radius.pill, backgroundColor: '#8796AA55', alignSelf: 'center' },
  actionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionAvatar: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionIdentity: { minWidth: 0, flex: 1, gap: 4 },
  actionPresetBadge: { minHeight: 24, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionClose: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionList: { gap: spacing.xs },
  actionRow: { minHeight: 54, borderRadius: radius.md, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionRowIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  dangerDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.sm, paddingTop: spacing.sm },
  editor: { width: '100%', maxWidth: 720, alignSelf: 'center', borderWidth: 1, overflow: 'hidden' },
  editorCompact: { maxHeight: '94%', borderBottomWidth: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  editorWide: { maxHeight: '92%', marginBottom: '2%', borderRadius: 28 },
  editorHeader: { borderBottomWidth: StyleSheet.hairlineWidth, padding: spacing.xl },
  editorHandle: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginTop: -spacing.md, marginBottom: spacing.md },
  editorHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  editorHeaderIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  editorHeaderCopy: { minWidth: 0, flex: 1, gap: 2 },
  editorContent: { padding: spacing.xl, gap: spacing.xl },
  formSection: { gap: spacing.md },
  formSectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  formField: { minWidth: 230, flex: 1 },
  presetSwitchCard: { minHeight: 92, borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  presetSwitchIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  presetSwitchCopy: { minWidth: 0, flex: 1, gap: 3 },
  commissionChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  commissionChoice: { minWidth: 250, flex: 1, minHeight: 82, borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  choiceIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  choiceCopy: { minWidth: 0, flex: 1 },
  example: { minHeight: 58, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  exampleCopy: { minWidth: 0, flex: 1 },
  notesInput: { minHeight: 78 },
  editorFooter: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md },
  footerButton: { minWidth: 120 },
  footerPrimary: { minWidth: 200 },
  confirmOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  confirm: { width: '100%', maxWidth: 480, borderWidth: 1, borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', gap: spacing.lg },
  confirmIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  confirmText: { textAlign: 'center' },
  warningBox: { width: '100%', borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', gap: spacing.sm },
  confirmActions: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
});
