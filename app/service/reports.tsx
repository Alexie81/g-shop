import { QRChart } from '@/components/dashboard/QRChart';
import { StatCard } from '@/components/dashboard/StatCard';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { dashboardRepository } from '@/repositories/api-repositories';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { Commission, CommissionStatus, DashboardMetrics } from '@/types';
import { formatCurrency } from '@/utils/format';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ComponentProps, useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

type ReportPeriod = 'TODAY' | '7D' | '1M' | '1Y' | 'TOTAL' | 'CUSTOM';
type ReportSeriesPoint = { label: string; revenue: number; costs: number; net: number; clients: number };
type Report = {
  metrics: DashboardMetrics;
  commissions: Commission[];
  series: ReportSeriesPoint[];
  revenueByMonth: { label: string; value: number }[];
  period: { key: ReportPeriod; from: string; to: string };
  totalCosts: number;
  netProfit: number;
};

const periodOptions: { key: ReportPeriod; label: string }[] = [
  { key: 'TODAY', label: 'Azi' },
  { key: '7D', label: '7 zile' },
  { key: '1M', label: '1 lună' },
  { key: '1Y', label: '1 an' },
  { key: 'TOTAL', label: 'Total' },
  { key: 'CUSTOM', label: 'Personalizat' },
];

const statusLabels: Record<CommissionStatus, string> = {
  ESTIMATED: 'Estimat',
  CALCULATED: 'Calculat',
  APPROVED: 'De achitat',
  PAID: 'Achitat',
  CANCELLED: 'Anulat',
};

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/;

