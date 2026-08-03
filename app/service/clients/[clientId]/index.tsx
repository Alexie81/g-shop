import { ClientQRPanel } from '@/components/clients/ClientQRPanel';
import { ClientAuditHistory } from '@/components/clients/ClientAuditHistory';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { WhatsAppQuickMessagesModal } from '@/components/clients/WhatsAppQuickMessagesModal';
import { ClientCollaboratorFinanceCard } from '@/components/clients/finance/ClientCollaboratorFinanceCard';
import { ClientFinanceOverviewCard, ClientFinanceSection } from '@/components/clients/finance';
import { AppHeader } from '@/components/layout/AppHeader';
import { ServiceDocumentsPanel } from '@/components/service-sheets/ServiceDocumentsPanel';
import { QuickSignatureModal } from '@/components/service-sheets/ScanServiceSheetModal';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { clientRepository, serviceSheetRepository, whatsAppMessageRepository } from '@/repositories/api-repositories';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { AuditLog, Client, ClientFinancialOverview, Paginated } from '@/types';
import { formatDate, fullName, initials } from '@/utils/format';
import { ClientFinanceValue } from '@/utils/client-finance';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

type Tab = 'Detalii' | 'Finanțe' | 'Semnătură' | 'QR' | 'Istoric';

