import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { salesSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { Paginated, SalesSheet } from '@/types';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

const money = (value: number, currency: string) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function SalesSheetsScreen() {
  const { activeProperty } = useProperty();
  const { hasPermission } = useAuth();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const [query, setQuery] = useState('');
  const propertyId = activeProperty?.id ?? '';
  const state = useAsyncData<Paginated<SalesSheet>>(() => propertyId ? salesSheetRepository.list(propertyId) : Promise.resolve({ data: [], page: 1, pageSize: 250, total: 0, totalPages: 1 }), [propertyId]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);
  const sheets = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ro-RO');
    return (state.data?.data ?? []).filter((sheet) => !normalized || [sheet.number, sheet.customerName, sheet.customerPhone, sheet.productName, sheet.productCode].some((value) => value?.toLocaleLowerCase('ro-RO').includes(normalized)));
  }, [query, state.data?.data]);
  const total = (state.data?.data ?? []).reduce((sum, item) => sum + item.totalPrice, 0);
  const remaining = (state.data?.data ?? []).reduce((sum, item) => sum + item.remainingDue, 0);
  const collected = (state.data?.data ?? []).reduce((sum, item) => sum + item.receivedAmount, 0);
  const totalReceivables = total;
  const expenses = (state.data?.data ?? []).reduce((sum, item) => sum + (item.expenseTotal ?? 0), 0);
  const gshopNet = (state.data?.data ?? []).reduce((sum, item) => sum + (item.gshopNet ?? item.totalPrice - (item.expenseTotal ?? 0)), 0);
  const canViewFinancials = hasPermission('financials.view');

  if (!hasPermission('sales_sheets.view')) return <Redirect href="/shop/home" />;
  return <Screen header={<AppHeader title="Fișe de vânzări" />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <View style={styles.stack}>
      <LinearGradient colors={isDark ? ['#0E2A60', '#075CFF'] : ['#1246B8', '#087BFF']} style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroContent}>
          <View style={[styles.heroIcon, compact && styles.heroIconCompact]}><Ionicons name="receipt-outline" size={compact ? 25 : 29} color="#FFFFFF" /></View>
          <View style={styles.heroCopy}>
            <AppText variant={compact ? 'heading' : 'title'} style={styles.white}>Fișe de vânzări</AppText>
            <AppText variant={compact ? 'caption' : 'body'} style={styles.heroText}>Emiți documentul, îl semnează clientul și deschizi PDF-ul dintr-un singur loc.</AppText>
          </View>
        </View>
        {hasPermission('sales_sheets.create') ? <Button compact={compact} label="Fișă nouă" icon="add-circle-outline" onPress={() => router.push('/shop/sales-sheets/new' as never)} style={compact ? styles.fullButton : undefined} /> : null}
      </LinearGradient>

      <View style={[styles.metrics, compact && styles.metricsCompact]}>
        {canViewFinancials ? <>
          <Metric compact={compact} icon="trending-up-outline" label="Total încasări" value={money(totalReceivables, 'RON')} color={colors.primary} />
          <Metric compact={compact} icon="cash-outline" label="Bani încasați" value={money(collected, 'RON')} color={palette.success} />
          <Metric compact={compact} icon="time-outline" label="Bani de încasat" value={money(remaining, 'RON')} color={remaining > 0 ? palette.warning : palette.success} />
          <Metric compact={compact} icon="receipt-outline" label="Cheltuieli" value={money(expenses, 'RON')} color={palette.danger} />
          <Metric compact={compact} wideOnCompact icon="wallet-outline" label="Rămâne G-Shop" value={money(gshopNet, 'RON')} color={gshopNet >= 0 ? colors.primary : palette.danger} />
        </> : <>
          <Metric compact={compact} icon="documents-outline" label="Fișe emise" value={String(state.data?.total ?? 0)} color={colors.primary} />
          <Metric compact={compact} icon="cash-outline" label="Total vânzări" value={money(total, 'RON')} color={palette.success} />
          <Metric compact={compact} wideOnCompact icon="time-outline" label="Rest de încasat" value={money(remaining, 'RON')} color={remaining > 0 ? palette.warning : palette.success} />
        </>}
      </View>

      <Input label="Caută rapid" icon="search-outline" value={query} onChangeText={setQuery} placeholder="Număr, client, telefon sau produs" />

      {state.loading ? <LoadingState rows={5} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : sheets.length ? <View style={styles.list}>{sheets.map((sheet) => <Pressable key={sheet.id} accessibilityRole="button" android_ripple={{ color: colors.primarySoft }} onPress={() => router.push(`/shop/sales-sheets/${sheet.id}` as never)} style={({ pressed }) => [styles.sheetCard, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: isDark ? 0.12 : 0.06, opacity: pressed ? 0.82 : 1 }]}>
        <View style={[styles.sheetHeader, { backgroundColor: colors.surfaceMuted }]}>
          <View style={[styles.sheetIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={21} color={colors.primary} /></View>
          <AppText variant="heading" numberOfLines={1} style={styles.sheetNumber}>{sheet.number}</AppText>
          <View style={[styles.amountChip, { backgroundColor: colors.primarySoft }]}><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: colors.primary }}>{money(sheet.totalPrice, sheet.currencyCode)}</AppText></View>
          <View style={styles.chevron}><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></View>
        </View>
        <View style={styles.sheetBody}>
          <AppText variant="label" numberOfLines={1}>{sheet.customerName}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{sheet.productName}</AppText>
          <View style={styles.sheetBottom}>
            <View style={styles.dateRow}><Ionicons name="calendar-outline" size={13} color={colors.textMuted} /><AppText variant="caption" muted>{formatDate(sheet.documentAt, true)}</AppText></View>
            <View style={styles.statusRow}><View style={[styles.emitted, { backgroundColor: `${palette.success}16` }]}><Ionicons name="checkmark-circle" size={13} color={palette.success} /><AppText variant="caption" style={{ color: palette.success, fontWeight: '900' }}>EMIS</AppText></View><View style={[styles.emitted, { backgroundColor: `${sheet.paymentStatus === 'PAID' ? palette.success : palette.warning}16` }]}><Ionicons name={sheet.paymentStatus === 'PAID' ? 'checkmark-circle' : 'time'} size={13} color={sheet.paymentStatus === 'PAID' ? palette.success : palette.warning} /><AppText variant="caption" style={{ color: sheet.paymentStatus === 'PAID' ? palette.success : palette.warning, fontWeight: '900' }}>{sheet.paymentStatus === 'PAID' ? 'ACHITAT' : 'NEACHITAT'}</AppText></View></View>
          </View>
        </View>
      </Pressable>)}</View> : <Card style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="receipt-outline" size={30} color={colors.primary} /></View><AppText variant="heading">Nu există fișe de vânzări</AppText><AppText muted style={styles.center}>Prima fișă se completează în câțiva pași și este emisă imediat în format PDF.</AppText>{hasPermission('sales_sheets.create') ? <Button label="Creează prima fișă" icon="add-circle-outline" onPress={() => router.push('/shop/sales-sheets/new' as never)} /> : null}</Card>}
    </View>
  </Screen>;
}

