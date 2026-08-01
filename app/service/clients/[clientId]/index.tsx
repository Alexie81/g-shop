import { ClientQRPanel } from '@/components/clients/ClientQRPanel';
import { ClientAuditHistory } from '@/components/clients/ClientAuditHistory';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { ClientCollaboratorFinanceCard } from '@/components/clients/finance/ClientCollaboratorFinanceCard';
import { ClientFinanceOverviewCard, ClientFinanceSection } from '@/components/clients/finance';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { clientRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { AuditLog, Client, ClientFinancialOverview, Paginated } from '@/types';
import { formatDate, fullName, initials } from '@/utils/format';
import { ClientFinanceValue } from '@/utils/client-finance';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

type Tab = 'Detalii' | 'Finanțe' | 'QR' | 'Istoric';

export default function ClientDetailsScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { user, hasPermission } = useAuth();
  const { colors } = useAppTheme(); const { showToast } = useToast(); const [tab, setTab] = useState<Tab>('Detalii');
  const [financeSaving, setFinanceSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const isAdmin = user?.role === 'ADMIN';
  const canViewFinancials = hasPermission('financials.view');
  const canEditClients = hasPermission('clients.update');
  const canManageCollaborators = hasPermission('collaborators.manage');
  const canEditFinancials = canViewFinancials && hasPermission('clients.update');
  const tabs: Tab[] = [
    'Detalii',
    ...(canViewFinancials ? ['Finanțe' as const] : []),
    'QR',
    ...(isAdmin ? ['Istoric' as const] : []),
  ];
  const state = useAsyncData(async () => {
    let client = await clientRepository.get(clientId);
    if (!client.qr || client.qr.status === 'NOT_GENERATED') {
      try { client = await clientRepository.ensureQr(client.id); } catch { /* Keep legacy client profiles accessible if QR provisioning is unavailable. */ }
    }
    const [sheets, financials, history] = await Promise.all([
      serviceSheetRepository.list(client.propertyId),
      canViewFinancials ? clientRepository.getFinancials(client.id) : Promise.resolve(null),
      isAdmin ? apiRequest<Paginated<AuditLog>>(`/audit-logs?propertyId=${client.propertyId}&entityId=${client.id}`) : Promise.resolve({ data: [], page: 1, pageSize: 0, total: 0, totalPages: 0 }),
    ]);
    return { client, sheets: sheets.data.filter((item) => item.clientId === client.id), financials, history: history.data };
  }, [canViewFinancials, clientId, isAdmin]);

  if (state.loading) return <Screen header={<AppHeader title="Detalii client" back />}><LoadingState rows={5} /></Screen>;
  if (state.error || !state.data) return <Screen header={<AppHeader title="Detalii client" back />}><ErrorState message={state.error?.message ?? 'Clientul nu există.'} onRetry={() => void state.reload()} /></Screen>;

  const { client, sheets, financials, history } = state.data;
  const serviceSheet = sheets[0];
  const contact = async (url: string) => { if (await Linking.canOpenURL(url)) await Linking.openURL(url); else showToast('Acțiunea nu este disponibilă.', 'error'); };
  const openServiceSheet = () => serviceSheet
    ? router.push(`/service/service-sheets/${serviceSheet.id}`)
    : router.push({ pathname: '/service/service-sheets/create', params: { clientId: client.id, returnTo: `/service/clients/${client.id}` } });
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
  const setCollaboratorPaid = async (paid: boolean) => {
    if (!financials?.collaborator || !canManageCollaborators) return;
    try {
      await apiRequest('/commissions/client-status', {
        method: 'PUT',
        body: JSON.stringify({ propertyId: client.propertyId, collaboratorId: financials.collaborator.id, clientId: client.id, paid }),
      });
      await state.reload(true);
      showToast(paid ? 'Comisionul a fost marcat achitat.' : 'Comisionul a fost marcat neachitat.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Starea comisionului nu a putut fi actualizată.', 'error');
      throw error;
    }
  };
  const removeCollaboratorAssignment = async () => {
    if (!canEditClients || !financials?.collaborator) return;
    try {
      await clientRepository.update(client.id, { collaboratorId: '' });
      await state.reload(true);
      showToast('Atribuirea colaboratorului a fost eliminată.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Atribuirea colaboratorului nu a putut fi eliminată.', 'error');
      throw error;
    }
  };
  return <Screen header={<AppHeader title="Detalii client" back />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <Card style={styles.profile}>
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}><AppText variant="title" style={{ color: '#fff' }}>{initials(client.firstName, client.lastName)}</AppText></View>
      <View style={styles.profileInfo}><View style={styles.nameRow}><AppText variant="title">{fullName(client)}</AppText><ClientStatusBadge status={client.status} /></View><AppText muted>{client.phone}{client.email ? ` · ${client.email}` : ''}</AppText><AppText variant="caption" muted>{client.city || 'Localitate nespecificată'} · Client din {formatDate(client.createdAt)}</AppText></View>
      <Button compact variant="outline" icon="create-outline" label="Editează" onPress={() => router.push(`/service/clients/${client.id}/edit`)} />
    </Card>
    <View style={styles.actions}><Button compact variant="secondary" icon="call-outline" label="Sună" onPress={() => void contact(`tel:${client.phone}`)} /><Button compact variant="secondary" icon="logo-whatsapp" label="WhatsApp" onPress={() => void contact(`https://wa.me/${client.phone.replace(/\D/g, '')}`)} /><Button compact variant="secondary" icon="mail-outline" label="Email" disabled={!client.email} onPress={() => void contact(`mailto:${client.email}`)} /><Button compact icon="document-text-outline" label="Fișă de service" onPress={openServiceSheet} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabScroller, { borderBottomColor: colors.border }]} contentContainerStyle={styles.tabs}>{tabs.map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && { borderBottomColor: colors.primary }]}><AppText variant="caption" style={{ color: tab === item ? colors.primary : colors.textMuted, fontWeight: '800' }}>{item}</AppText></Pressable>)}</ScrollView>
    {tab === 'Detalii' ? <><Details client={client} financials={financials} onOpenFinancials={canViewFinancials ? () => setTab('Finanțe') : undefined} />{canEditClients ? <ClientLifecycleAction finalized={client.status === 'FINALIZED'} loading={statusSaving} onConfirm={changeClientStatus} /> : null}</> : tab === 'QR' ? <ClientQRPanel client={client} /> : tab === 'Finanțe' && financials ? <>
      <ClientFinanceSection
      value={financials.financials}
      expenses={financials.expenses}
      collaboratorCost={financials.summary.collaboratorCost}
      commissionType={client.commissionType}
      commissionValue={client.commissionValue}
      disabled={!canEditFinancials}
      saving={financeSaving}
      onChange={(next) => replaceFinancials({ ...financials, financials: { ...financials.financials, ...next } })}
      onSave={canEditFinancials ? saveFinancials : undefined}
      onAddExpense={canEditFinancials ? async (input) => { await clientRepository.addExpense(client.id, input); await refreshExpenses(); await reloadFinanceHistory(); showToast('Cheltuiala a fost adăugată.', 'success'); } : undefined}
      onUpdateExpense={canEditFinancials ? async (expenseId, input) => { await clientRepository.updateExpense(client.id, expenseId, input); await refreshExpenses(); await reloadFinanceHistory(); showToast('Cheltuiala a fost actualizată.', 'success'); } : undefined}
      onDeleteExpense={canEditFinancials ? async (expenseId) => { await clientRepository.removeExpense(client.id, expenseId); await refreshExpenses(); await reloadFinanceHistory(); showToast('Cheltuiala a fost ștearsă.', 'success'); } : undefined}
      />
      <ClientCollaboratorFinanceCard
        collaborator={financials.collaborator}
        currencyCode={financials.financials.currencyCode}
        canEditAssignment={canEditClients}
        canManagePayment={canManageCollaborators}
        onEditAssignment={() => router.push(`/service/clients/${client.id}/edit`)}
        onRemoveAssignment={removeCollaboratorAssignment}
        onSetPaid={setCollaboratorPaid}
      />
    </> : <History items={history} />}
  </Screen>;
}

