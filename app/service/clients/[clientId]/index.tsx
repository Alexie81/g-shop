import { ClientQRPanel } from '@/components/clients/ClientQRPanel';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { clientRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { AuditLog, Client, Paginated, ServiceSheet } from '@/types';
import { formatCurrency, formatDate, fullName, initials } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

const tabs = ['Detalii', 'Fișe service', 'QR', 'Colaboratori', 'Istoric'] as const;
type Tab = typeof tabs[number];

export default function ClientDetailsScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { colors } = useAppTheme(); const { showToast } = useToast(); const [tab, setTab] = useState<Tab>('Detalii');
  const state = useAsyncData(async () => {
    let client = await clientRepository.get(clientId);
    if (!client.qr || client.qr.status === 'NOT_GENERATED') {
      try { client = await clientRepository.ensureQr(client.id); } catch { /* Keep legacy client profiles accessible if QR provisioning is unavailable. */ }
    }
    const [sheets, history] = await Promise.all([
      serviceSheetRepository.list(client.propertyId),
      apiRequest<Paginated<AuditLog>>(`/audit-logs?propertyId=${client.propertyId}&entityId=${client.id}`),
    ]);
    return { client, sheets: sheets.data.filter((item) => item.clientId === client.id), history: history.data };
  }, [clientId]);

  if (state.loading) return <Screen header={<AppHeader title="Detalii client" back />}><LoadingState rows={5} /></Screen>;
  if (state.error || !state.data) return <Screen header={<AppHeader title="Detalii client" back />}><ErrorState message={state.error?.message ?? 'Clientul nu există.'} onRetry={() => void state.reload()} /></Screen>;

  const { client, sheets, history } = state.data;
  const contact = async (url: string) => { if (await Linking.canOpenURL(url)) await Linking.openURL(url); else showToast('Acțiunea nu este disponibilă.', 'error'); };
  return <Screen header={<AppHeader title="Detalii client" back />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <Card style={styles.profile}>
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}><AppText variant="title" style={{ color: '#fff' }}>{initials(client.firstName, client.lastName)}</AppText></View>
      <View style={styles.profileInfo}><View style={styles.nameRow}><AppText variant="title">{fullName(client)}</AppText>{client.qr && client.qr.status !== 'NOT_GENERATED' ? <StatusBadge status={client.qr.status} /> : null}</View><AppText muted>{client.phone}{client.email ? ` · ${client.email}` : ''}</AppText><AppText variant="caption" muted>{client.city || 'Localitate nespecificată'} · Client din {formatDate(client.createdAt)}</AppText></View>
      <Button compact variant="outline" icon="create-outline" label="Editează" onPress={() => router.push(`/service/clients/${client.id}/edit`)} />
    </Card>
    <View style={styles.actions}><Button compact variant="secondary" icon="call-outline" label="Sună" onPress={() => void contact(`tel:${client.phone}`)} /><Button compact variant="secondary" icon="logo-whatsapp" label="WhatsApp" onPress={() => void contact(`https://wa.me/${client.phone.replace(/\D/g, '')}`)} /><Button compact variant="secondary" icon="mail-outline" label="Email" disabled={!client.email} onPress={() => void contact(`mailto:${client.email}`)} /><Button compact icon="document-text-outline" label="Creează fișă" onPress={() => router.push({ pathname: '/service/service-sheets/create', params: { clientId: client.id, returnTo: `/service/clients/${client.id}` } })} /></View>
    <View style={[styles.tabs, { borderBottomColor: colors.border }]}>{tabs.map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && { borderBottomColor: colors.primary }]}><AppText variant="caption" style={{ color: tab === item ? colors.primary : colors.textMuted, fontWeight: '800' }}>{item}</AppText></Pressable>)}</View>
    {tab === 'Detalii' ? <Details client={client} /> : tab === 'QR' ? <ClientQRPanel client={client} /> : tab === 'Fișe service' ? <Sheets items={sheets} clientId={client.id} /> : tab === 'Colaboratori' ? <Card style={styles.empty}><Ionicons name="people-circle-outline" size={44} color={colors.primary} /><AppText variant="heading">Colaborator atribuit</AppText><AppText muted>{client.collaboratorId ? 'Clientul are un colaborator atribuit. Comisioanele apar automat la crearea fișelor și pot fi urmărite din dashboard.' : 'Nu există un colaborator atribuit acestui client.'}</AppText><Button compact label={client.collaboratorId ? 'Modifică atribuirea' : 'Atribuie colaborator'} icon="person-add-outline" onPress={() => router.push(`/service/clients/${client.id}/edit`)} /></Card> : <History items={history} />}
  </Screen>;
}