export default function ClientDetailsScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { user, hasPermission } = useAuth();
  const { activeProperty } = useProperty();
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme(); const { showToast } = useToast(); const [tab, setTab] = useState<Tab>('Detalii');
  const [financeSaving, setFinanceSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const isAdmin = user?.role === 'ADMIN';
  const compactLayout = width <= 390;
  const canViewFinancials = hasPermission('financials.view');
  const canEditClients = hasPermission('clients.update');
  const canSignClient = hasPermission('service_sheets.sign');
  const canManageCollaborators = hasPermission('collaborators.manage');
  const canEditFinancials = canViewFinancials && hasPermission('clients.update');
  const tabs: Tab[] = [
    'Detalii',
    ...(canViewFinancials ? ['Finanțe' as const] : []),
    'Semnătură',
    'QR',
    ...(isAdmin ? ['Istoric' as const] : []),
  ];
  const returnToClients = () => router.replace('/service/clients');
  const state = useAsyncData(async () => {
    let client = await clientRepository.get(clientId);
    if (!client.qr || client.qr.status === 'NOT_GENERATED') {
      try { client = await clientRepository.ensureQr(client.id); } catch { /* Keep legacy client profiles accessible if QR provisioning is unavailable. */ }
    }
    const [sheets, financials, history, whatsAppMessages] = await Promise.all([
      serviceSheetRepository.list(client.propertyId),
      canViewFinancials ? clientRepository.getFinancials(client.id) : Promise.resolve(null),
      isAdmin ? apiRequest<Paginated<AuditLog>>(`/audit-logs?propertyId=${client.propertyId}&entityId=${client.id}`) : Promise.resolve({ data: [], page: 1, pageSize: 0, total: 0, totalPages: 0 }),
      whatsAppMessageRepository.list(client.propertyId).catch(() => []),
    ]);
    return { client, sheets: sheets.data.filter((item) => item.clientId === client.id), financials, history: history.data, whatsAppMessages };
  }, [canViewFinancials, clientId, isAdmin]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  if (state.loading) return <Screen header={<AppHeader title="Detalii client" back onBack={returnToClients} />}><LoadingState rows={5} /></Screen>;
  if (state.error || !state.data) return <Screen header={<AppHeader title="Detalii client" back onBack={returnToClients} />}><ErrorState message={state.error?.message ?? 'Clientul nu există.'} onRetry={() => void state.reload()} /></Screen>;

  const { client, sheets, financials, history, whatsAppMessages } = state.data;
  const serviceSheet = sheets[0];
  const contact = async (url: string) => { if (await Linking.canOpenURL(url)) await Linking.openURL(url); else showToast('Acțiunea nu este disponibilă.', 'error'); };
  const openServiceSheet = () => serviceSheet
    ? router.push(`/service/service-sheets/${serviceSheet.id}`)
    : router.push({ pathname: '/service/service-sheets/create', params: { clientId: client.id, returnTo: `/service/clients/${client.id}` } });
  const selectTab = (next: Tab) => {
    if (next === tab) return;
    Haptics.selectionAsync().catch(() => undefined);
    setTab(next);
  };
  const replaceFinancials = (next: ClientFinancialOverview) => state.setData((current) => current ? { ...current, financials: next } : current);
  const reloadFinanceHistory = async () => {
    if (!isAdmin) return;
    const next = await apiRequest<Paginated<AuditLog>>(`/audit-logs?propertyId=${client.propertyId}&entityId=${client.id}`);
    state.setData((current) => current ? { ...current, history: next.data } : current);
  };
  const saveFinancials = async (next: ClientFinanceValue) => {
    if (!canEditFinancials) return;
    setFinanceSaving(true);
    try {
      replaceFinancials(await clientRepository.updateFinancials(client.id, next));
      await reloadFinanceHistory();
      showToast('Datele financiare au fost actualizate.', 'success');
    } finally {
      setFinanceSaving(false);
    }
  };
  const refreshExpenses = async () => {
    const next = await clientRepository.getFinancials(client.id);
    state.setData((current) => current?.financials ? {
      ...current,
      financials: { ...next, financials: current.financials.financials },
    } : current);
  };
  const changeClientStatus = async () => {
    if (!canEditClients) return;
    const finalized = client.status === 'FINALIZED';
    setStatusSaving(true);
    try {
      const updated = await clientRepository.update(client.id, { status: finalized ? 'ACTIVE' : 'FINALIZED' });
      state.setData((current) => current ? { ...current, client: updated } : current);
      await reloadFinanceHistory();
      showToast(finalized ? 'Clientul a fost redeschis.' : 'Clientul a fost finalizat.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Statusul clientului nu a putut fi actualizat.', 'error');
      throw error;
    } finally {
      setStatusSaving(false);
    }
  };
  const saveClientSignature = async (signature: string) => {
    if (!canSignClient || signatureSaving) return;
    setSignatureSaving(true);
    try {
      const updated = await clientRepository.saveSignature(client.id, signature);
      state.setData((current) => current ? {
        ...current,
        client: updated,
        sheets: current.sheets.map((item) => ({ ...item, signedAt: updated.signedAt, signatureUrl: updated.signatureUrl })),
      } : current);
      setSignatureOpen(false);
      showToast('Semnătura clientului a fost salvată și va fi folosită automat în documente.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Semnătura clientului nu a putut fi salvată.', 'error');
    } finally {
      setSignatureSaving(false);
    }
  };
  const setCollaboratorPaid = async (collaboratorId: string, paid: boolean) => {
    if (!canManageCollaborators) return;
    try {
      await apiRequest('/commissions/client-status', {
        method: 'PUT',
        body: JSON.stringify({ propertyId: client.propertyId, collaboratorId, clientId: client.id, paid }),
      });
      await state.reload(true);
      showToast(paid ? 'Comisionul a fost marcat achitat.' : 'Comisionul a fost marcat neachitat.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Starea comisionului nu a putut fi actualizată.', 'error');
      throw error;
    }
  };
  const removeCollaboratorAssignment = async (collaboratorId: string) => {
    if (!canEditClients) return;
    try {
      await clientRepository.update(client.id, { collaborators: client.collaborators.filter((item) => item.collaboratorId !== collaboratorId) });
      await state.reload(true);
      showToast('Atribuirea colaboratorului a fost eliminată.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Atribuirea colaboratorului nu a putut fi eliminată.', 'error');
      throw error;
    }
  };
  return <Screen header={<AppHeader title="Detalii client" back onBack={returnToClients} />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)} style={[styles.screenContent, compactLayout && styles.screenContentCompact]}>
    <Card style={[styles.profile, compactLayout && styles.profileCompact]} elevated>
      <View style={styles.profileTop}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}><AppText variant="heading" style={{ color: '#fff', fontWeight: '900' }}>{initials(client.firstName, client.lastName)}</AppText></View>
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}><AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.profileName}>{fullName(client)}</AppText>{canEditClients ? <Pressable accessibilityRole="button" accessibilityLabel="Editează clientul" hitSlop={4} onPress={() => router.push(`/service/clients/${client.id}/edit`)} style={({ pressed }) => [styles.editButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}><Ionicons name="create-outline" size={19} color={colors.primary} /></Pressable> : null}</View>
          <View style={styles.profileContact}><ClientStatusBadge status={client.status} /><AppText variant="label" muted numberOfLines={1}>{client.phone}</AppText></View>
          <AppText variant="caption" muted numberOfLines={1}>{[client.city, client.county].filter(Boolean).join(', ') || 'Localitate nespecificată'}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>Adăugat {formatDate(client.createdAt)}</AppText>
        </View>
      </View>
      <View style={[styles.profileDivider, { backgroundColor: colors.border }]} />
      <View style={styles.quickActions}>
        <ClientQuickAction label="Sună" icon="call-outline" onPress={() => void contact(`tel:${client.phone}`)} />
        <ClientQuickAction label="WhatsApp" icon="logo-whatsapp" onPress={() => setWhatsAppOpen(true)} />
        <ClientQuickAction label="Email" icon="mail-outline" disabled={!client.email} onPress={() => void contact(`mailto:${client.email}`)} />
        <ClientQuickAction label="Dosar" icon="folder-open-outline" primary onPress={openServiceSheet} />
      </View>
    </Card>
    <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>{tabs.map((item) => {
      const selected = tab === item;
      return <Pressable key={item} accessibilityRole="tab" accessibilityLabel={`Fila ${item}`} accessibilityState={{ selected }} onPress={() => selectTab(item)} style={({ pressed }) => [styles.tab, selected && { backgroundColor: colors.primarySoft }, pressed && styles.tabPressed]}><AppText variant="caption" numberOfLines={1} style={{ color: selected ? colors.primary : colors.textMuted, fontWeight: '800' }}>{item}</AppText></Pressable>;
    })}</View>
    {tab === 'Detalii' ? <><Details client={client} financials={financials} onOpenFinancials={canViewFinancials ? () => selectTab('Finanțe') : undefined} />{serviceSheet ? <ServiceDocumentsPanel sheet={serviceSheet} /> : null}{canEditClients ? <ClientLifecycleAction finalized={client.status === 'FINALIZED'} loading={statusSaving} onConfirm={changeClientStatus} /> : null}</> : tab === 'Semnătură' ? <ClientSignaturePanel client={client} canSign={canSignClient} onSign={() => setSignatureOpen(true)} /> : tab === 'QR' ? <ClientQRPanel client={client} /> : tab === 'Finanțe' && financials ? <>
      <ClientFinanceSection
      value={financials.financials}
      expenses={financials.expenses}
      collaboratorCost={financials.summary.collaboratorCost}
      collaboratorPaid={(financials.collaborators ?? (financials.collaborator ? [financials.collaborator] : [])).reduce((sum, item) => sum + item.paid, 0)}
      disabled={!canEditFinancials}
      saving={financeSaving}
      onChange={(next) => replaceFinancials({ ...financials, financials: { ...financials.financials, ...next } })}
      onSave={canEditFinancials ? saveFinancials : undefined}
      onPaymentStatusChange={canEditFinancials ? saveFinancials : undefined}
      onAddExpense={canEditFinancials ? async (input) => { await clientRepository.addExpense(client.id, input); await refreshExpenses(); await reloadFinanceHistory(); showToast('Cheltuiala a fost adăugată.', 'success'); } : undefined}
      onUpdateExpense={canEditFinancials ? async (expenseId, input) => { await clientRepository.updateExpense(client.id, expenseId, input); await refreshExpenses(); await reloadFinanceHistory(); showToast('Cheltuiala a fost actualizată.', 'success'); } : undefined}
      onDeleteExpense={canEditFinancials ? async (expenseId) => { await clientRepository.removeExpense(client.id, expenseId); await refreshExpenses(); await reloadFinanceHistory(); showToast('Cheltuiala a fost ștearsă.', 'success'); } : undefined}
      />
      {(financials.collaborators ?? (financials.collaborator ? [financials.collaborator] : [])).length ? (financials.collaborators ?? [financials.collaborator!]).map((collaborator) => <ClientCollaboratorFinanceCard
        key={collaborator.id}
        collaborator={collaborator}
        currencyCode={financials.financials.currencyCode}
        hasServiceSheet={Boolean(serviceSheet)}
        canEditAssignment={canEditClients}
        canManagePayment={canManageCollaborators}
        onEditAssignment={() => router.push(`/service/clients/${client.id}/edit`)}
        onRemoveAssignment={() => removeCollaboratorAssignment(collaborator.id)}
        onSetPaid={(paid) => setCollaboratorPaid(collaborator.id, paid)}
      />) : <ClientCollaboratorFinanceCard
        collaborator={null}
        currencyCode={financials.financials.currencyCode}
        hasServiceSheet={Boolean(serviceSheet)}
        canEditAssignment={canEditClients}
        canManagePayment={canManageCollaborators}
        onEditAssignment={() => router.push(`/service/clients/${client.id}/edit`)}
        onRemoveAssignment={() => undefined}
        onSetPaid={() => undefined}
      />}
    </> : <History items={history} />}
    <WhatsAppQuickMessagesModal visible={whatsAppOpen} client={client} propertyName={activeProperty?.name ?? 'G-Shop'} messages={whatsAppMessages} onClose={() => setWhatsAppOpen(false)} />
    <QuickSignatureModal visible={signatureOpen} clientName={fullName(client)} saving={signatureSaving} onClose={() => setSignatureOpen(false)} onConfirm={(signature) => void saveClientSignature(signature)} />
  </Screen>;
}

