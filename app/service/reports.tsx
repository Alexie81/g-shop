import { CollaboratorFinanceSheet } from '@/components/dashboard/CollaboratorFinanceSheet';
import { QRChart } from '@/components/dashboard/QRChart';
import { StatCard } from '@/components/dashboard/StatCard';
import { AppHeader } from '@/components/layout/AppHeader';
import { AnimatedRefreshIcon } from '@/components/ui/AnimatedRefreshIcon';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useBackToAdministration } from '@/hooks/useBackToAdministration';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { dashboardRepository } from '@/repositories/api-repositories';
import { apiRequest } from '@/services/api';
import { preferenceStorage } from '@/services/storage';
import { palette, radius, spacing } from '@/theme/tokens';
import { Client, CollaboratorFinanceSummary, Commission, CommissionStatus, DashboardMetrics, Paginated } from '@/types';
import { formatCurrency } from '@/utils/format';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ComponentProps, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

type ReportPeriod = 'TODAY' | '7D' | '1M' | '1Y' | 'TOTAL' | 'CUSTOM';
type ReportSeriesPoint = { label: string; revenue: number; costs: number; net: number; clients: number; isCurrent?: boolean };
type ReportPeriodMetrics = Pick<DashboardMetrics, 'clientsTotal' | 'clientsWaiting' | 'gshopNet' | 'revenueOnHold' | 'totalRevenue' | 'totalExpenses' | 'collaboratorTotal' | 'collaboratorPaid' | 'collaboratorOnHold'>;
type Report = {
  metrics: DashboardMetrics;
  periodMetrics?: ReportPeriodMetrics;
  commissions: Commission[];
  series: ReportSeriesPoint[];
  revenueByMonth: { label: string; value: number }[];
  period: { key: ReportPeriod; from: string; to: string };
  totalCosts: number;
  netProfit: number;
};

type CommissionFilter = 'ALL' | 'DUE' | 'PAID';
type StoredReportPreferences = { period: ReportPeriod; customFrom: string; customTo: string };