function Details({ client }: { client: Client }) {
  const rows = [
    ['Telefon', client.phone, 'call-outline'], ['Telefon secundar', client.secondaryPhone, 'phone-portrait-outline'], ['Email', client.email, 'mail-outline'],
    ['Adresă', client.address, 'location-outline'], ['Oraș', client.city, 'business-outline'], ['Județ / sector', client.county, 'map-outline'], ['Cod poștal', client.postalCode, 'mail-open-outline'],
  ] as const;
  return <><Card style={styles.detailCard}><AppText variant="heading">Informații client</AppText><View style={styles.detailGrid}>{rows.map(([label, value, icon]) => <View key={label} style={styles.detailRow}><View style={styles.smallIcon}><Ionicons name={icon} size={17} color={palette.electric} /></View><View style={{ flex: 1 }}><AppText variant="caption" muted>{label}</AppText><AppText variant="label">{value || '—'}</AppText></View></View>)}</View></Card><Card style={styles.detailCard}><AppText variant="heading">Observații</AppText><AppText muted>{client.notes || 'Nu există observații pentru acest client.'}</AppText></Card></>;
}

function Sheets({ items, clientId }: { items: ServiceSheet[]; clientId: string }) {
  const { colors } = useAppTheme();
  return <Card style={styles.detailCard}><View style={styles.sectionHeading}><AppText variant="heading">Fișe de service</AppText><Button compact label="Fișă nouă" icon="add" onPress={() => router.push({ pathname: '/service/service-sheets/create', params: { clientId, returnTo: `/service/clients/${clientId}` } })} /></View>{items.length ? items.map((item) => <Pressable key={item.id} onPress={() => router.push(`/service/service-sheets/${item.id}`)} style={[styles.listRow, { borderBottomColor: colors.border }]}><View style={{ flex: 1 }}><AppText variant="label">{item.number} · {item.equipment}</AppText><AppText variant="caption" muted>{item.reportedIssue} · {formatDate(item.receivedAt)}</AppText></View><AppText variant="label" style={{ color: colors.primary }}>{formatCurrency(item.totalCost)}</AppText><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>) : <AppText muted>Nu există fișe de service.</AppText>}</Card>;
}

function History({ items }: { items: AuditLog[] }) {
  return <Card style={styles.detailCard}><AppText variant="heading">Istoric complet</AppText>{items.length ? items.map((item, index) => <View key={item.id} style={styles.timeline}><View style={styles.timelineRail}><View style={[styles.timelineDot, { backgroundColor: palette.electric }]} />{index < items.length - 1 ? <View style={styles.line} /> : null}</View><View style={styles.timelineCopy}><AppText variant="label">{item.summary}</AppText><AppText variant="caption" muted>{item.userName || 'Sistem'} · {formatDate(item.createdAt, true)}</AppText></View></View>) : <AppText muted>Nu există acțiuni înregistrate.</AppText>}</Card>;
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }, avatar: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' }, profileInfo: { flex: 1, minWidth: 220, gap: 3 }, nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, tabs: { flexDirection: 'row', overflow: 'hidden', borderBottomWidth: 1 }, tab: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' }, detailCard: { gap: spacing.lg }, detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }, detailRow: { minWidth: 220, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, smallIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.md }, sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth }, timeline: { flexDirection: 'row', gap: spacing.md }, timelineRail: { width: 18, alignItems: 'center' }, timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 }, line: { flex: 1, width: 2, backgroundColor: '#CBD5E1', marginVertical: 4 }, timelineCopy: { flex: 1, paddingBottom: spacing.lg },
});