function ClientQuickAction({ label, icon, onPress, disabled = false, primary = false }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  const { colors } = useAppTheme();
  const foreground = primary ? '#fff' : colors.primary;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label === 'Dosar' ? 'Dosarul reparației' : label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); onPress(); }}
    style={({ pressed }) => [styles.quickAction, { backgroundColor: primary ? colors.primary : colors.surfaceMuted, borderColor: primary ? colors.primary : colors.border, opacity: disabled ? 0.42 : pressed ? 0.76 : 1 }]}
  >
    <Ionicons name={icon} size={19} color={foreground} />
    <AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: foreground, width: '100%', textAlign: 'center', fontSize: label === 'WhatsApp' ? 9.5 : 11, lineHeight: 14, letterSpacing: -0.15, fontWeight: '800' }}>{label}</AppText>
  </Pressable>;
}

function Details({ client, financials, onOpenFinancials }: { client: Client; financials: ClientFinancialOverview | null; onOpenFinancials?: () => void }) {
  const { colors } = useAppTheme();
  const rows = [
    client.secondaryPhone ? ['Telefon secundar', client.secondaryPhone] : null,
    client.address ? ['Adresă', [client.address, client.city, client.county].filter(Boolean).join(', ')] : null,
    client.postalCode ? ['Cod poștal', client.postalCode] : null,
  ].filter(Boolean) as [string, string][];
  const hasAdditionalDetails = rows.length > 0 || Boolean(client.notes?.trim());
  return <>
    {financials ? <ClientFinanceOverviewCard overview={financials} showInternal compact actionLabel="Vezi toate finanțele" actionIcon="wallet-outline" onAction={onOpenFinancials} /> : null}
    {hasAdditionalDetails ? <Card style={styles.additionalCard}>
      <View style={styles.additionalHeader}><View style={[styles.additionalIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="information-circle-outline" size={20} color={colors.primary} /></View><View style={styles.additionalTitle}><AppText variant="heading">Detalii suplimentare</AppText><AppText variant="caption" muted>Doar informațiile completate</AppText></View></View>
      {rows.length ? <View style={styles.additionalRows}>{rows.map(([label, value]) => <View key={label} style={[styles.additionalRow, { borderBottomColor: colors.border }]}><AppText variant="caption" muted>{label}</AppText><AppText variant="label" selectable>{value}</AppText></View>)}</View> : null}
      {client.notes?.trim() ? <View style={[styles.notes, { backgroundColor: colors.surfaceMuted }]}><AppText variant="caption" muted>Observații</AppText><AppText>{client.notes}</AppText></View> : null}
    </Card> : null}
  </>;
}

function History({ items }: { items: AuditLog[] }) {
  return <ClientAuditHistory items={items} />;
}

function ClientSignaturePanel({ client, canSign, onSign }: { client: Client; canSign: boolean; onSign: () => void }) {
  const { colors } = useAppTheme();
  const signatureUrl = client.signatureUrl && client.signedAt && !/[?&]v=/.test(client.signatureUrl)
    ? `${client.signatureUrl}${client.signatureUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(client.signedAt)}`
    : client.signatureUrl;
  return <Card style={styles.signatureCard} elevated>
    <View style={styles.signatureHeader}>
      <View style={[styles.signatureIcon, { backgroundColor: `${palette.purple}16` }]}><Ionicons name="pencil-outline" size={24} color={palette.purple} /></View>
      <View style={styles.signatureCopy}><AppText variant="heading">Semnătura clientului</AppText><AppText variant="caption" muted>Se salvează acum și se preia automat când creezi mai târziu fișa de service și documentele.</AppText></View>
    </View>
    {signatureUrl ? <>
      <View style={[styles.signaturePreview, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><Image source={{ uri: signatureUrl }} resizeMode="contain" style={styles.signatureImage} /></View>
      <View style={styles.signatureStatus}><Ionicons name="checkmark-circle" size={19} color={palette.success} /><AppText variant="caption" muted>Semnat la {formatDate(client.signedAt, true)}</AppText></View>
    </> : <View style={[styles.signatureEmpty, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><Ionicons name="create-outline" size={28} color={colors.textMuted} /><View style={styles.signatureCopy}><AppText variant="label">Client nesemnat</AppText><AppText variant="caption" muted>Nu este necesară existența unei fișe sau a unui PDF.</AppText></View></View>}
    {canSign ? <Button label={signatureUrl ? 'Resemnează clientul' : 'Semnează clientul'} icon="pencil-outline" onPress={onSign} /> : <AppText variant="caption" muted>Ai nevoie de permisiunea de semnare a fișelor pentru a salva semnătura.</AppText>}
  </Card>;
}

function ClientLifecycleAction({ finalized, loading, onConfirm }: { finalized: boolean; loading: boolean; onConfirm: () => Promise<void> | void }) {
  const { colors, isDark } = useAppTheme();
  const [open, setOpen] = useState(false);
  const tone = finalized ? palette.success : palette.danger;
  const submit = async () => {
    try {
      await onConfirm();
      setOpen(false);
    } catch { /* The request layer and toast surface the actionable error. */ }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={finalized ? 'Redeschide clientul' : 'Finalizează clientul'} accessibilityState={{ disabled: loading, busy: loading }} disabled={loading} onPress={() => setOpen(true)} style={styles.lifecyclePressable}>
      {({ pressed }) => <Card style={[styles.lifecycle, {
        borderColor: pressed ? tone : `${tone}55`,
        backgroundColor: isDark ? `${tone}0D` : finalized ? palette.successSoft : palette.dangerSoft,
      }]}>
          <View style={[styles.lifecycleIcon, { backgroundColor: isDark ? `${tone}18` : colors.surface }]}><Ionicons name={finalized ? 'refresh-outline' : 'checkmark-done-outline'} size={21} color={tone} /></View>
          <View style={styles.lifecycleCopy}><AppText variant="label">{finalized ? 'Client finalizat' : 'Finalizează clientul'}</AppText><AppText variant="caption" muted>{finalized ? 'Apasă pentru redeschidere.' : 'Mută clientul în lista Finalizați.'}</AppText></View>
          <Ionicons name="chevron-forward" size={20} color={tone} />
        </Card>}
    </Pressable>
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
      <ModalSafeBottom style={[styles.lifecycleOverlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityLabel="Închide confirmarea" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <Card style={styles.lifecycleModal} elevated>
          <View style={[styles.lifecycleModalIcon, { backgroundColor: `${tone}18` }]}><Ionicons name={finalized ? 'refresh-outline' : 'checkmark-done-outline'} size={30} color={tone} /></View>
          <View style={styles.lifecycleModalCopy}><AppText variant="title">{finalized ? 'Redeschizi clientul?' : 'Finalizezi clientul?'}</AppText><AppText muted>{finalized ? 'Clientul va reveni în lista Activii și va putea fi lucrat în continuare.' : 'Clientul va apărea în lista Finalizați. Datele, fișa și istoricul rămân păstrate.'}</AppText></View>
          <View style={styles.lifecycleModalActions}><Button variant="outline" label="Anulează" disabled={loading} onPress={() => setOpen(false)} style={styles.lifecycleModalButton} /><Button variant={finalized ? 'primary' : 'danger'} label={finalized ? 'Redeschide clientul' : 'Finalizează clientul'} icon={finalized ? 'refresh-outline' : 'checkmark-done-outline'} loading={loading} onPress={() => void submit()} style={styles.lifecycleModalButton} /></View>
        </Card>
      </ModalSafeBottom>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  screenContent: { gap: spacing.md },
  screenContentCompact: { paddingHorizontal: spacing.sm },
  profile: { gap: spacing.md },
  profileCompact: { padding: spacing.md },
  profileTop: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  profileInfo: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileName: { minWidth: 0, flex: 1 },
  profileContact: { minWidth: 0, minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editButton: { width: 44, height: 44, flexShrink: 0, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  profileDivider: { height: 1, width: '100%' },
  quickActions: { width: '100%', maxWidth: 600, flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  quickAction: { minWidth: 0, maxWidth: 150, minHeight: 58, flex: 1, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  tabs: { width: '100%', maxWidth: 600, minHeight: 52, padding: 4, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'stretch', gap: 3 },
  tab: { minWidth: 0, minHeight: 44, flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  signatureCard: { width: '100%', maxWidth: 760, gap: spacing.lg },
  signatureHeader: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  signatureIcon: { width: 48, height: 48, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  signatureCopy: { minWidth: 0, flex: 1, gap: 3 },
  signaturePreview: { width: '100%', height: 220, borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', padding: spacing.md },
  signatureImage: { width: '100%', height: '100%' },
  signatureStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  signatureEmpty: { minHeight: 118, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tabPressed: { opacity: 0.68 },
  additionalCard: { gap: spacing.md },
  additionalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  additionalIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  additionalTitle: { flex: 1, minWidth: 0, gap: 1 },
  additionalRows: { gap: 0 },
  additionalRow: { minHeight: 48, borderBottomWidth: 1, justifyContent: 'center', gap: 2, paddingVertical: spacing.sm },
  notes: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  lifecyclePressable: { borderRadius: radius.lg },
  lifecycle: { minHeight: 64, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lifecycleIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  lifecycleCopy: { flex: 1, minWidth: 0, gap: 2 },
  lifecycleOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  lifecycleModal: { width: '100%', maxWidth: 480, padding: spacing.xxl, gap: spacing.lg },
  lifecycleModalIcon: { width: 62, height: 62, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  lifecycleModalCopy: { gap: spacing.sm },
  lifecycleModalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lifecycleModalButton: { flexGrow: 1, flexBasis: 180 },
});
