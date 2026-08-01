import { AppHeader } from '@/components/layout/AppHeader';
import { ServiceSheetActionsModal } from '@/components/service-sheets/ServiceSheetActionsModal';
import { ServiceSheetStatus, SERVICE_STATUS_LABELS } from '@/components/service-sheets/ServiceSheetStatus';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { serviceSheetRepository } from '@/repositories/api-repositories';
import { spacing } from '@/theme/tokens';
import { ServiceSheet } from '@/types';
import { formatFinanceMoney } from '@/utils/client-finance';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

export default function ServiceSheetsScreen() {
  const { activeProperty } = useProperty();
  const { colors } = useAppTheme();
  const { showToast } = useToast();
  const [selectedSheet, setSelectedSheet] = useState<ServiceSheet | null>(null);
  const lastLongPressAt = useRef(0);
  const state = useAsyncData(() => serviceSheetRepository.list(activeProperty?.id ?? ''), [activeProperty?.id]);
  const sheets = (state.data?.data ?? []).filter((sheet, index, items) => items.findIndex((item) => item.clientId === sheet.clientId) === index);

  const openSheet = (sheet: ServiceSheet) => router.push(`/service/service-sheets/${sheet.id}`);
  const editSheet = (sheet: ServiceSheet) => router.push(`/service/service-sheets/${sheet.id}/edit`);
  const sendSheet = async (sheet: ServiceSheet) => {
    const clientName = sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName}` : 'Client';
    const message = [
      `Fișă de service ${sheet.number}`,
      `Client: ${clientName}`,
      `Echipament: ${[sheet.equipment, sheet.brand, sheet.model].filter(Boolean).join(' · ')}`,
      `Status: ${SERVICE_STATUS_LABELS[sheet.status]}`,
      `Valoare: ${formatFinanceMoney(sheet.totalCost, sheet.currencyCode ?? 'RON')}`,
      '',
      'Document trimis din G-Shop.',
    ].join('\n');
    try {
      await Share.share({ title: sheet.number, message });
      setSelectedSheet(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Fișa nu a putut fi trimisă.', 'error');
    }
  };
  const deleteSheet = async (sheet: ServiceSheet) => {
    try {
      await serviceSheetRepository.remove(sheet.id);
      setSelectedSheet(null);
      await state.reload(true);
      showToast('Fișa de service a fost ștearsă.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Fișa nu a putut fi ștearsă.', 'error');
      throw error;
    }
  };

  return <Screen header={<AppHeader title="Fișe de service" />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <View style={styles.heading}>
      <AppText variant="title">Fișe de service</AppText>
      <AppText muted>{sheets.length} {sheets.length === 1 ? 'client cu fișă' : 'clienți cu fișă'} în proprietatea activă</AppText>
      <AppText variant="caption" muted>O fișă pentru fiecare client. Ține apăsat pe o fișă pentru toate acțiunile.</AppText>
    </View>

    {state.loading ? <LoadingState rows={5} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !sheets.length ? <EmptyState
      icon="document-text-outline"
      title="Nicio fișă de service"
      message="Fișa de service se creează exclusiv din profilul clientului."
    /> : <View style={styles.list}>{sheets.map((sheet) => <Pressable
      key={sheet.id}
      accessibilityRole="button"
      accessibilityLabel={`${sheet.number}. Ține apăsat pentru acțiuni.`}
      delayLongPress={450}
      onLongPress={() => {
        lastLongPressAt.current = Date.now();
        setSelectedSheet(sheet);
      }}
      onPress={() => {
        if (Date.now() - lastLongPressAt.current < 800) return;
        openSheet(sheet);
      }}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={styles.card}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={23} color={colors.primary} /></View>
        <View style={styles.cardCopy}>
          <View style={styles.row}><AppText variant="heading" style={styles.number}>{sheet.number}</AppText><ServiceSheetStatus status={sheet.status} /></View>
          <AppText variant="label">{sheet.equipment}{sheet.brand ? ` · ${sheet.brand}` : ''}{sheet.model ? ` ${sheet.model}` : ''}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName}` : 'Client'} · {sheet.reportedIssue}</AppText>
          <View style={styles.row}><AppText variant="caption" muted>{formatDate(sheet.receivedAt)}</AppText><AppText variant="label" style={{ color: colors.primary }}>{formatFinanceMoney(sheet.totalCost, sheet.currencyCode ?? 'RON')}</AppText></View>
        </View>
        <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
      </Card>
    </Pressable>)}</View>}

    <ServiceSheetActionsModal
      visible={Boolean(selectedSheet)}
      sheet={selectedSheet}
      onClose={() => setSelectedSheet(null)}
      onView={openSheet}
      onEdit={editSheet}
      onSend={sendSheet}
      onDelete={deleteSheet}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  list: { gap: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  icon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  number: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
});