const reportPreferencesKey = 'reports.period';

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
  useBackToAdministration();
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
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [commissionFilter, setCommissionFilter] = useState<CommissionFilter>('DUE');
  const propertyId = activeProperty?.id ?? '';
  const query = useMemo(() => {
    const custom = period === 'CUSTOM' ? `&from=${appliedCustom.from}&to=${appliedCustom.to}&revision=${appliedCustom.revision}` : '';
    return `/reports?propertyId=${propertyId}&period=${period}${custom}`;
  }, [appliedCustom, period, propertyId]);
  const state = useAsyncData(async () => {
    const [metrics, report, financeSummary, clientCreatedAt] = await Promise.all([
      dashboardRepository.get(propertyId),
      apiRequest<Report>(query),
      apiRequest<CollaboratorFinanceSummary>(`/collaborator-finances?propertyId=${propertyId}`).catch(() => null),
      period === 'TODAY' ? loadClientCreationTimes(propertyId).catch(() => null) : Promise.resolve(null),
    ]);
    return { ...report, dashboardMetrics: metrics, financeSummary, clientCreatedAt, metrics: { ...metrics, ...(report.periodMetrics ?? {}) } };
  }, [propertyId, query]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  useEffect(() => {
    let active = true;
    void preferenceStorage.get(reportPreferencesKey).then((stored) => {
      if (!active || !stored) return;
      try {
        const parsed = JSON.parse(stored) as Partial<StoredReportPreferences>;
        if (isReportPeriod(parsed.period)) setPeriod(parsed.period);
        if (typeof parsed.customFrom === 'string' && typeof parsed.customTo === 'string' && validDateInput(parsed.customFrom) && validDateInput(parsed.customTo) && parsed.customFrom <= parsed.customTo) {
          setCustomFrom(parsed.customFrom);
          setCustomTo(parsed.customTo);
          setAppliedCustom({ from: parsed.customFrom, to: parsed.customTo, revision: 1 });
        }
      } catch {
        // Preferințele invalide sunt ignorate; raportul rămâne pe valorile implicite.
      }
    }).finally(() => { if (active) setPreferencesReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    const next: StoredReportPreferences = { period, customFrom: appliedCustom.from, customTo: appliedCustom.to };
    void preferenceStorage.set(reportPreferencesKey, JSON.stringify(next)).catch(() => undefined);
  }, [appliedCustom.from, appliedCustom.to, period, preferencesReady]);

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
  const clientActivitySeries = hourlyClientSeries(series, report.period?.key ?? period, report.clientCreatedAt);
  const periodRange = report.period ?? { from: '—', to: '—' };
  const qrMetrics = report.dashboardMetrics ?? (report.metrics as DashboardMetrics);
  const cardBasis = mobile ? '47%' : '30%';
  const dueCommissions = report.commissions.filter((item) => item.status !== 'PAID' && item.status !== 'CANCELLED');
  const paidCommissions = report.commissions.filter((item) => item.status === 'PAID');
  const visibleCommissions = commissionFilter === 'DUE' ? dueCommissions : commissionFilter === 'PAID' ? paidCommissions : report.commissions;
  const periodPaid = report.periodMetrics?.collaboratorPaid ?? paidCommissions.reduce((total, item) => total + item.commissionValue, 0);
  const periodDue = report.periodMetrics?.collaboratorOnHold ?? Math.max(0, report.metrics.collaboratorTotal - periodPaid);
  const collaboratorNames = new Map((report.financeSummary?.collaborators ?? []).map((item) => [item.collaboratorId, item.collaboratorName]));
  const clientNames = new Map((report.financeSummary?.collaborators ?? []).flatMap((collaborator) => collaborator.clients.map((client) => [client.clientId, client.clientName] as const)));

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
          <AnimatedRefreshIcon refreshing={state.refreshing} color="#fff" size={23} />
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

          <SectionTitle icon="grid-outline" title="Analiză date" description="Indicatorii financiari recalculați pentru intervalul ales" />
          <View style={styles.stats}>
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Total clienți" value={report.metrics.clientsTotal} icon="people-outline" color={palette.electric} />
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Clienți în așteptare" value={report.metrics.clientsWaiting} icon="time-outline" color={palette.warning} />
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="G-Shop Net" value={formatCurrency(report.metrics.gshopNet)} icon="wallet-outline" color={palette.purple} />
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Venituri on hold" value={formatCurrency(report.metrics.revenueOnHold)} icon="hourglass-outline" color={palette.warning} />
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Total încasări" value={formatCurrency(report.metrics.totalRevenue)} icon="cash-outline" color={palette.success} />
            <StatCard style={{ flexGrow: 1, flexBasis: cardBasis }} label="Total cheltuieli" value={formatCurrency(report.metrics.totalExpenses)} icon="receipt-outline" color={palette.warning} helper="Costuri interne + comisioane achitate" />
            <StatCard
              style={{ flexGrow: 1, flexBasis: cardBasis }}
              label="Total colaboratori"
              value={formatCurrency(report.metrics.collaboratorTotal)}
              icon="people-circle-outline"
              color={palette.cyan}
              helper="Ține apăsat"
              helperIcon="finger-print-outline"
              onLongPress={() => setFinanceOpen(true)}
            />
          </View>

          <Card style={styles.panel}>
            <SectionTitle compact icon="pulse-outline" title="Evoluție financiară" description={`${periodRange.from} – ${periodRange.to} · Atinge graficul pentru detalii`} />
            <TrendChart data={series} />
          </Card>

          <View style={[styles.columns, mobile && styles.columnsMobile]}>
            <Card style={[styles.panel, !mobile && styles.halfPanel]}>
              <SectionTitle compact icon="people-outline" title="Clienți noi" description="Glisează orizontal și atinge o bară pentru valoarea exactă" />
              <ActivityBars data={clientActivitySeries} period={report.period?.key ?? period} />
            </Card>
            <Card style={[styles.panel, !mobile && styles.halfPanel]}>
              <SectionTitle compact icon="qr-code-outline" title="Activitate QR" description="Situația actuală a codurilor" />
              <QRChart generated={qrMetrics.qrGenerated ?? 0} used={qrMetrics.qrUsed ?? 0} />
            </Card>
          </View>

          <Card style={styles.panel}>
            <SectionTitle compact icon="people-circle-outline" title="Comisioane colaboratori" description="Vezi exact cui, pentru ce client și cât ai de achitat" />
            <View style={styles.commissionFilters}>
              <CommissionFilterCard label="De achitat" value={periodDue} count={dueCommissions.length} color={palette.warning} selected={commissionFilter === 'DUE'} onPress={() => setCommissionFilter('DUE')} />
              <CommissionFilterCard label="Achitat" value={periodPaid} count={paidCommissions.length} color={palette.success} selected={commissionFilter === 'PAID'} onPress={() => setCommissionFilter('PAID')} />
              <CommissionFilterCard label="Toate" value={report.metrics.collaboratorTotal} count={report.commissions.length} color={palette.cyan} selected={commissionFilter === 'ALL'} onPress={() => setCommissionFilter('ALL')} />
            </View>
            <Pressable accessibilityRole="button" onPress={() => setFinanceOpen(true)} style={({ pressed }) => [styles.openFinanceButton, { backgroundColor: colors.primarySoft, opacity: pressed ? 0.74 : 1 }]}>
              <Ionicons name="list-outline" size={19} color={colors.primary} />
              <View style={styles.openFinanceCopy}><AppText variant="label" style={{ color: colors.primary }}>Vezi situația completă pe colaboratori</AppText><AppText variant="caption" muted>Clienți, sume achitate și sume rămase de plată</AppText></View>
              <Ionicons name="chevron-up-outline" size={18} color={colors.primary} />
            </Pressable>
            {visibleCommissions.length ? <View style={styles.commissions}>{visibleCommissions.map((item) => <CommissionRow key={item.id} item={item} collaboratorName={item.collaboratorName ?? collaboratorNames.get(item.collaboratorId)} clientName={item.clientName ?? clientNames.get(item.clientId)} />)}</View> : <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="receipt-outline" size={28} color={colors.primary} /></View><AppText variant="heading">Niciun comision</AppText><AppText variant="caption" muted style={styles.center}>{commissionFilter === 'DUE' ? 'Nu ai comisioane de achitat în intervalul selectat.' : 'Nu există comisioane în intervalul selectat.'}</AppText></View>}
          </Card>
        </View>
      </ScrollView>
      <CollaboratorFinanceSheet visible={financeOpen} propertyId={propertyId} onClose={() => setFinanceOpen(false)} onChanged={() => void state.reload(true)} />
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

function TrendChart({ data }: { data: ReportSeriesPoint[] }) {
  const { colors } = useAppTheme();
  const points = data.length ? data : [{ label: '—', revenue: 0, costs: 0, net: 0, clients: 0 }];
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, points.length - 1));
  const [chartWidth, setChartWidth] = useState(320);
  const safeSelectedIndex = Math.min(selectedIndex, points.length - 1);
  const selected = points[safeSelectedIndex];
  const min = Math.min(0, ...points.flatMap((item) => [item.revenue, item.costs, item.net]));
  const max = Math.max(1, ...points.flatMap((item) => [item.revenue, item.costs, item.net]));
  const range = Math.max(1, max - min);
  const yForValue = (value: number) => 132 - ((value - min) / range) * 104;
  const xForIndex = (index: number) => points.length === 1 ? 160 : 16 + index * (288 / (points.length - 1));
  const makePoints = (key: 'revenue' | 'costs' | 'net') => points.map((item, index) => {
    const x = points.length === 1 ? 160 : 16 + index * (288 / (points.length - 1));
    const y = yForValue(item[key]);
    return `${x},${y}`;
  }).join(' ');
  const labels = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]];
  const selectPoint = (locationX: number) => {
    const viewBoxX = Math.max(16, Math.min(304, locationX / Math.max(1, chartWidth) * 320));
    const nextIndex = points.length === 1 ? 0 : Math.round((viewBoxX - 16) / 288 * (points.length - 1));
    setSelectedIndex(nextIndex);
    void Haptics.selectionAsync().catch(() => undefined);
  };
  return <View style={styles.chartWrap}>
    <View style={styles.legend}><Legend color={palette.electric} label="Încasări" /><Legend color={palette.warning} label="Costuri" /><Legend color={palette.success} label="Net" /></View>
    <View style={[styles.chartSelection, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
      <View style={styles.chartSelectionTitle}><Ionicons name="calendar-outline" size={16} color={colors.primary} /><AppText variant="label">{selected.label}</AppText></View>
      <View style={styles.chartSelectionMetrics}>
        <ChartMetric label="Încasări" value={formatCurrency(selected.revenue)} color={palette.electric} />
        <ChartMetric label="Costuri" value={formatCurrency(selected.costs)} color={palette.warning} />
        <ChartMetric label="Net" value={formatCurrency(selected.net)} color={selected.net >= 0 ? palette.success : palette.danger} />
        <ChartMetric label="Clienți" value={String(selected.clients)} color={palette.cyan} />
      </View>
    </View>
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel={`Evoluție financiară. ${selected.label}, încasări ${formatCurrency(selected.revenue)}, costuri ${formatCurrency(selected.costs)}, net ${formatCurrency(selected.net)}.`}
      accessibilityHint="Atinge graficul pentru a selecta o perioadă."
      onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
      onPress={(event) => selectPoint(event.nativeEvent.locationX)}
      style={styles.chartTouch}
    >
      <Svg pointerEvents="none" width="100%" height={164} viewBox="0 0 320 164">
        {[28, 80, 132].map((y) => <Line key={y} x1="16" y1={y} x2="304" y2={y} stroke={colors.border} strokeWidth="1" />)}
        {min < 0 ? <Line x1="16" y1={yForValue(0)} x2="304" y2={yForValue(0)} stroke={colors.textMuted} strokeWidth="1" strokeDasharray="4 4" /> : null}
        <Polyline points={makePoints('revenue')} fill="none" stroke={palette.electric} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points={makePoints('costs')} fill="none" stroke={palette.warning} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points={makePoints('net')} fill="none" stroke={palette.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <Line x1={xForIndex(safeSelectedIndex)} y1="22" x2={xForIndex(safeSelectedIndex)} y2="138" stroke={colors.text} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.48" />
        {points.map((item, index) => <Circle key={`${item.label}-${index}`} cx={xForIndex(index)} cy={yForValue(item.revenue)} r={index === safeSelectedIndex ? 6 : 3.2} fill={palette.electric} stroke={index === safeSelectedIndex ? colors.surface : palette.electric} strokeWidth={index === safeSelectedIndex ? 3 : 0} />)}
      </Svg>
    </Pressable>
    <View style={styles.chartLabels}>{labels.map((item, index) => <AppText key={`${item.label}-${index}`} variant="caption" muted numberOfLines={1}>{item.label}</AppText>)}</View>
  </View>;
}

function ChartMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={styles.chartMetric}><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color }}>{value}</AppText><AppText variant="caption" muted>{label}</AppText></View>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><AppText variant="caption" muted>{label}</AppText></View>;
}