function Metric({ compact, wideOnCompact = false, icon, label, value, color }: {
  compact: boolean;
  wideOnCompact?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  const { colors } = useAppTheme();
  return <Card style={[
    styles.metric,
    compact && styles.metricCompact,
    compact && wideOnCompact && styles.metricCompactWide,
  ]}>
    <View style={[styles.metricIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={19} color={color} /></View>
    <View style={styles.metricCopy}>
      <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{ color: colors.text }}>{value}</AppText>
      <AppText variant="caption" muted>{label}</AppText>
    </View>
  </Card>;
}

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: spacing.md },
  hero: { padding: spacing.lg, minHeight: 124, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, overflow: 'hidden' },
  heroCompact: { minHeight: 0, flexDirection: 'column', alignItems: 'stretch', gap: spacing.md },
  heroContent: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroIconCompact: { width: 44, height: 44, borderRadius: radius.md },
  heroCopy: { minWidth: 0, flex: 1, gap: spacing.xs }, white: { color: '#FFFFFF' }, heroText: { color: '#DDE9FF' }, fullButton: { width: '100%' },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metricsCompact: { flexWrap: 'wrap' },
  metric: { minWidth: 160, flex: 1, gap: spacing.sm, padding: spacing.md },
  metricCompact: { minWidth: 0, flex: 0, flexGrow: 1, flexBasis: '46%', minHeight: 106, justifyContent: 'space-between' },
  metricCompactWide: { flexBasis: '100%', minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  metricIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  metricCopy: { minWidth: 0, flex: 1 },
  list: { gap: spacing.sm },
  sheetCard: { minHeight: 120, padding: 0, borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', shadowOffset: { width: 0, height: 5 }, shadowRadius: 14, elevation: 2 },
  sheetHeader: { minHeight: 58, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sheetNumber: { minWidth: 0, flex: 1 },
  amountChip: { maxWidth: '42%', minHeight: 32, paddingHorizontal: spacing.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 24, height: 32, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: 3 },
  sheetBottom: { marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  emitted: { minHeight: 22, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 3 },
  empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.md }, emptyIcon: { width: 66, height: 66, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, center: { textAlign: 'center', maxWidth: 440 },
});
