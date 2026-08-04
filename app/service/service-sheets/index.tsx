import { AppHeader } from '@/components/layout/AppHeader';
import { ServiceSheetActionsModal } from '@/components/service-sheets/ServiceSheetActionsModal';
import { ServiceSheetStatus } from '@/components/service-sheets/ServiceSheetStatus';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { serviceSheetRepository } from '@/repositories/api-repositories';
import { radius, spacing } from '@/theme/tokens';
import { ServiceSheet } from '@/types';
import { formatFinanceMoney } from '@/utils/client-finance';
import { formatDate, normalizePhoneForWhatsApp } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

export default function ServiceSheetsScreen() {
  const { hasPermission } = useAuth();
  const { activeProperty } = useProperty();
  const { colors } = useAppTheme();
  const { showToast } = useToast();
  const [selectedSheet, setSelectedSheet] = useState<ServiceSheet | null>(null);
  const lastLongPressAt = useRef(0);
  const canUpdate = hasPermission('service_sheets.update');
  const canViewFinancials = hasPermission('financials.view');
  const state = useAsyncData(() => serviceSheetRepository.list(activeProperty?.id ?? ''), [activeProperty?.id]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);
  const sheets = (state.data?.data ?? []).filter((sheet, index, items) => items.findIndex((item) => item.clientId === sheet.clientId) === index);

  const openSheet = (sheet: ServiceSheet) => router.push(`/service/service-sheets/${sheet.id}`);
  const editSheet = (sheet: ServiceSheet) => router.push(`/service/service-sheets/${sheet.id}/edit`);
  const sendSheet = async (sheet: ServiceSheet) => {
    const phone = normalizePhoneForWhatsApp(sheet.client?.phone ?? '');
    if (!phone) return showToast('Clientul nu are un număr de telefon valid pentru WhatsApp.', 'error');
    try {
      const generated = await serviceSheetRepository.generatePdf(sheet.id);
      const message = `Bună ziua! Vă trimitem fișa de service ${sheet.number}, generată din datele actualizate: ${generated.url}`;
      await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
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

  const countLabel = sheets.length === 1 ? '1 fișă pentru 1 client' : `${sheets.length} fișe pentru ${sheets.length} clienți`;

  return <Screen header={<AppHeader title="Fișe de service" />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <View style={styles.heading}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText variant="title">Fișe de service</AppText>
          <AppText muted>{countLabel} în proprietatea activă</AppText>
        </View>
        <View style={[styles.countBadge, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="documents-outline" size={19} color={colors.primary} />
          <AppText variant="label" style={{ color: colors.primary }}>{sheets.length}</AppText>
        </View>
      </View>
      <View style={[styles.hint, { backgroundColor: colors.surfaceMuted }]}>
        <Ionicons name="hand-left-outline" size={18} color={colors.primary} />
        <AppText variant="caption" muted style={styles.hintCopy}>Atinge pentru deschidere. Ține apăsat sau folosește meniul pentru toate acțiunile.</AppText>
      </View>
    </View>

    {state.loading ? <LoadingState rows={5} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !sheets.length ? <EmptyState
      icon="document-text-outline"
      title="Nicio fișă de service"
      message="Fișa de service se creează exclusiv din profilul clientului."
    /> : <View style={styles.list}>{sheets.map((sheet) => {
      const clientName = sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName}` : 'Client nespecificat';
      const equipment = [sheet.equipment, sheet.brand, sheet.model].filter(Boolean).join(' · ') || 'Echipament nespecificat';

      return <View key={sheet.id} style={styles.cardFrame}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${sheet.number}, ${clientName}`}
          accessibilityHint="Atinge pentru vizualizare sau ține apăsat pentru toate acțiunile."
          delayLongPress={450}
          onLongPress={() => {
            lastLongPressAt.current = Date.now();
            setSelectedSheet(sheet);
          }}
          onPress={() => {
            if (Date.now() - lastLongPressAt.current < 800) return;
            openSheet(sheet);
          }}
          style={styles.cardPressable}
        >
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="document-text-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.cardTitle}>
                <AppText variant="caption" muted>FIȘĂ DE SERVICE</AppText>
                <AppText variant="heading" numberOfLines={1}>{sheet.number}</AppText>
              </View>
            </View>

            <View style={styles.identity}>
              <AppText variant="label" numberOfLines={1}>{clientName}</AppText>
              <View style={styles.equipmentRow}>
                <Ionicons name="hardware-chip-outline" size={16} color={colors.textMuted} />
                <AppText variant="caption" muted numberOfLines={2} style={styles.equipmentCopy}>{equipment}</AppText>
              </View>
            </View>

            <View style={[styles.meta, { borderTopColor: colors.border }]}>
              <View style={styles.date}>
                <Ionicons name="calendar-clear-outline" size={16} color={colors.textMuted} />
                <AppText variant="caption" muted>{formatDate(sheet.receivedAt)}</AppText>
              </View>
              <ServiceSheetStatus status={sheet.status} />
              {canViewFinancials ? <AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.value, { color: colors.primary }]}>{formatFinanceMoney(sheet.totalCost, sheet.currencyCode ?? 'RON')}</AppText> : null}
            </View>
          </Card>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Acțiuni pentru ${sheet.number}`}
          hitSlop={4}
          onPress={() => {
            lastLongPressAt.current = Date.now();
            setSelectedSheet(sheet);
          }}
          style={({ pressed }) => [styles.moreButton, { backgroundColor: pressed ? colors.primarySoft : colors.surfaceMuted }]}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      </View>;
    })}</View>}

    <ServiceSheetActionsModal
      visible={Boolean(selectedSheet)}
      sheet={selectedSheet}
      onClose={() => setSelectedSheet(null)}
      onView={openSheet}
      onEdit={canUpdate ? editSheet : undefined}
      onSend={canUpdate ? sendSheet : undefined}
      onDelete={canUpdate ? deleteSheet : undefined}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { gap: spacing.md, marginBottom: spacing.lg },
  headingRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  countBadge: { minWidth: 52, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  hint: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hintCopy: { flex: 1, minWidth: 0 },
  list: { gap: spacing.md },
  cardFrame: { position: 'relative', borderRadius: radius.lg },
  cardPressable: { minHeight: 44, borderRadius: radius.lg },
  card: { padding: spacing.md, gap: spacing.md },
  cardHeader: { minHeight: 44, paddingRight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { flex: 1, minWidth: 0, gap: 1 },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  moreButton: { position: 'absolute', zIndex: 2, top: spacing.md, right: spacing.md, width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  identity: { gap: spacing.xs },
  equipmentRow: { minHeight: 24, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  equipmentCopy: { flex: 1, minWidth: 0 },
  meta: { minHeight: 45, paddingTop: spacing.sm, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  date: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { marginLeft: 'auto', maxWidth: 126, textAlign: 'right' },
});