const activityColumnWidth = 62;

async function loadClientCreationTimes(propertyId: string) {
  const createdAt: string[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await apiRequest<Paginated<Client>>(`/clients?propertyId=${propertyId}&page=${page}&pageSize=100`);
    createdAt.push(...result.data.map((client) => client.createdAt));
    totalPages = Math.max(1, result.totalPages);
    page += 1;
  } while (page <= totalPages);
  return createdAt;
}

function hourlyClientSeries(data: ReportSeriesPoint[], period: ReportPeriod, clientCreatedAt: string[] | null) {
  if (period !== 'TODAY') return data;
  const now = new Date();
  const existingByHour = new Map<number, ReportSeriesPoint>();
  data.forEach((item) => {
    const hour = Number.parseInt(item.label.slice(0, 2), 10);
    if (Number.isFinite(hour) && hour >= 0 && hour < 24) existingByHour.set(hour, item);
  });
  const clientsByHour = Array.from({ length: 24 }, () => 0);
  if (clientCreatedAt) {
    clientCreatedAt.forEach((value) => {
      const created = new Date(value);
      if (Number.isNaN(created.getTime())) return;
      if (created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth() && created.getDate() === now.getDate()) clientsByHour[created.getHours()] += 1;
    });
  } else {
    existingByHour.forEach((item, hour) => { clientsByHour[hour] = item.clients; });
  }
  return Array.from({ length: now.getHours() + 1 }, (_, hour) => {
    const existing = existingByHour.get(hour);
    return {
      label: `${String(hour).padStart(2, '0')}:00`,
      revenue: existing?.revenue ?? 0,
      costs: existing?.costs ?? 0,
      net: existing?.net ?? 0,
      clients: clientsByHour[hour],
      isCurrent: hour === now.getHours(),
    };
  });
}

