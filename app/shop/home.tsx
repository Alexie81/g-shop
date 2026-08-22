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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

const money = (value: number) => new Intl.NumberFormat('ro-RO', {
  style: 'currency',
  currency: 'RON',
  minimumFractionDigits: 2,
}).format(value);

export default function ShopHomeScreen() {
  const { activeProperty } = useProperty();
  const { hasPermission } = useAuth();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < 650;
  const canView = hasPermission('sales_sheets.view');
  const canViewFinancials = hasPermission('financials.view');
  const state = useAsyncData<Paginated<SalesSheet>>(
    () => canView && activeProperty
      ? salesSheetRepository.list(activeProperty.id)
      : Promise.resolve({ data: [], page: 1, pageSize: 0, total: 0, totalPages: 1 }),
    [activeProperty?.id, canView],
  );
  const sheets = state.data?.data ?? [];
  const salesTotal = sheets.reduce((sum, item) => sum + item.totalPrice, 0);
  const collected = sheets.reduce((sum, item) => sum + item.receivedAmount, 0);
  const remaining = sheets.reduce((sum, item) => sum + item.remainingDue, 0);
  const totalReceivables = collected + remaining;
  const expenses = sheets.reduce((sum, item) => sum + (item.expenseTotal ?? 0), 0);
  const gshopNet = sheets.reduce(
    (sum, item) => sum + (item.gshopNet ?? item.totalPrice - (item.expenseTotal ?? 0)),
    0,
  );

  return <Screen header={<AppHeader title="Shop" />}>
    <View style={styles.stack}>
      <LinearGradient
        colors={isDark ? ['#09265A', '#075CFF'] : ['#123EA9', '#0A7DFF']}
        style={[styles.hero, compact && styles.heroCompact]}
      >
        <View style={styles.heroContent}>
          <View style={[styles.heroIcon, compact && styles.heroIconCompact]}>
            <Ionicons name="storefront-outline" size={compact ? 26 : 30} color="#FFFFFF" />
          </View>
          <View style={styles.copy}>
            <AppText variant={compact ? 'title' : 'display'} style={styles.white}>Vânzări G-Shop</AppText>
            <AppText variant={compact ? 'caption' : 'body'} style={styles.subtitle}>
              Fișe de vânzări clare, semnate electronic și emise direct în PDF.
            </AppText>
          </View>
        </View>
        {hasPermission('sales_sheets.create') ? <Button
          compact={compact}
          label="Vânzare nouă"
          icon="add-circle-outline"
          onPress={() => router.push('/shop/sales-sheets/new' as never)}
          style={compact ? styles.full : undefined}
        /> : null}
      </LinearGradient>

      {canView ? <View style={styles.section}>
        <View>
          <AppText variant="heading">Overview financiar</AppText>
          <AppText variant="caption" muted>Situația banilor din fișele de vânzare</AppText>
        </View>
        <View style={[styles.metrics, compact && styles.metricsCompact]}>
          {canViewFinancials ? <>
            <Metric compact={compact} icon="trending-up-outline" label="Total încasări" value={money(totalReceivables)} color={colors.primary} />
            <Metric compact={compact} icon="cash-outline" label="Bani încasați" value={money(collected)} color={palette.success} />
            <Metric compact={compact} icon="time-outline" label="Bani de încasat" value={money(remaining)} color={palette.warning} />
            <Metric compact={compact} icon="receipt-outline" label="Cheltuieli" value={money(expenses)} color={palette.danger} />
            <Metric compact={compact} wideOnCompact icon="wallet-outline" label="Rămâne G-Shop" value={money(gshopNet)} color={gshopNet >= 0 ? colors.primary : palette.danger} />
          </> : <>
            <Metric compact={compact} icon="receipt-outline" label="Fișe emise" value={String(state.data?.total ?? 0)} color={colors.primary} />
            <Metric compact={compact} icon="cash-outline" label="Total vânzări" value={money(salesTotal)} color={palette.success} />
            <Metric compact={compact} wideOnCompact icon="time-outline" label="De încasat" value={money(remaining)} color={palette.warning} />
          </>}
        </View>
      </View> : null}

      {canView ? <View style={styles.section}>
        <View>
          <AppText variant="heading">Acțiuni rapide</AppText>
          <AppText variant="caption" muted>Tot ce ai nevoie pentru documentele de vânzare</AppText>
        </View>
        <View style={[styles.quickGrid, compact && styles.quickGridCompact]}>
          {hasPermission('sales_sheets.create') ? <QuickAction
            compact={compact}
            title="Fișă de vânzare nouă"
            description="Completează, semnează și emite PDF-ul"
            icon="add-circle-outline"
            color={colors.primary}
            onPress={() => router.push('/shop/sales-sheets/new' as never)}
          /> : null}
          <QuickAction
            compact={compact}
            title="Fișe de vânzări"
            description="Vezi documentele emise și restul de încasat"
            icon="documents-outline"
            color={palette.purple}
            onPress={() => router.push('/shop/sales-sheets' as never)}
          />
        </View>
      </View> : null}
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
  return <Card style={[
    styles.metric,
    compact && styles.metricCompact,
    compact && wideOnCompact && styles.metricCompactWide,
  ]}>
    <View style={[styles.metricIcon, { backgroundColor: `${color}16` }]}>
      <Ionicons name={icon} size={19} color={color} />
    </View>
    <View style={styles.metricCopy}>
      <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{value}</AppText>
      <AppText variant="caption" muted>{label}</AppText>
    </View>
  </Card>;
}

function QuickAction({ compact, title, description, icon, color, onPress }: {
  compact: boolean;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={({ pressed }) => [
      styles.quickCard,
      compact && styles.quickCardCompact,
      {
        backgroundColor: colors.surface,
        borderColor: `${color}55`,
        shadowColor: colors.shadow,
        shadowOpacity: isDark ? 0.12 : 0.08,
        opacity: pressed ? 0.78 : 1,
      },
    ]}
  >
    <View style={[styles.quickIcon, { backgroundColor: `${color}18` }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <View style={styles.copy}>
      <AppText variant="label">{title}</AppText>
      <AppText variant="caption" muted numberOfLines={1}>{description}</AppText>
    </View>
    <View style={[styles.quickArrow, { backgroundColor: colors.surfaceMuted }]}>
      <Ionicons name="arrow-forward" size={17} color={color} />
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  stack: {
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
    gap: spacing.md,
  },
  hero: {
    minHeight: 132,
    padding: spacing.lg,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    overflow: 'hidden',
  },
  heroCompact: {
    minHeight: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.md,
  },
  heroContent: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconCompact: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
  },
  copy: {
    minWidth: 0,
    flex: 1,
  },
  white: {
    color: '#FFFFFF',
  },
  subtitle: {
    color: '#DDE9FF',
  },
  full: {
    width: '100%',
  },
  section: {
    gap: spacing.sm,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricsCompact: {
    flexWrap: 'wrap',
  },
  metric: {
    minWidth: 180,
    flex: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  metricCompact: {
    minWidth: 0,
    flex: 0,
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 106,
    justifyContent: 'space-between',
  },
  metricCompactWide: {
    flexBasis: '100%',
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCopy: {
    minWidth: 0,
    flex: 1,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickGridCompact: {
    flexDirection: 'column',
  },
  quickCard: {
    minWidth: 260,
    minHeight: 84,
    flex: 1,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 2,
  },
  quickCardCompact: {
    minWidth: 0,
    width: '100%',
    minHeight: 72,
    flex: 0,
    paddingVertical: spacing.sm,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickArrow: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