function Details({ client, financials, onOpenFinancials }: { client: Client; financials: ClientFinancialOverview | null; onOpenFinancials?: () => void }) {
  const rows = [
    ['Telefon', client.phone, 'call-outline'], ['Telefon secundar', client.secondaryPhone, 'phone-portrait-outline'], ['Email', client.email, 'mail-outline'],
    ['Adresă', client.address, 'location-outline'], ['Oraș', client.city, 'business-outline'], ['Județ / sector', client.county, 'map-outline'], ['Cod poștal', client.postalCode, 'mail-open-outline'],
  ] as const;
  return <>{financials ? <ClientFinanceOverviewCard overview={financials} showInternal actionLabel="Deschide finanțele complete" actionIcon="wallet-outline" onAction={onOpenFinancials} /> : null}<Card style={styles.detailCard}><AppText variant="heading">Informații client</AppText><View style={styles.detailGrid}>{rows.map(([label, value, icon]) => <View key={label} style={styles.detailRow}><View style={styles.smallIcon}><Ionicons name={icon} size={17} color={palette.electric} /></View><View style={{ flex: 1 }}><AppText variant="caption" muted>{label}</AppText><AppText variant="label">{value || '—'}</AppText></View></View>)}</View></Card><Card style={styles.detailCard}><AppText variant="heading">Observații</AppText><AppText muted>{client.notes || 'Nu există observații pentru acest client.'}</AppText></Card></>;
}