function ActivityBars({ data, period }: { data: ReportSeriesPoint[]; period: ReportPeriod }) {
  const { colors } = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);
  const points = data.length ? data : [{ label: '—', revenue: 0, costs: 0, net: 0, clients: 0 }];
  const max = Math.max(1, ...points.map((item) => item.clients));
  const currentIndex = currentSeriesIndex(points, period);
  const focusIndex = currentIndex >= 0 ? currentIndex : Math.max(0, points.length - 1);
  const [selectedIndex, setSelectedIndex] = useState(focusIndex);
  const [viewportWidth, setViewportWidth] = useState(0);
  const safeSelectedIndex = Math.min(selectedIndex, points.length - 1);
  const selected = points[safeSelectedIndex];
  const centerIndex = (index: number, animated: boolean) => scrollRef.current?.scrollTo({ x: index * (activityColumnWidth + spacing.sm), animated });

  useEffect(() => {
    setSelectedIndex(focusIndex);
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ x: focusIndex * (activityColumnWidth + spacing.sm), animated: false }), 60);
    return () => clearTimeout(timer);
  }, [data, focusIndex, viewportWidth]);

  return <View style={styles.activityWrap}>
    <View style={[styles.activitySelection, { backgroundColor: colors.primarySoft }]}><Ionicons name="person-add-outline" size={18} color={colors.primary} /><AppText variant="label" style={{ color: colors.primary }}>{selected.clients} {selected.clients === 1 ? 'client nou' : 'clienți noi'}</AppText><AppText variant="caption" muted style={styles.activitySelectionLabel}>{selected.label}</AppText>{safeSelectedIndex === currentIndex ? <View style={[styles.currentBadge, { backgroundColor: colors.primary }]}><AppText variant="caption" style={styles.currentBadgeText}>ACUM</AppText></View> : null}</View>
    <ScrollView
      ref={scrollRef}
      horizontal
      nestedScrollEnabled
      directionalLockEnabled
      showsHorizontalScrollIndicator
      decelerationRate="fast"
      snapToInterval={activityColumnWidth + spacing.sm}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
      contentContainerStyle={[styles.activityBars, { paddingHorizontal: Math.max(spacing.sm, (viewportWidth - activityColumnWidth) / 2) }]}
    >{points.map((item, index) => {
      const selectedBar = index === safeSelectedIndex;
      const currentBar = index === currentIndex;
      return <Pressable key={`${item.label}-${index}`} accessibilityRole="button" accessibilityState={{ selected: selectedBar }} accessibilityLabel={`${item.label}: ${item.clients} clienți noi${currentBar ? ', perioada curentă' : ''}`} onPress={() => { setSelectedIndex(index); centerIndex(index, true); void Haptics.selectionAsync().catch(() => undefined); }} style={({ pressed }) => [styles.activityColumn, { opacity: pressed ? 0.72 : 1 }]}>
        <View style={[styles.activityTrack, { backgroundColor: colors.surfaceMuted, borderColor: selectedBar ? colors.primary : 'transparent' }]}><LinearGradient colors={['#38C9E8', '#075CFF']} style={[styles.activityBar, { height: `${Math.max(8, item.clients / max * 100)}%` }]} /></View>
        <View style={styles.activityLabel}><AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: selectedBar ? colors.primary : colors.textMuted, fontWeight: selectedBar ? '800' : '400' }}>{item.label}</AppText>{currentBar ? <View style={[styles.currentDot, { backgroundColor: colors.primary }]} /> : null}</View>
      </Pressable>;
    })}</ScrollView>
  </View>;
}