export default function ReportsScreen() {
  const { activeProperty } = useProperty();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 620;
  const [heroHeight, setHeroHeight] = useState(154);
  const [period, setPeriod] = useState<ReportPeriod>('1M');
  const [customFrom, setCustomFrom] = useState(() => dateValue(daysAgo(29)));
  const [customTo, setCustomTo] = useState(() => dateValue(new Date()));
  const [appliedCustom, setAppliedCustom] = useState(() => ({ from: dateValue(daysAgo(29)), to: dateValue(new Date()), revision: 0 }));
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);
  const [customError, setCustomError] = useState('');
  const propertyId = activeProperty?.id ?? '';
  const query = useMemo(() => {
    const custom = period === 'CUSTOM' ? `&from=${appliedCustom.from}&to=${appliedCustom.to}&revision=${appliedCustom.revision}` : '';
    return `/reports?propertyId=${propertyId}&period=${period}${custom}`;
  }, [appliedCustom, period, propertyId]);
  const state = useAsyncData(async () => {
    const [metrics, report] = await Promise.all([
      dashboardRepository.get(propertyId),
      apiRequest<Report>(query),
    ]);
    return { ...report, metrics };
  }, [propertyId, query]);

  const returnToMore = () => router.replace('/service/more');
  const choosePeriod = (next: ReportPeriod) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setPeriod(next);
    setCustomError('');
  };
  const applyCustomPeriod = () => {
    if (!validDateInput(customFrom) || !validDateInput(customTo) || customFrom > customTo) {
      setCustomError('Alege un interval valid. Data de început trebuie să fie înaintea datei de final.');
      return;
    }
    setCustomError('');
    setAppliedCustom((current) => ({ from: customFrom, to: customTo, revision: current.revision + 1 }));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  if (state.loading) return <Screen header={<AppHeader title="Rapoarte" back onBack={returnToMore} />}><LoadingState rows={6} /></Screen>;
  if (state.error || !state.data) return <Screen header={<AppHeader title="Rapoarte" back onBack={returnToMore} />}><ErrorState message={state.error?.message ?? 'Rapoarte indisponibile.'} onRetry={() => void state.reload()} /></Screen>;

  const report = state.data;
  const series = report.series ?? (report.revenueByMonth ?? []).map((item) => ({ label: item.label, revenue: item.value, costs: 0, net: item.value, clients: 0 }));
  const periodRange = report.period ?? { from: '—', to: '—' };
  const cardBasis = mobile ? '47%' : '30%';
  const seriesRevenue = series.reduce((sum, item) => sum + item.revenue, 0);
  const seriesClients = series.reduce((sum, item) => sum + item.clients, 0);

  return <Screen header={<AppHeader title="Rapoarte" back onBack={returnToMore} />} scroll={false} bottomInset={false} style={styles.screen}>
    <View style={styles.reportRoot}>
      <LinearGradient
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          if (Math.abs(nextHeight - heroHeight) > 1) setHeroHeight(nextHeight);
        }}
        colors={isDark ? ['#08265C', '#075CFF'] : ['#10399B', '#1478FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, styles.fixedHero, mobile && styles.fixedHeroMobile]}
      >
        <View style={styles.heroGlow} />
        <View style={styles.heroCopy}>
          <AppText variant="caption" style={styles.eyebrow}>RAPORT ÎN TIMP REAL</AppText>
          <AppText variant="title" style={styles.heroTitle}>Performanța proprietății</AppText>
          <AppText style={styles.heroText}>{activeProperty?.name}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Actualizează rapoartele" disabled={state.refreshing} onPress={() => void state.reload(true)} style={({ pressed }) => [styles.refresh, { opacity: pressed ? 0.72 : 1 }]}>
          <Ionicons name={state.refreshing ? 'sync' : 'refresh'} size={23} color="#fff" />
        </Pressable>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: heroHeight + spacing.xs }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.reload(true)} tintColor={colors.primary} />}
      >
        <View style={[styles.reportSheet, mobile && styles.reportSheetMobile, { backgroundColor: colors.background, shadowColor: colors.shadow }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

          <View style={styles.periodBlock}>
            <SectionTitle icon="calendar-outline" title="Perioada afișată" description="Graficele și activitatea se recalculează pentru intervalul ales" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
              {periodOptions.map((option) => <PeriodChip key={option.key} label={option.label} selected={period === option.key} onPress={() => choosePeriod(option.key)} />)}
            </ScrollView>
            {period === 'CUSTOM' ? <CustomPeriodEditor
              from={customFrom}
              to={customTo}
              error={customError}
              pickerTarget={pickerTarget}
              onFromChange={setCustomFrom}
              onToChange={setCustomTo}
              onPickerTarget={setPickerTarget}
              onApply={applyCustomPeriod}
            /> : null}
          </View>

          <SectionTitle icon="grid-outline" title="Aceleași date ca în dashboard" description="Valorile actuale, sincronizate online" />
          <View style={styles.stats}>
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Total clienți" value={report.metrics.clientsTotal} icon="people-outline" color={palette.electric} />
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Clienți în așteptare" value={report.metrics.clientsWaiting} icon="time-outline" color={palette.warning} />
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="G-Shop Net" value={formatCurrency(report.metrics.gshopNet)} icon="wallet-outline" color={palette.purple} />
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Venituri on hold" value={formatCurrency(report.metrics.revenueOnHold)} icon="hourglass-outline" color={palette.warning} />
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Total încasări" value={formatCurrency(report.metrics.totalRevenue)} icon="cash-outline" color={palette.success} />
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Total colaboratori" value={formatCurrency(report.metrics.collaboratorTotal)} icon="people-circle-outline" color={palette.cyan} />
          </View>

          <View style={styles.periodSummary}>
            <MiniMetric label="Volum fișe" value={formatCurrency(seriesRevenue)} icon="receipt-outline" color={palette.electric} />
            <MiniMetric label="Costuri" value={formatCurrency(report.totalCosts)} icon="trending-down-outline" color={palette.danger} />
            <MiniMetric label="Net perioadă" value={formatCurrency(report.netProfit)} icon="trending-up-outline" color={report.netProfit >= 0 ? palette.success : palette.danger} />
            <MiniMetric label="Clienți noi" value={`${seriesClients}`} icon="person-add-outline" color={palette.cyan} />
          </View>

          <Card style={styles.panel}>
            <SectionTitle compact icon="pulse-outline" title="Evoluție financiară" description={`${periodRange.from} – ${periodRange.to}`} />
            <TrendChart data={series} />
          </Card>

          <View style={[styles.columns, mobile && styles.columnsMobile]}>
            <Card style={[styles.panel, !mobile && styles.halfPanel]}>
              <SectionTitle compact icon="people-outline" title="Clienți noi" description="Distribuția în intervalul ales" />
              <ActivityBars data={series} />
            </Card>
            <Card style={[styles.panel, !mobile && styles.halfPanel]}>
              <SectionTitle compact icon="qr-code-outline" title="Activitate QR" description="Situația actuală a codurilor" />
              <QRChart generated={report.metrics.qrGenerated} used={report.metrics.qrUsed} />
            </Card>
          </View>

          <Card style={styles.panel}>
            <SectionTitle compact icon="people-circle-outline" title="Comisioane colaboratori" description={`${report.commissions.length} înregistrări în perioada aleasă`} />
            {report.commissions.length ? <View style={styles.commissions}>{report.commissions.slice(0, 20).map((item) => <CommissionRow key={item.id} item={item} />)}</View> : <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="receipt-outline" size={28} color={colors.primary} /></View><AppText variant="heading">Niciun comision</AppText><AppText variant="caption" muted style={styles.center}>Nu există comisioane în intervalul selectat.</AppText></View>}
          </Card>
        </View>
      </ScrollView>
    </View>
  </Screen>;
}

function PeriodChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.periodChip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.76 : 1 }]}>
    <AppText variant="label" numberOfLines={1} style={{ color: selected ? '#fff' : colors.text }}>{label}</AppText>
  </Pressable>;
}

