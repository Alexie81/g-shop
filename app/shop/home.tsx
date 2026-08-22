import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
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
  const overviewCompact = width < 900;
  const actionsStacked = width < 360;
  const canView = hasPermission('sales_sheets.view');
  const canViewFinancials = hasPermission('financials.view');
  const state = useAsyncData<Paginated<SalesSheet>>(
    () => canView && activeProperty
      ? salesSheetRepository.list(activeProperty.id)
      : Promise.resolve({ data: [], page: 1, pageSize: 0, total: 0, totalPages: 1 }),
    [activeProperty?.id, canView],
  );
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);
  const sheets = state.data?.data ?? [];
  const salesTotal = sheets.reduce((sum, item) => sum + item.totalPrice, 0);
  const collected = sheets.reduce((sum, item) => sum + item.receivedAmount, 0);
  const remaining = sheets.reduce((sum, item) => sum + item.remainingDue, 0);
  const totalReceivables = salesTotal;
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
        <SectionHeading
          icon="analytics-outline"
          title="Overview financiar"
          subtitle="Situația banilor din fișele de vânzare"
          color={colors.primary}
        />
        <View style={[styles.overviewSurface, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.metrics}>
          {canViewFinancials ? <>
            <Metric compact={overviewCompact} icon="trending-up-outline" label="Total încasări" value={money(totalReceivables)} color={colors.primary} />
            <Metric compact={overviewCompact} icon="cash-outline" label="Bani încasați" value={money(collected)} color={palette.success} />
            <Metric compact={overviewCompact} icon="time-outline" label="Bani de încasat" value={money(remaining)} color={palette.warning} />
            <Metric compact={overviewCompact} icon="receipt-outline" label="Cheltuieli" value={money(expenses)} color={palette.danger} />
            <Metric compact={overviewCompact} wideOnCompact icon="wallet-outline" label="Rămâne G-Shop" value={money(gshopNet)} color={gshopNet >= 0 ? colors.primary : palette.danger} />
          </> : <>
            <Metric compact={overviewCompact} icon="receipt-outline" label="Fișe emise" value={String(state.data?.total ?? 0)} color={colors.primary} />
            <Metric compact={overviewCompact} icon="cash-outline" label="Total vânzări" value={money(salesTotal)} color={palette.success} />
            <Metric compact={overviewCompact} wideOnCompact icon="time-outline" label="De încasat" value={money(remaining)} color={palette.warning} />
          </>}
          </View>
        </View>
      </View> : null}

      {canView ? <View style={styles.section}>
        <SectionHeading
          icon="flash-outline"
          title="Acțiuni rapide"
          subtitle="Tot ce ai nevoie pentru documentele de vânzare"
          color={palette.purple}
        />
        <View style={[styles.quickGrid, actionsStacked && styles.quickGridStacked]}>
          {hasPermission('sales_sheets.create') ? <QuickAction
            compact={compact}
            stacked={actionsStacked}
            title="Fișă de vânzare nouă"
            description="Completează, semnează și emite PDF-ul"
            icon="add-circle-outline"
            color={colors.primary}
            onPress={() => router.push('/shop/sales-sheets/new' as never)}
          /> : null}
          <QuickAction
            compact={compact}
            stacked={actionsStacked}
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

function SectionHeading({ icon, title, subtitle, color }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
}) {
  const { isDark } = useAppTheme();
  return <View style={styles.sectionHeading}>
    <View style={[styles.sectionHeadingIcon, { backgroundColor: `${color}${isDark ? '24' : '12'}` }]}>
      <Ionicons name={icon} size={19} color={color} />
    </View>
    <View style={styles.copy}>
      <AppText variant="heading">{title}</AppText>
      <AppText variant="caption" muted>{subtitle}</AppText>
    </View>
  </View>;
}

function Metric({ compact, wideOnCompact = false, icon, label, value, color }: {
  compact: boolean;
  wideOnCompact?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  const { isDark } = useAppTheme();
  const horizontal = compact && wideOnCompact;
  return <View style={[
    styles.metric,
    compact && styles.metricCompact,
    horizontal && styles.metricCompactWide,
    {
      backgroundColor: `${color}${isDark ? '12' : '0A'}`,
      borderColor: `${color}${isDark ? '26' : '1C'}`,
    },
  ]}>
    <View style={[styles.metricTop, horizontal && styles.metricTopHorizontal]}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}${isDark ? '24' : '14'}` }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <AppText variant="caption" muted numberOfLines={1} style={styles.metricLabel}>{label}</AppText>
    </View>
    <AppText
      variant="heading"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      style={[styles.metricValue, horizontal && styles.metricValueHorizontal]}
    >{value}</AppText>
  </View>;
}

function QuickAction({ compact, stacked, title, description, icon, color, onPress }: {
  compact: boolean;
  stacked: boolean;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityHint={description}
    onPress={onPress}
    style={({ pressed }) => [
      styles.quickCard,
      compact && !stacked && styles.quickCardTile,
      stacked && styles.quickCardStacked,
      {
        backgroundColor: isDark
          ? `${color}${pressed ? '22' : '12'}`
          : (pressed ? `${color}12` : colors.surface),
        borderColor: `${color}${pressed ? '55' : (isDark ? '2C' : '20')}`,
        opacity: pressed ? 0.86 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      },
    ]}
  >
    <View style={[styles.quickIcon, compact && styles.quickIconCompact, { backgroundColor: `${color}${isDark ? '26' : '14'}` }]}>
      <Ionicons name={icon} size={compact ? 20 : 22} color={color} />
    </View>
    <View style={styles.copy}>
      <AppText variant="label" numberOfLines={compact && !stacked ? 2 : 1}>{title}</AppText>
      <AppText variant="caption" muted numberOfLines={compact && !stacked ? 2 : 1}>{description}</AppText>
    </View>
    <View style={[
      styles.quickArrow,
      compact && !stacked && styles.quickArrowTile,
      { backgroundColor: isDark ? `${color}22` : colors.surfaceMuted },
    ]}>
      <Ionicons name="arrow-forward" size={16} color={color} />
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
    gap: 10,
  },
  sectionHeading: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionHeadingIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewSurface: {
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.xl,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metric: {
    minWidth: 150,
    minHeight: 88,
    flexGrow: 1,
    flexBasis: 150,
    justifyContent: 'space-between',
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  metricCompact: {
    minWidth: 0,
    flex: 0,
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 88,
  },
  metricCompactWide: {
    flexBasis: '100%',
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metricTop: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metricTopHorizontal: {
    flex: 1,
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    minWidth: 0,
    flexShrink: 1,
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.25,
  },
  metricValueHorizontal: {
    maxWidth: '58%',
    textAlign: 'right',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickGridStacked: {
    flexDirection: 'column',
  },
  quickCard: {
    minWidth: 260,
    minHeight: 80,
    flexGrow: 1,
    flexBasis: 320,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  quickCardTile: {
    minWidth: 0,
    minHeight: 112,
    flexBasis: '46%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  quickCardStacked: {
    minWidth: 0,
    width: '100%',
    minHeight: 68,
    flexBasis: '100%',
    paddingVertical: spacing.sm,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickIconCompact: {
    width: 36,
    height: 36,
    borderRadius: 12,
  },
  quickArrow: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickArrowTile: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
});