function currentSeriesIndex(points: ReportSeriesPoint[], period: ReportPeriod) {
  const apiIndex = points.findIndex((item) => item.isCurrent);
  if (apiIndex >= 0) return apiIndex;
  const now = new Date();
  if (period === 'TODAY') {
    const currentHour = now.getHours();
    return points.reduce((result, item, index) => {
      const hour = Number.parseInt(item.label.slice(0, 2), 10);
      return Number.isFinite(hour) && hour <= currentHour ? index : result;
    }, -1);
  }
  const monthNames = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];
  const dayLabel = `${String(now.getDate()).padStart(2, '0')} ${monthNames[now.getMonth()]}`;
  const monthLabel = `${monthNames[now.getMonth()]} ${String(now.getFullYear()).slice(-2)}`;
  const yearLabel = String(now.getFullYear());
  const matching = points.findIndex((item) => item.label === dayLabel || item.label === monthLabel || item.label === yearLabel);
  return matching;
}

function CommissionRow({ item, collaboratorName, clientName }: { item: Commission; collaboratorName?: string; clientName?: string }) {
  const { colors, isDark } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const paid = item.status === 'PAID';
  const cancelled = item.status === 'CANCELLED';
  const color = paid ? palette.success : cancelled ? palette.danger : palette.warning;
  const rule = item.type === 'FIXED' ? 'Sumă fixă' : `${item.rateOrAmount}% din ${item.type === 'PERCENT_TOTAL' ? 'total' : 'net'}`;
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${collaboratorName ?? 'Colaborator'}, ${clientName ?? 'client'}, ${formatCurrency(item.commissionValue)}, ${statusLabels[item.status]}`} accessibilityHint="Atinge pentru detaliile calculului" onPress={() => { setExpanded((current) => !current); void Haptics.selectionAsync().catch(() => undefined); }} style={({ pressed }) => [styles.commission, { backgroundColor: colors.surfaceMuted, borderColor: expanded ? color : colors.border, opacity: pressed ? 0.78 : 1 }]}>
    <View style={styles.commissionMain}>
      <View style={[styles.commissionIcon, { backgroundColor: isDark ? `${color}22` : `${color}12` }]}><Ionicons name={paid ? 'checkmark-circle-outline' : cancelled ? 'close-circle-outline' : 'time-outline'} size={21} color={color} /></View>
      <View style={styles.commissionCopy}><AppText variant="label" numberOfLines={1}>{collaboratorName ?? 'Colaborator'}</AppText><AppText variant="caption" muted numberOfLines={2}>{clientName ?? 'Client'} · Fișa {item.serviceSheetNumber ?? 'fără număr'}</AppText></View>
      <View style={styles.commissionValue}><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color }}>{formatCurrency(item.commissionValue)}</AppText><View style={styles.commissionStatus}><AppText variant="caption" style={{ color }}>{statusLabels[item.status]}</AppText><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={color} /></View></View>
    </View>
    {expanded ? <View style={[styles.commissionDetails, { borderTopColor: colors.border }]}>
      <ChartMetric label="Valoare totală" value={formatCurrency(item.totalValue)} color={colors.text} />
      <ChartMetric label="Costuri directe" value={formatCurrency(item.directCosts)} color={palette.warning} />
      <ChartMetric label="Valoare netă" value={formatCurrency(item.netValue)} color={palette.success} />
      <ChartMetric label="Regulă" value={rule} color={colors.primary} />
    </View> : null}
  </Pressable>;
}

function CommissionFilterCard({ label, value, count, color, selected, onPress }: { label: string; value: number; count: number; color: string; selected: boolean; onPress: () => void }) {
  const { colors, isDark } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { onPress(); void Haptics.selectionAsync().catch(() => undefined); }} style={({ pressed }) => [styles.commissionFilter, { backgroundColor: selected ? (isDark ? `${color}22` : `${color}10`) : colors.surfaceMuted, borderColor: selected ? color : colors.border, opacity: pressed ? 0.76 : 1 }]}>
    <View style={[styles.commissionFilterDot, { backgroundColor: color }]} />
    <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color }}>{formatCurrency(value)}</AppText>
    <AppText variant="caption" numberOfLines={1}>{label}</AppText>
    <AppText variant="caption" muted>{count} {count === 1 ? 'înregistrare' : 'înregistrări'}</AppText>
  </Pressable>;
}

function isReportPeriod(value: unknown): value is ReportPeriod {
  return typeof value === 'string' && periodOptions.some((option) => option.key === value);
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
  columns: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  columnsMobile: { flexDirection: 'column' },
  panel: { minWidth: 0, gap: spacing.lg, overflow: 'hidden' },
  halfPanel: { flex: 1 },
  chartWrap: { minHeight: 205, gap: spacing.md },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  chartSelection: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  chartSelectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chartSelectionMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chartMetric: { minWidth: 78, flex: 1, gap: 1 },
  chartTouch: { minHeight: 164 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs },
  activityWrap: { gap: spacing.md },
  activitySelection: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  activitySelectionLabel: { marginLeft: 'auto' },
  currentBadge: { minHeight: 22, borderRadius: radius.pill, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  currentBadgeText: { color: '#fff', fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.5 },
  activityBars: { minHeight: 228, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingBottom: spacing.sm },
  activityColumn: { width: activityColumnWidth, height: 218, alignItems: 'center', gap: spacing.xs },
  activityTrack: { flex: 1, width: 38, borderRadius: radius.sm, borderWidth: 2, overflow: 'hidden', justifyContent: 'flex-end' },
  activityBar: { width: '100%', borderRadius: radius.sm },
  activityLabel: { minHeight: 24, alignItems: 'center', justifyContent: 'center', gap: 3 },
  currentDot: { width: 5, height: 5, borderRadius: 3 },
  commissionFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  commissionFilter: { minWidth: 118, flex: 1, minHeight: 118, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, justifyContent: 'center', gap: 2 },
  commissionFilterDot: { width: 8, height: 8, borderRadius: 4, marginBottom: spacing.xs },
  openFinanceButton: { minHeight: 62, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  openFinanceCopy: { minWidth: 0, flex: 1 },
  commissions: { gap: spacing.sm },
  commission: { minHeight: 76, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  commissionMain: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  commissionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  commissionCopy: { minWidth: 0, flex: 1 },
  commissionValue: { maxWidth: 118, alignItems: 'flex-end' },
  commissionStatus: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  commissionDetails: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  empty: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyIcon: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