function CustomPeriodEditor({ from, to, error, pickerTarget, onFromChange, onToChange, onPickerTarget, onApply }: {
  from: string;
  to: string;
  error: string;
  pickerTarget: 'from' | 'to' | null;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onPickerTarget: (target: 'from' | 'to' | null) => void;
  onApply: () => void;
}) {
  const { colors } = useAppTheme();
  const handlePicker = (event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === 'android') onPickerTarget(null);
    if (event.type === 'dismissed' || !value || !pickerTarget) return;
    if (pickerTarget === 'from') onFromChange(dateValue(value)); else onToChange(dateValue(value));
  };
  return <View style={[styles.customEditor, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    {Platform.OS === 'web' ? <View style={styles.customFields}>
      <Input label="De la" value={from} onChangeText={onFromChange} placeholder="AAAA-LL-ZZ" autoCapitalize="none" />
      <Input label="Până la" value={to} onChangeText={onToChange} placeholder="AAAA-LL-ZZ" autoCapitalize="none" />
    </View> : <View style={styles.customFields}>
      <DateButton label="De la" value={from} onPress={() => onPickerTarget('from')} />
      <DateButton label="Până la" value={to} onPress={() => onPickerTarget('to')} />
    </View>}
    {pickerTarget && Platform.OS !== 'web' ? <DateTimePicker value={parseDate(pickerTarget === 'from' ? from : to)} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={handlePicker} /> : null}
    {error ? <AppText variant="caption" style={{ color: palette.danger }}>{error}</AppText> : null}
    <Pressable accessibilityRole="button" onPress={onApply} style={({ pressed }) => [styles.applyButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}>
      <Ionicons name="checkmark-circle-outline" size={19} color="#fff" />
      <AppText variant="label" style={{ color: '#fff' }}>Aplică intervalul</AppText>
    </Pressable>
  </View>;
}

function DateButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.dateButton, { backgroundColor: colors.input, borderColor: colors.border, opacity: pressed ? 0.78 : 1 }]}>
    <View style={{ flex: 1 }}><AppText variant="caption" muted>{label}</AppText><AppText variant="label">{value}</AppText></View>
    <Ionicons name="calendar-outline" size={20} color={colors.primary} />
  </Pressable>;
}

