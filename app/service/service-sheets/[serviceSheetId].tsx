import { AppHeader } from '@/components/layout/AppHeader';
import { ServiceSheetStatus, SERVICE_STATUS_LABELS } from '@/components/service-sheets/ServiceSheetStatus';
import { ServiceDocumentsPanel } from '@/components/service-sheets/ServiceDocumentsPanel';
import { SignatureModal } from '@/components/service-sheets/SignatureModal';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { clientRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { ClientFinancialOverview, ServiceDocumentType, ServiceSheet, ServiceSheetStatus as Status } from '@/types';
import { formatFinanceMoney } from '@/utils/client-finance';
import { formatDate, normalizePhoneForWhatsApp } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

const statusOrder: Status[] = ['NEW', 'WAITING', 'VERIFYING', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'DELIVERED'];
const selectableStatuses: Status[] = [...statusOrder, 'CANCELLED'];

export default function ServiceSheetDetails() {
  const { serviceSheetId, document } = useLocalSearchParams<{ serviceSheetId: string; document?: string }>();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [signing, setSigning] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pdfAction, setPdfAction] = useState<'download' | 'whatsapp' | null>(null);
  const mobile = width < 520;
  const veryNarrow = width <= 360;
  const initialDocumentType = (['INTAKE', 'FINAL_ESTIMATE', 'EXIT', 'WARRANTY'] as ServiceDocumentType[]).includes(document as ServiceDocumentType) ? document as ServiceDocumentType : null;
  const canViewFinancials = hasPermission('financials.view');
  const canUpdate = hasPermission('service_sheets.update');
  const canSign = hasPermission('service_sheets.sign');
  const returnToServiceSheets = () => router.replace('/service/service-sheets');
  const state = useAsyncData(async () => {
    const sheet = await serviceSheetRepository.get(serviceSheetId);
    const financials = canViewFinancials
      ? await clientRepository.getFinancials(sheet.clientId).catch(() => null)
      : null;
    return { sheet, financials };
  }, [canViewFinancials, serviceSheetId]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  const header = <AppHeader title="Fișă service" back onBack={returnToServiceSheets} />;
  if (state.loading) return <Screen header={header}><LoadingState rows={5} /></Screen>;
  if (state.error || !state.data) return <Screen header={header}><ErrorState message={state.error?.message ?? 'Fișa nu există.'} onRetry={() => void state.reload()} /></Screen>;

  const { sheet, financials } = state.data;
  const signatureVersion = sheet.signedAt ?? sheet.updatedAt;
  const signaturePreviewUrl = sheet.signatureUrl && signatureVersion && !/[?&]v=/.test(sheet.signatureUrl)
    ? `${sheet.signatureUrl}${sheet.signatureUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(signatureVersion)}`
    : sheet.signatureUrl;
  const currencyCode = sheet.currencyCode ?? financials?.financials.currencyCode ?? 'RON';
  const formatCurrency = (value: number) => formatFinanceMoney(value, currencyCode);
  const currentStatusIndex = statusOrder.indexOf(sheet.status);

  const openFreshPdf = async (action: 'download' | 'whatsapp') => {
    if (pdfAction) return;
    if (action === 'whatsapp' && !normalizePhoneForWhatsApp(sheet.client?.phone ?? '')) return showToast('Clientul nu are un număr de telefon valid pentru WhatsApp.', 'error');
    setPdfAction(action);
    try {
      const generated = await serviceSheetRepository.generatePdf(sheet.id);
      if (action === 'download') {
        await Linking.openURL(generated.url);
        showToast('Fișa PDF a fost generată din datele curente.', 'success');
        return;
      }
      const phone = normalizePhoneForWhatsApp(sheet.client?.phone ?? '');
      const message = `Bună ziua! Vă trimitem fișa de service ${sheet.number}, generată din datele actualizate: ${generated.url}`;
      await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Fișa PDF nu a putut fi generată.', 'error');
    } finally {
      setPdfAction(null);
    }
  };

  const replaceSheet = (next: ServiceSheet) => state.setData((current) => current ? { ...current, sheet: next } : current);
  const changeStatus = async (status: Status) => {
    try {
      const updated = await serviceSheetRepository.update(sheet.id, {
        status,
        completedAt: status === 'COMPLETED' ? new Date().toISOString() : sheet.completedAt,
      });
      replaceSheet(updated);
      setStatusOpen(false);
      showToast(`Status schimbat în „${SERVICE_STATUS_LABELS[status]}”.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Statusul nu a putut fi actualizat.', 'error');
    }
  };

  const equipmentName = [sheet.equipment, sheet.brand, sheet.model].filter(Boolean).join(' · ');
  const clientName = sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName}` : 'Client';

  return <Screen
    header={<AppHeader title={sheet.number} back onBack={returnToServiceSheets} />}
    refreshing={state.refreshing}
    onRefresh={() => void state.reload(true)}
    style={[styles.screen, mobile && styles.screenMobile]}
  >
    <Card style={[styles.hero, mobile && styles.cardMobile]} elevated>
      <View style={styles.heroMain}>
        <View style={[styles.heroIcon, { backgroundColor: isDark ? `${colors.primary}26` : colors.primarySoft }]}>
          <Ionicons name="document-text-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.heroCopy}>
          <AppText variant="caption" muted numberOfLines={1}>{sheet.number}</AppText>
          <AppText variant="heading" numberOfLines={2}>{equipmentName}</AppText>
          <View style={styles.clientLine}>
            <Ionicons name="person-outline" size={15} color={colors.textMuted} />
            <AppText variant="caption" muted numberOfLines={1} style={styles.clientText}>{clientName}{sheet.client?.phone ? ` · ${sheet.client.phone}` : ''}</AppText>
          </View>
        </View>
      </View>
      <View style={[styles.heroSummary, { backgroundColor: colors.surfaceMuted }]}>
        <ServiceSheetStatus status={sheet.status} />
        {canViewFinancials ? <View style={styles.total}>
          <AppText variant="caption" muted>Total fișă</AppText>
          <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color: colors.primary }}>{formatCurrency(sheet.totalCost)}</AppText>
        </View> : null}
      </View>
    </Card>

    <View style={styles.actions}>
      {canUpdate ? <SheetAction mobile={mobile} icon="create-outline" label="Editează" color={colors.primary} onPress={() => router.push(('/service/service-sheets/' + sheet.id + '/edit') as never)} /> : null}
      {canUpdate ? <SheetAction mobile={mobile} icon="swap-horizontal-outline" label="Schimbă status" color={palette.warning} selected={statusOpen} onPress={() => setStatusOpen((value) => !value)} /> : null}
      {canSign ? <SheetAction mobile={mobile} icon="pencil-outline" label={sheet.signatureUrl ? 'Resemnează' : 'Semnează'} color={palette.purple} onPress={() => setSigning(true)} /> : null}
      {canUpdate ? <SheetAction mobile={mobile} icon="download-outline" label={pdfAction === 'download' ? 'Se generează…' : 'Descarcă PDF'} color={palette.cyan} loading={pdfAction === 'download'} onPress={() => void openFreshPdf('download')} /> : null}
      {canUpdate ? <SheetAction mobile={mobile} icon="logo-whatsapp" label={pdfAction === 'whatsapp' ? 'Se generează…' : 'Trimite pe WhatsApp'} color="#19B85A" loading={pdfAction === 'whatsapp'} onPress={() => void openFreshPdf('whatsapp')} /> : null}
    </View>

    <Card style={[styles.companyPreference, mobile && styles.cardMobile, { borderColor: `${colors.primary}70` }]}>
      <View style={[styles.companyPreferenceIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="business-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.companyPreferenceCopy}>
        <AppText variant="label">{sheet.companyName || 'Firma documentului'}</AppText>
        <AppText variant="caption" muted>Datele firmei au fost fixate la crearea fișei și apar automat în PDF.</AppText>
      </View>
      <Ionicons name="checkmark-circle" size={24} color={palette.success} />
    </Card>

    {statusOpen && canUpdate ? <Card style={[styles.panel, mobile && styles.cardMobile]} elevated>
      <SectionTitle icon="git-branch-outline" title="Schimbă statusul" />
      <View style={styles.statusGrid}>{selectableStatuses.map((status) => {
        const selected = status === sheet.status;
        return <Pressable
          key={status}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`Status ${SERVICE_STATUS_LABELS[status]}`}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => undefined);
            void changeStatus(status);
          }}
          style={({ pressed }) => [
            styles.statusOption,
            mobile && styles.statusOptionMobile,
            veryNarrow && styles.statusOptionVeryNarrow,
            { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border },
            pressed && styles.pressed,
          ]}
        >
          <AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.statusOptionLabel, { color: selected ? '#fff' : colors.text }]}>{SERVICE_STATUS_LABELS[status]}</AppText>
          {selected ? <Ionicons name="checkmark-circle" size={17} color="#fff" /> : null}
        </Pressable>;
      })}</View>
    </Card> : null}

    <ServiceDocumentsPanel sheet={sheet} initialEditorType={initialDocumentType} style={mobile && styles.cardMobile} onGenerated={() => state.reload(true)} />

    {financials ? <FinanceSummary overview={financials} mobile={mobile} onOpenClient={() => router.push(`/service/clients/${sheet.clientId}`)} /> : null}

    <View style={[styles.columns, mobile && styles.columnsMobile]}>
      <Card style={[styles.panel, mobile && styles.cardMobile]}>
        <SectionTitle icon="construct-outline" title="Problemă și lucrare" />
        <View style={styles.compactDetails}>
          <DataRow label="Serie" value={sheet.serialNumber} />
          <DataRow label="Accesorii" value={sheet.accessories} />
        </View>
        <Narrative icon="alert-circle-outline" label="Problemă declarată" value={sheet.reportedIssue} />
        <Narrative icon="search-outline" label="Constatare" value={sheet.technicalAssessment} />
        <Narrative icon="checkmark-done-outline" label="Lucrări efectuate" value={sheet.workPerformed} />
        <Narrative icon="hardware-chip-outline" label="Piese folosite" value={sheet.partsUsed} />
      </Card>

      <Card style={[styles.panel, mobile && styles.cardMobile]}>
        <SectionTitle icon="cash-outline" title="Valori și termene" />
        {canViewFinancials ? <View style={styles.moneyGrid}>
          <MoneyMetric label="Piese" value={formatCurrency(sheet.partsCost)} color={palette.cyan} />
          <MoneyMetric label="Manoperă" value={formatCurrency(sheet.laborCost)} color={palette.purple} />
          <MoneyMetric label="Total fișă" value={formatCurrency(sheet.totalCost)} color={colors.primary} />
          <MoneyMetric label="Cost intern" value={formatCurrency(sheet.directCosts)} color={palette.warning} />
          <MoneyMetric label="Net intern" value={formatCurrency(sheet.netValue)} color={sheet.netValue >= 0 ? palette.success : palette.danger} />
          <MoneyMetric label="Comision" value={formatCurrency(sheet.collaboratorCommission ?? 0)} color={palette.cyan} />
        </View> : null}
        <View style={styles.compactDetails}>
          <DataRow label="Data primirii" value={formatDate(sheet.receivedAt, true)} />
          <DataRow label="Termen estimat" value={sheet.estimatedAt ? formatDate(sheet.estimatedAt) : undefined} />
        </View>
      </Card>
    </View>

    <Card style={[styles.panel, mobile && styles.cardMobile]}>
      <SectionTitle icon="time-outline" title="Evoluția fișei" />
      {sheet.status === 'CANCELLED' ? <View style={[styles.cancelledStatus, { backgroundColor: isDark ? `${palette.danger}18` : palette.dangerSoft, borderColor: `${palette.danger}45` }]}><Ionicons name="close-circle-outline" size={22} color={palette.danger} /><View style={styles.cancelledCopy}><AppText variant="label" style={{ color: palette.danger }}>Anulată</AppText><AppText variant="caption" muted>Status actual</AppText></View></View> : <View style={[styles.timeline, mobile && styles.timelineMobile]}>{statusOrder.map((status, index) => {
        const done = index <= currentStatusIndex && currentStatusIndex >= 0;
        const active = status === sheet.status;
        return <View key={status} style={[styles.step, mobile && styles.stepMobile]}>
          <View style={[styles.rail, mobile && styles.railMobile]}>
            <View style={[styles.dot, { backgroundColor: done ? palette.electric : colors.surfaceMuted, borderColor: done ? palette.electric : colors.border }]}>{done ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}</View>
            {index < statusOrder.length - 1 ? <View style={[styles.line, mobile && styles.lineMobile, { backgroundColor: index < currentStatusIndex ? palette.electric : colors.border }]} /> : null}
          </View>
          <View style={[styles.stepCopy, mobile && styles.stepCopyMobile]}>
            <AppText variant="caption" style={{ color: done ? colors.text : colors.textMuted, fontWeight: done ? '800' : '500' }}>{SERVICE_STATUS_LABELS[status]}</AppText>
            {active ? <AppText variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>Status actual</AppText> : null}
          </View>
        </View>;
      })}</View>}
    </Card>

    <Card style={[styles.panel, mobile && styles.cardMobile]}>
      <SectionTitle icon="pencil-outline" title="Semnătura clientului" />
      {signaturePreviewUrl ? <>
        <Image key={signaturePreviewUrl} source={{ uri: signaturePreviewUrl }} resizeMode="contain" style={[styles.signature, veryNarrow && styles.signatureNarrow, { backgroundColor: colors.surfaceMuted, tintColor: colors.text }]} />
        <View style={styles.signatureFooter}>
          <View style={styles.signedCopy}>
            <Ionicons name="checkmark-circle" size={18} color={palette.success} />
            <AppText variant="caption" muted style={styles.clientText}>Semnat la {formatDate(sheet.signedAt, true)}</AppText>
          </View>
          {canSign ? <Button compact variant="outline" label="Resemnează" icon="pencil-outline" onPress={() => setSigning(true)} style={styles.touchButton} /> : null}
        </View>
      </> : <View style={[styles.noSignature, mobile && styles.noSignatureMobile, { backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.noSignatureIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="pencil-outline" size={23} color={colors.primary} /></View>
        <View style={styles.noSignatureCopy}>
          <AppText variant="label">Nesemnată</AppText>
          <AppText variant="caption" muted>Clientul poate semna direct pe telefon.</AppText>
        </View>
        {canSign ? <Button compact label="Semnează" icon="pencil" onPress={() => setSigning(true)} style={[styles.touchButton, mobile && styles.signatureButtonMobile]} /> : null}
      </View>}
    </Card>

    {canSign ? <SignatureModal sheet={sheet} visible={signing} onClose={() => setSigning(false)} onSaved={replaceSheet} /> : null}
  </Screen>;
}

function SheetAction({ mobile, icon, label, color, selected = false, loading = false, onPress }: { mobile: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; color: string; selected?: boolean; loading?: boolean; onPress: () => void }) {
  const { colors, isDark } = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    disabled={loading}
    onPress={() => {
      void Haptics.selectionAsync().catch(() => undefined);
      onPress();
    }}
    style={({ pressed }) => [
      styles.quickAction,
      mobile && styles.quickActionMobile,
      { backgroundColor: selected ? `${color}${isDark ? '32' : '14'}` : colors.surface, borderColor: selected || pressed ? `${color}80` : colors.border },
      pressed && styles.pressed,
    ]}
  >
    <View style={[styles.quickActionIcon, { backgroundColor: isDark ? `${color}28` : `${color}14` }]}><Ionicons name={loading ? 'hourglass-outline' : icon} size={21} color={color} /></View>
    <AppText variant="label" numberOfLines={2} style={styles.quickActionLabel}>{label}</AppText>
  </Pressable>;
}

function FinanceSummary({ overview, mobile, onOpenClient }: { overview: ClientFinancialOverview; mobile: boolean; onOpenClient: () => void }) {
  const { colors, isDark } = useAppTheme();
  const { financials, summary } = overview;
  const currency = financials.currencyCode || 'RON';
  const money = (value: number) => formatFinanceMoney(value, currency);
  const paid = financials.paymentStatus === 'PAID';

  return <Card style={[styles.panel, mobile && styles.cardMobile]} elevated>
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: isDark ? `${colors.primary}26` : colors.primarySoft }]}><Ionicons name="wallet-outline" size={20} color={colors.primary} /></View>
      <View style={styles.sectionCopy}>
        <AppText variant="heading" numberOfLines={1}>Finanțe</AppText>
        {!mobile ? <AppText variant="caption" muted>Valorile actuale ale clientului</AppText> : null}
      </View>
      <View style={[styles.paymentBadge, { backgroundColor: paid ? (isDark ? `${palette.success}24` : palette.successSoft) : `${palette.warning}${isDark ? '24' : '18'}` }]}>
        <Ionicons name={paid ? 'checkmark-circle' : 'time'} size={15} color={paid ? palette.success : palette.warning} />
        <AppText variant="caption" style={{ color: paid ? palette.success : palette.warning, fontWeight: '800' }}>{paid ? 'Achitat' : 'Neachitat'}</AppText>
      </View>
    </View>
    <View style={styles.moneyGrid}>
      <MoneyMetric label="Total" value={money(summary.totalDue)} color={colors.primary} />
      <MoneyMetric label="Încasat" value={money(summary.receivedAmount)} color={palette.success} />
      <MoneyMetric label="Rest" value={money(summary.remainingDue)} color={summary.remainingDue > 0 ? palette.warning : palette.success} />
      <MoneyMetric label="G-Shop Net" value={money(summary.gshopNet)} color={summary.gshopNet >= 0 ? palette.purple : palette.danger} />
    </View>
    <Button compact variant="outline" label="Deschide clientul" icon="person-outline" onPress={onOpenClient} style={[styles.touchButton, mobile && styles.fullWidthButton]} />
  </Card>;
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const { colors, isDark } = useAppTheme();
  return <View style={styles.sectionHeader}>
    <View style={[styles.sectionIcon, { backgroundColor: isDark ? `${colors.primary}26` : colors.primarySoft }]}><Ionicons name={icon} size={20} color={colors.primary} /></View>
    <AppText variant="heading" style={styles.sectionCopy}>{title}</AppText>
  </View>;
}