function History({ items }: { items: AuditLog[] }) {
  return <ClientAuditHistory items={items} />;
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
    <Card style={[styles.lifecycle, { borderColor: `${tone}55`, backgroundColor: isDark ? `${tone}0D` : `${tone}08` }]}>
      <View style={[styles.lifecycleIcon, { backgroundColor: `${tone}18` }]}><Ionicons name={finalized ? 'checkmark-done-outline' : 'flag-outline'} size={24} color={tone} /></View>
      <View style={styles.lifecycleCopy}><AppText variant="heading">{finalized ? 'Client finalizat' : 'Finalizează clientul'}</AppText><AppText variant="caption" muted>{finalized ? 'Clientul este închis și apare în filtrul Finalizați.' : 'Închide activitatea clientului și mută-l în lista Finalizați.'}</AppText></View>
      <Button compact variant={finalized ? 'outline' : 'danger'} icon={finalized ? 'refresh-outline' : 'checkmark-done-outline'} label={finalized ? 'Redeschide' : 'Finalizează'} loading={loading} onPress={() => setOpen(true)} />
    </Card>
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
      <View style={[styles.lifecycleOverlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityLabel="Închide confirmarea" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <Card style={styles.lifecycleModal} elevated>
          <View style={[styles.lifecycleModalIcon, { backgroundColor: `${tone}18` }]}><Ionicons name={finalized ? 'refresh-outline' : 'checkmark-done-outline'} size={30} color={tone} /></View>
          <View style={styles.lifecycleModalCopy}><AppText variant="title">{finalized ? 'Redeschizi clientul?' : 'Finalizezi clientul?'}</AppText><AppText muted>{finalized ? 'Clientul va reveni în lista Activii și va putea fi lucrat în continuare.' : 'Clientul va apărea în lista Finalizați. Datele, fișa și istoricul rămân păstrate.'}</AppText></View>
          <View style={styles.lifecycleModalActions}><Button variant="outline" label="Anulează" disabled={loading} onPress={() => setOpen(false)} style={styles.lifecycleModalButton} /><Button variant={finalized ? 'primary' : 'danger'} label={finalized ? 'Redeschide clientul' : 'Finalizează clientul'} icon={finalized ? 'refresh-outline' : 'checkmark-done-outline'} loading={loading} onPress={() => void submit()} style={styles.lifecycleModalButton} /></View>
        </Card>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }, avatar: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' }, profileInfo: { flex: 1, minWidth: 220, gap: 3 }, nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, tabScroller: { flexGrow: 0, borderBottomWidth: 1 }, tabs: { flexDirection: 'row' }, tab: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' }, detailCard: { gap: spacing.lg }, detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }, detailRow: { minWidth: 220, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, smallIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  lifecycle: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }, lifecycleIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, lifecycleCopy: { flex: 1, minWidth: 210, gap: 3 }, lifecycleOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }, lifecycleModal: { width: '100%', maxWidth: 480, padding: spacing.xxl, gap: spacing.lg }, lifecycleModalIcon: { width: 62, height: 62, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' }, lifecycleModalCopy: { gap: spacing.sm }, lifecycleModalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, lifecycleModalButton: { flexGrow: 1, flexBasis: 180 },
});