function SectionTitle({ icon, title, description, compact = false }: { icon: ComponentProps<typeof Ionicons>['name']; title: string; description: string; compact?: boolean }) {
  const { colors } = useAppTheme();
  return <View style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}><View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name={icon} size={compact ? 19 : 21} color={colors.primary} /></View><View style={styles.sectionCopy}><AppText variant={compact ? 'heading' : 'title'}>{title}</AppText><AppText variant="caption" muted>{description}</AppText></View></View>;
}

function MiniMetric({ label, value, icon, color }: { label: string; value: string; icon: ComponentProps<typeof Ionicons>['name']; color: string }) {
  const { colors } = useAppTheme();
  return <View style={[styles.miniMetric, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.miniIcon, { backgroundColor: `${color}14` }]}><Ionicons name={icon} size={18} color={color} /></View><View style={styles.miniCopy}><AppText variant="caption" muted>{label}</AppText><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color }}>{value}</AppText></View></View>;
}

function TrendChart({ data }: { data: ReportSeriesPoint[] }) {
  const { colors } = useAppTheme();
  const points = data.length ? data : [{ label: '—', revenue: 0, costs: 0, net: 0, clients: 0 }];
  const max = Math.max(1, ...points.flatMap((item) => [item.revenue, Math.max(0, item.net)]));
  const makePoints = (key: 'revenue' | 'net') => points.map((item, index) => {
    const x = points.length === 1 ? 160 : 16 + index * (288 / (points.length - 1));
    const y = 132 - (Math.max(0, item[key]) / max) * 104;
    return `${x},${y}`;
  }).join(' ');
  const labels = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]];
  return <View style={styles.chartWrap}>
    <View style={styles.legend}><Legend color={palette.electric} label="Volum fișe" /><Legend color={palette.success} label="Net" /></View>
    <Svg width="100%" height={164} viewBox="0 0 320 164">
      {[28, 80, 132].map((y) => <Line key={y} x1="16" y1={y} x2="304" y2={y} stroke={colors.border} strokeWidth="1" />)}
      <Polyline points={makePoints('revenue')} fill="none" stroke={palette.electric} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points={makePoints('net')} fill="none" stroke={palette.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((item, index) => {
        const x = points.length === 1 ? 160 : 16 + index * (288 / (points.length - 1));
        const y = 132 - (Math.max(0, item.revenue) / max) * 104;
        return <Circle key={`${item.label}-${index}`} cx={x} cy={y} r="3.2" fill={palette.electric} />;
      })}
    </Svg>
    <View style={styles.chartLabels}>{labels.map((item, index) => <AppText key={`${item.label}-${index}`} variant="caption" muted numberOfLines={1}>{item.label}</AppText>)}</View>
  </View>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><AppText variant="caption" muted>{label}</AppText></View>;
}

function ActivityBars({ data }: { data: ReportSeriesPoint[] }) {
  const { colors } = useAppTheme();
  const compact = data.length > 14 ? data.filter((_, index) => index % Math.ceil(data.length / 12) === 0) : data;
  const points = compact.length ? compact : [{ label: '—', revenue: 0, costs: 0, net: 0, clients: 0 }];
  const max = Math.max(1, ...points.map((item) => item.clients));
  return <View style={styles.activityBars}>{points.map((item, index) => <View key={`${item.label}-${index}`} style={styles.activityColumn}>
    <View style={[styles.activityTrack, { backgroundColor: colors.surfaceMuted }]}><LinearGradient colors={['#38C9E8', '#075CFF']} style={[styles.activityBar, { height: `${Math.max(8, item.clients / max * 100)}%` }]} /></View>
    <AppText variant="caption" muted numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{item.label}</AppText>
  </View>)}</View>;
}

