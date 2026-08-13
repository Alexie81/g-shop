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

  if (!hasPermission('sales_sheets.view')) return <Redirect href="/shop/home" />;
  return <Screen header={<AppHeader title="Fișe de vânzări" />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <View style={styles.stack}>
      <LinearGradient colors={isDark ? ['#0E2A60', '#075CFF'] : ['#1246B8', '#087BFF']} style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroIcon}><Ionicons name="receipt-outline" size={31} color="#FFFFFF" /></View>
        <View style={styles.heroCopy}><AppText variant="title" style={styles.white}>Fișe de vânzări</AppText><AppText style={styles.heroText}>Emiți documentul, îl semnează clientul și deschizi PDF-ul dintr-un singur loc.</AppText></View>
        {hasPermission('sales_sheets.create') ? <Button label="Fișă nouă" icon="add-circle-outline" onPress={() => router.push('/shop/sales-sheets/new' as never)} style={compact ? styles.fullButton : undefined} /> : null}
      </LinearGradient>

      <View style={[styles.metrics, compact && styles.metricsCompact]}>
        <Metric icon="documents-outline" label="Fișe emise" value={String(state.data?.total ?? 0)} color={colors.primary} />
        <Metric icon="cash-outline" label="Total vânzări" value={money(total, 'RON')} color={palette.success} />
        <Metric icon="time-outline" label="Rest de încasat" value={money(remaining, 'RON')} color={remaining > 0 ? palette.warning : palette.success} />
      </View>

      <Input label="Caută rapid" icon="search-outline" value={query} onChangeText={setQuery} placeholder="Număr, client, telefon sau produs" />

      {state.loading ? <LoadingState rows={5} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : sheets.length ? <View style={styles.list}>{sheets.map((sheet) => <Pressable key={sheet.id} accessibilityRole="button" onPress={() => router.push(`/shop/sales-sheets/${sheet.id}` as never)} style={({ pressed }) => [styles.sheetCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
        <View style={[styles.sheetIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={24} color={colors.primary} /></View>
        <View style={styles.sheetCopy}>
          <View style={styles.sheetTop}><AppText variant="heading" numberOfLines={1}>{sheet.number}</AppText><View style={[styles.emitted, { backgroundColor: `${palette.success}16` }]}><Ionicons name="checkmark-circle" size={14} color={palette.success} /><AppText variant="caption" style={{ color: palette.success, fontWeight: '900' }}>DOCUMENT EMIS</AppText></View></View>
          <AppText variant="label" numberOfLines={1}>{sheet.customerName} · {sheet.productName}</AppText>
          <View style={styles.meta}><AppText variant="caption" muted>{formatDate(sheet.documentAt, true)}</AppText><AppText variant="caption" style={{ color: colors.primary, fontWeight: '900' }}>{money(sheet.totalPrice, sheet.currencyCode)}</AppText></View>
        </View>
        <Ionicons name="chevron-forward" size={21} color={colors.textMuted} />
      </Pressable>)}</View> : <Card style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="receipt-outline" size={30} color={colors.primary} /></View><AppText variant="heading">Nu există fișe de vânzări</AppText><AppText muted style={styles.center}>Prima fișă se completează în câțiva pași și este emisă imediat în format PDF.</AppText>{hasPermission('sales_sheets.create') ? <Button label="Creează prima fișă" icon="add-circle-outline" onPress={() => router.push('/shop/sales-sheets/new' as never)} /> : null}</Card>}
    </View>
  </Screen>;
}

function Metric({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) { const { colors } = useAppTheme(); return <Card style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={21} color={color} /></View><AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{ color: colors.text }}>{value}</AppText><AppText variant="caption" muted>{label}</AppText></Card>; }

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: spacing.lg }, hero: { padding: spacing.xl, minHeight: 132, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, overflow: 'hidden' }, heroCompact: { flexDirection: 'column', alignItems: 'stretch' }, heroIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }, heroCopy: { minWidth: 0, flex: 1, gap: spacing.xs }, white: { color: '#FFFFFF' }, heroText: { color: '#DDE9FF' }, fullButton: { width: '100%' },
  metrics: { flexDirection: 'row', gap: spacing.md }, metricsCompact: { flexDirection: 'column' }, metric: { minWidth: 180, flex: 1, gap: spacing.xs }, metricIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs }, list: { gap: spacing.sm },
  sheetCard: { minHeight: 96, padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, sheetIcon: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, sheetCopy: { minWidth: 0, flex: 1, gap: 4 }, sheetTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, emitted: { minHeight: 25, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 }, meta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.md }, emptyIcon: { width: 66, height: 66, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, center: { textAlign: 'center', maxWidth: 440 },
});