function MoneyMetric({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors, isDark } = useAppTheme();
  return <View style={[styles.moneyMetric, { backgroundColor: isDark ? colors.surfaceMuted : '#F8FAFD', borderColor: colors.border }]}>
    <AppText variant="caption" muted numberOfLines={1}>{label}</AppText>
    <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62} style={{ color }}>{value}</AppText>
  </View>;
}

function Narrative({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string }) {
  const { colors } = useAppTheme();
  if (!value?.trim()) return null;
  return <View style={[styles.narrative, { backgroundColor: colors.surfaceMuted }]}>
    <Ionicons name={icon} size={18} color={colors.primary} />
    <View style={styles.narrativeCopy}>
      <AppText variant="caption" muted>{label}</AppText>
      <AppText>{value}</AppText>
    </View>
  </View>;
}

function DataRow({ label, value }: { label: string; value?: string }) {
  const { colors } = useAppTheme();
  if (!value?.trim()) return null;
  return <View style={[styles.dataRow, { borderBottomColor: colors.border }]}>
    <AppText variant="caption" muted style={styles.dataLabel}>{label}</AppText>
    <AppText variant="label" style={styles.dataValue}>{value}</AppText>
  </View>;
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  screenMobile: { paddingHorizontal: spacing.sm, gap: spacing.sm },
  cardMobile: { width: '100%', alignSelf: 'stretch', flex: 0, flexGrow: 0, flexShrink: 0, padding: spacing.md, gap: spacing.md },
  hero: { gap: spacing.md, overflow: 'hidden' },
  heroMain: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 48, height: 48, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, minWidth: 0, gap: 2 },
  clientLine: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  clientText: { flex: 1, minWidth: 0 },
  heroSummary: { minHeight: 54, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  total: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  companyPreference: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1.5 },
  companyPreferenceIcon: { width: 44, height: 44, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  companyPreferenceCopy: { flex: 1, minWidth: 0, gap: 2 },
  quickAction: { minWidth: 0, minHeight: 66, flexGrow: 1, flexBasis: 190, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quickActionMobile: { flexBasis: '46%', minHeight: 62 },
  quickActionIcon: { width: 38, height: 38, flexShrink: 0, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  panel: { minWidth: 0, flex: 1, gap: spacing.md },
  sectionHeader: { minWidth: 0, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 40, height: 40, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1, minWidth: 0 },
  paymentBadge: { minHeight: 32, flexShrink: 0, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusOption: { minHeight: 44, minWidth: 0, flexGrow: 1, flexBasis: 170, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  statusOptionMobile: { flexBasis: '46%' },
  statusOptionVeryNarrow: { flexBasis: '100%' },
  statusOptionLabel: { flex: 1, minWidth: 0, fontWeight: '800' },
  columns: { width: '100%', alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  columnsMobile: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch', gap: spacing.sm },
  compactDetails: { gap: 0 },
  dataRow: { minWidth: 0, minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  dataLabel: { flex: 0.8 },
  dataValue: { flex: 1.2, minWidth: 0, textAlign: 'right' },
  narrative: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  narrativeCopy: { flex: 1, minWidth: 0, gap: 3 },
  moneyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  moneyMetric: { minWidth: 0, minHeight: 68, flexGrow: 1, flexBasis: '46%', borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, justifyContent: 'center', gap: 2 },
  touchButton: { minHeight: 44 },
  fullWidthButton: { width: '100%', alignSelf: 'stretch' },
  timeline: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelledStatus: { minHeight: 54, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cancelledCopy: { flex: 1, minWidth: 0, gap: 1 },
  timelineMobile: { flexDirection: 'column' },
  step: { minWidth: 74, flex: 1, alignItems: 'center', gap: spacing.sm },
  stepMobile: { width: '100%', minWidth: 0, minHeight: 54, flexGrow: 0, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rail: { width: '100%', flexDirection: 'row', alignItems: 'center' },
  railMobile: { width: 28, alignSelf: 'stretch', flexDirection: 'column' },
  dot: { width: 28, height: 28, flexShrink: 0, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  line: { height: 3, flex: 1 },
  lineMobile: { width: 2, minHeight: 26, height: 26, flex: 0 },
  stepCopy: { alignItems: 'center', gap: 1 },
  stepCopyMobile: { flex: 1, minWidth: 0, alignItems: 'flex-start', paddingTop: 5 },
  signature: { width: '100%', height: 160, borderRadius: radius.md },
  signatureNarrow: { height: 130 },
  signatureFooter: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  signedCopy: { flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noSignature: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noSignatureMobile: { flexWrap: 'wrap' },
  noSignatureIcon: { width: 44, height: 44, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  noSignatureCopy: { flex: 1, minWidth: 150, gap: 2 },
  signatureButtonMobile: { width: '100%', alignSelf: 'stretch' },
});
