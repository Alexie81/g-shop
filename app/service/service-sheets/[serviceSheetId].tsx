import { ClientFinanceOverviewCard } from '@/components/clients/finance';
import { AppHeader } from '@/components/layout/AppHeader';
import { ServiceSheetStatus, SERVICE_STATUS_LABELS } from '@/components/service-sheets/ServiceSheetStatus';
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
import { clientRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { ServiceSheet, ServiceSheetStatus as Status } from '@/types';
import { formatFinanceMoney } from '@/utils/client-finance';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

const statusOrder: Status[] = ['NEW', 'VERIFYING', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'DELIVERED'];

export default function ServiceSheetDetails() {
  const { serviceSheetId } = useLocalSearchParams<{ serviceSheetId: string }>();
  const { colors } = useAppTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [signing, setSigning] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const canViewFinancials = hasPermission('financials.view');
  const state = useAsyncData(async () => {
    const sheet = await serviceSheetRepository.get(serviceSheetId);
    const financials = canViewFinancials
      ? await clientRepository.getFinancials(sheet.clientId).catch(() => null)
      : null;
    return { sheet, financials };
  }, [canViewFinancials, serviceSheetId]);

  if (state.loading) return <Screen header={<AppHeader title="Fișă service" back />}><LoadingState rows={5} /></Screen>;
  if (state.error || !state.data) return <Screen header={<AppHeader title="Fișă service" back />}><ErrorState message={state.error?.message ?? 'Fișa nu există.'} /></Screen>;

  const { sheet, financials } = state.data;
  const currencyCode = sheet.currencyCode ?? financials?.financials.currencyCode ?? 'RON';
  const formatCurrency = (value: number) => formatFinanceMoney(value, currencyCode);

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

  return <Screen header={<AppHeader title={sheet.number} back />}>
    <Card style={styles.hero}>
      <View style={styles.heroCopy}>
        <ServiceSheetStatus status={sheet.status} />
        <AppText variant="title">{sheet.equipment}{sheet.brand ? ` · ${sheet.brand}` : ''}</AppText>
        <AppText muted>{sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName} · ${sheet.client.phone}` : 'Client'}</AppText>
      </View>
      <View style={styles.total}><AppText variant="caption" muted>Valoare afișată în fișă</AppText><AppText variant="title" style={{ color: colors.primary }}>{formatCurrency(sheet.totalCost)}</AppText></View>
    </Card>

    <View style={styles.actions}>
      <Button compact variant="outline" label="Editare" icon="create-outline" onPress={() => router.push(('/service/service-sheets/' + sheet.id + '/edit') as never)} />
      <Button compact label="Schimbă status" icon="swap-horizontal-outline" onPress={() => setStatusOpen((value) => !value)} />
      <Button compact variant={sheet.signatureUrl ? 'secondary' : 'outline'} label={sheet.signatureUrl ? 'Resemnează' : 'Semnează client'} icon="pencil-outline" onPress={() => setSigning(true)} />
      <Button compact variant="outline" label="Export PDF" icon="download-outline" onPress={() => showToast('Exportul PDF va fi generat de API după publicare.', 'info')} />
    </View>

    {statusOpen ? <Card style={styles.statuses}>
      <AppText variant="label">Alege statusul</AppText>
      <View style={styles.statusGrid}>{([...statusOrder, 'WAITING', 'CANCELLED'] as Status[]).map((status) => <Pressable key={status} onPress={() => void changeStatus(status)}><ServiceSheetStatus status={status} /></Pressable>)}</View>
    </Card> : null}

    {financials ? <ClientFinanceOverviewCard
      overview={financials}
      showInternal
      title="Situația financiară actuală a clientului"
      subtitle="Separată de valorile istorice salvate în această fișă"
      actionLabel="Deschide clientul"
      actionIcon="person-outline"
      onAction={() => router.push(`/service/clients/${sheet.clientId}`)}
    /> : null}

    <View style={styles.columns}>
      <Card style={styles.panel}>
        <AppText variant="heading">Echipament și problemă</AppText>
        <DataRow label="Echipament" value={[sheet.equipment, sheet.brand, sheet.model].filter(Boolean).join(' · ')} />
        <DataRow label="Serie" value={sheet.serialNumber} />
        <DataRow label="Accesorii" value={sheet.accessories} />
        <DataRow label="Problemă declarată" value={sheet.reportedIssue} />
        <DataRow label="Constatare" value={sheet.technicalAssessment} />
        <DataRow label="Lucrări efectuate" value={sheet.workPerformed} />
        <DataRow label="Piese" value={sheet.partsUsed} />
      </Card>
      <Card style={styles.panel}>
        <AppText variant="heading">Valorile acestei fișe</AppText>
        <DataRow label="Piese afișate" value={formatCurrency(sheet.partsCost)} />
        <DataRow label="Manoperă afișată" value={formatCurrency(sheet.laborCost)} />
        <DataRow label="Total afișat" value={formatCurrency(sheet.totalCost)} accent />
        {canViewFinancials ? <>
          <DataRow label="Cheltuieli efective totale · intern" value={formatCurrency(sheet.directCosts)} />
          <DataRow label="Valoare netă internă" value={formatCurrency(sheet.netValue)} accent />
          <DataRow label="Comision colaborator" value={formatCurrency(sheet.collaboratorCommission ?? 0)} />
        </> : null}
        <DataRow label="Data primirii" value={formatDate(sheet.receivedAt, true)} />
        <DataRow label="Termen estimat" value={formatDate(sheet.estimatedAt)} />
      </Card>
    </View>

    <Card style={styles.panel}>
      <AppText variant="heading">Timeline status</AppText>
      <View style={styles.timeline}>{statusOrder.map((status, index) => {
        const currentIndex = statusOrder.indexOf(sheet.status);
        const done = index <= currentIndex && currentIndex >= 0;
        return <View key={status} style={styles.step}>
          <View style={styles.rail}>
            <View style={[styles.dot, { backgroundColor: done ? palette.electric : colors.surfaceMuted, borderColor: done ? palette.electric : colors.border }]}>{done ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}</View>
            {index < statusOrder.length - 1 ? <View style={[styles.line, { backgroundColor: index < currentIndex ? palette.electric : colors.border }]} /> : null}
          </View>
          <AppText variant="caption" style={{ color: done ? colors.text : colors.textMuted, fontWeight: done ? '800' : '500' }}>{SERVICE_STATUS_LABELS[status]}</AppText>
        </View>;
      })}</View>
    </Card>

    <Card style={styles.panel}>
      <AppText variant="heading">Semnătura clientului</AppText>
      {sheet.signatureUrl ? <>
        <Image source={{ uri: sheet.signatureUrl }} resizeMode="contain" style={[styles.signature, { backgroundColor: colors.surfaceMuted }]} />
        <AppText variant="caption" muted>Semnat la {formatDate(sheet.signedAt, true)}</AppText>
      </> : <View style={styles.noSignature}>
        <Ionicons name="pencil-outline" size={29} color={colors.textMuted} />
        <AppText muted>Fișa nu este încă semnată electronic.</AppText>
        <Button compact label="Semnează acum" icon="pencil" onPress={() => setSigning(true)} />
      </View>}
    </Card>

    <SignatureModal sheet={sheet} visible={signing} onClose={() => setSigning(false)} onSaved={replaceSheet} />
  </Screen>;
}

function DataRow({ label, value, accent }: { label: string; value?: string; accent?: boolean }) {
  const { colors } = useAppTheme();
  return <View style={[styles.dataRow, { borderBottomColor: colors.border }]}><AppText variant="caption" muted style={styles.dataLabel}>{label}</AppText><AppText variant="label" style={[styles.dataValue, { color: accent ? palette.success : colors.text }]}>{value || '—'}</AppText></View>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xl },
  heroCopy: { flex: 1, minWidth: 220, gap: spacing.sm },
  total: { alignItems: 'flex-end' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statuses: { gap: spacing.md },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  panel: { minWidth: 290, flex: 1, gap: spacing.md },
  dataRow: { flexDirection: 'row', paddingVertical: spacing.sm, gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  dataLabel: { flex: 1 },
  dataValue: { flex: 1.5, textAlign: 'right' },
  timeline: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  step: { minWidth: 90, flex: 1, alignItems: 'center', gap: spacing.sm },
  rail: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  line: { height: 3, flex: 1 },
  signature: { width: '100%', height: 180, borderRadius: radius.md },
  noSignature: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
});