function CommissionRow({ item }: { item: Commission }) {
  const { colors, isDark } = useAppTheme();
  const paid = item.status === 'PAID';
  const cancelled = item.status === 'CANCELLED';
  const color = paid ? palette.success : cancelled ? palette.danger : palette.warning;
  const rule = item.type === 'FIXED' ? 'Sumă fixă' : `${item.rateOrAmount}% din ${item.type === 'PERCENT_TOTAL' ? 'total' : 'net'}`;
  return <View style={[styles.commission, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
    <View style={[styles.commissionIcon, { backgroundColor: isDark ? `${color}22` : `${color}12` }]}><Ionicons name={paid ? 'checkmark-circle-outline' : cancelled ? 'close-circle-outline' : 'time-outline'} size={21} color={color} /></View>
    <View style={styles.commissionCopy}><AppText variant="label" numberOfLines={1}>Fișa {item.serviceSheetNumber ?? 'fără număr'}</AppText><AppText variant="caption" muted>{rule}</AppText></View>
    <View style={styles.commissionValue}><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color }}>{formatCurrency(item.commissionValue)}</AppText><AppText variant="caption" style={{ color }}>{statusLabels[item.status]}</AppText></View>
  </View>;
}

function daysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value;
}

function dateValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function parseDate(value: string) {
  const parsed = validDateInput(value) ? new Date(`${value}T12:00:00`) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function validDateInput(value: string) {
  if (!dateInputPattern.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && dateValue(parsed) === value;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 0, paddingBottom: 0 },
  reportRoot: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollContent: {},
  reportSheet: { minHeight: 720, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 112, gap: spacing.lg, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  reportSheetMobile: { paddingHorizontal: spacing.md },
  sheetHandle: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginBottom: spacing.xs },
  hero: { minHeight: 154, borderRadius: radius.xl, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, overflow: 'hidden' },
  fixedHero: { position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg },
  fixedHeroMobile: { top: spacing.md, left: spacing.md, right: spacing.md },
  heroGlow: { position: 'absolute', width: 190, height: 190, borderRadius: 95, top: -105, right: -60, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  eyebrow: { color: '#DCE8FF', fontWeight: '800', letterSpacing: 1.1 },
  heroTitle: { color: '#fff' },
  heroText: { color: '#E8F0FF' },
  refresh: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  periodBlock: { gap: spacing.md },
  periodRow: { gap: spacing.sm, paddingRight: spacing.lg },
  periodChip: { minHeight: 46, minWidth: 74, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  customEditor: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  customFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  dateButton: { minWidth: 150, flex: 1, minHeight: 58, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  applyButton: { minHeight: 48, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  sectionTitle: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionTitleCompact: { minHeight: 42 },
  sectionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { minWidth: 0, flex: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  periodSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  miniMetric: { minWidth: 145, flex: 1, minHeight: 72, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  miniIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  miniCopy: { minWidth: 0, flex: 1 },
  columns: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  columnsMobile: { flexDirection: 'column' },
  panel: { minWidth: 0, gap: spacing.lg, overflow: 'hidden' },
  halfPanel: { flex: 1 },
  chartWrap: { minHeight: 205 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs },
  activityBars: { minHeight: 220, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  activityColumn: { minWidth: 0, flex: 1, height: 210, alignItems: 'center', gap: spacing.xs },
  activityTrack: { flex: 1, width: '70%', minWidth: 14, maxWidth: 40, borderRadius: radius.sm, overflow: 'hidden', justifyContent: 'flex-end' },
  activityBar: { width: '100%', borderRadius: radius.sm },
  commissions: { gap: spacing.sm },
  commission: { minHeight: 76, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  commissionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  commissionCopy: { minWidth: 0, flex: 1 },
  commissionValue: { maxWidth: 118, alignItems: 'flex-end' },
  empty: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyIcon: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
