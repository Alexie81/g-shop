import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { salesSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { Paginated, SalesSheet } from '@/types';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

const money = (value: number) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', minimumFractionDigits: 2 }).format(value);

export default function ShopHomeScreen() {
  const { activeProperty } = useProperty();
  const { hasPermission } = useAuth();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < 650;
  const canView = hasPermission('sales_sheets.view');
  const canViewFinancials = hasPermission('financials.view');
  const state = useAsyncData<Paginated<SalesSheet>>(() => canView && activeProperty ? salesSheetRepository.list(activeProperty.id) : Promise.resolve({ data: [], page: 1, pageSize: 0, total: 0, totalPages: 1 }), [activeProperty?.id, canView]);
  const sheets = state.data?.data ?? [];
  const total = sheets.reduce((sum, item) => sum + item.totalPrice, 0);
  const collected = sheets.reduce((sum, item) => sum + item.advancePaid, 0);
  const expenses = sheets.reduce((sum, item) => sum + (item.expenseTotal ?? 0), 0);
  const gshopNet = sheets.reduce((sum, item) => sum + (item.gshopNet ?? item.advancePaid), 0);

  return <Screen header={<AppHeader title="Shop" />}>
    <View style={styles.stack}>
      <LinearGradient colors={isDark ? ['#09265A', '#075CFF'] : ['#123EA9', '#0A7DFF']} style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroIcon}><Ionicons name="storefront-outline" size={34} color="#FFFFFF" /></View><View style={styles.copy}><AppText variant="display" style={styles.white}>Vânzări G-Shop</AppText><AppText style={styles.subtitle}>Fișe de vânzări clare, semnate electronic și emise direct în PDF.</AppText></View>
        {hasPermission('sales_sheets.create') ? <Button label="Vânzare nouă" icon="add-circle-outline" onPress={() => router.push('/shop/sales-sheets/new' as never)} style={compact ? styles.full : undefined} /> : null}
      </LinearGradient>
      {canView ? <View style={styles.quickSection}>
        <View style={styles.sectionHeading}><View><AppText variant="heading">Acțiuni rapide</AppText><AppText variant="caption" muted>Tot ce ai nevoie pentru documentele de vânzare</AppText></View></View>
        <View style={[styles.quickGrid, compact && styles.quickGridCompact]}>
          {hasPermission('sales_sheets.create') ? <QuickAction
            title="Fișă de vânzare nouă"
            description="Completează, semnează și emite PDF-ul"
            icon="add-circle-outline"
            color={colors.primary}
            onPress={() => router.push('/shop/sales-sheets/new' as never)}
          /> : null}
          <QuickAction
            title="Fișe de vânzări"
            description="Vezi documentele emise și restul de încasat"
            icon="documents-outline"
            color={palette.purple}
            onPress={() => router.push('/shop/sales-sheets' as never)}
          />
        </View>
      </View> : null}
      {canView ? <View style={[styles.metrics, compact && styles.metricsCompact]}>{canViewFinancials ? <><Metric icon="cash-outline" label="Bani încasați" value={money(collected)} color={palette.success} /><Metric icon="receipt-outline" label="Cheltuieli" value={money(expenses)} color={palette.warning} /><Metric icon="wallet-outline" label="Rămâne G-Shop" value={money(gshopNet)} color={gshopNet >= 0 ? colors.primary : palette.danger} /></> : <><Metric icon="receipt-outline" label="Fișe emise" value={String(state.data?.total ?? 0)} color={colors.primary} /><Metric icon="cash-outline" label="Total vânzări" value={money(total)} color={palette.success} /><Metric icon="time-outline" label="De încasat" value={money(sheets.reduce((sum, item) => sum + item.remainingDue, 0))} color={palette.warning} /></>}</View> : null}
      {canView ? <Card style={styles.recent}><View style={styles.recentTitle}><View><AppText variant="heading">Fișe recente</AppText><AppText variant="caption" muted>Ultimele documente emise</AppText></View><Button compact variant="outline" label="Vezi toate" icon="arrow-forward-outline" onPress={() => router.push('/shop/sales-sheets' as never)} /></View>{sheets.slice(0, 5).map((sheet) => <View key={sheet.id} style={[styles.row, { borderBottomColor: colors.border }]}><View style={[styles.rowIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={19} color={colors.primary} /></View><View style={styles.copy}><AppText variant="label" numberOfLines={1}>{sheet.number} · {sheet.customerName}</AppText><AppText variant="caption" muted numberOfLines={1}>{sheet.productName} · {formatDate(sheet.documentAt)}</AppText></View><AppText variant="label" style={{ color: colors.primary }}>{money(sheet.totalPrice)}</AppText></View>)}{!sheets.length ? <AppText muted>Nu există încă nicio fișă de vânzare.</AppText> : null}</Card> : null}
    </View>
  </Screen>;
}

function Metric({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) { return <Card style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={21} color={color} /></View><AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{value}</AppText><AppText variant="caption" muted>{label}</AppText></Card>; }

function QuickAction({ title, description, icon, color, onPress }: { title: string; description: string; icon: keyof typeof Ionicons.glyphMap; color: string; onPress: () => void }) {
  const { colors, isDark } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickCard, { backgroundColor: colors.surface, borderColor: `${color}55`, shadowColor: colors.shadow, shadowOpacity: isDark ? 0.12 : 0.08, opacity: pressed ? 0.78 : 1 }]}>
    <View style={[styles.quickIcon, { backgroundColor: `${color}18` }]}><Ionicons name={icon} size={28} color={color} /></View>
    <View style={styles.copy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>{description}</AppText></View>
    <View style={[styles.quickArrow, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="arrow-forward" size={19} color={color} /></View>
  </Pressable>;
}

const styles = StyleSheet.create({ stack: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: spacing.lg }, hero: { minHeight: 160, padding: spacing.xl, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, overflow: 'hidden' }, heroCompact: { flexDirection: 'column', alignItems: 'stretch' }, heroIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }, copy: { minWidth: 0, flex: 1 }, white: { color: '#FFFFFF' }, subtitle: { color: '#DDE9FF' }, full: { width: '100%' }, quickSection: { gap: spacing.md }, sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, quickGrid: { flexDirection: 'row', gap: spacing.md }, quickGridCompact: { flexDirection: 'column' }, quickCard: { minWidth: 260, minHeight: 108, flex: 1, padding: spacing.lg, borderWidth: 1, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 2 }, quickIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, quickArrow: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, metrics: { flexDirection: 'row', gap: spacing.md }, metricsCompact: { flexDirection: 'column' }, metric: { minWidth: 180, flex: 1, gap: spacing.xs }, metricIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, recent: { gap: spacing.md }, recentTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }, row: { minHeight: 66, paddingVertical: spacing.sm, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' } });
