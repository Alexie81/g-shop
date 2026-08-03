import { QRChart } from '@/components/dashboard/QRChart';
import { CollaboratorFinanceSheet } from '@/components/dashboard/CollaboratorFinanceSheet';
import { QuickAction } from '@/components/dashboard/QuickAction';
import { StatCard } from '@/components/dashboard/StatCard';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ErrorState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { dashboardRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { formatCurrency, formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

export default function DashboardScreen() {
  const { user } = useAuth(); const { activeProperty } = useProperty(); const propertyId = activeProperty?.id ?? '';
  const { colors } = useAppTheme();
  const [financeOpen, setFinanceOpen] = useState(false);
  const [heroHeight, setHeroHeight] = useState(164);
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  const { width } = useWindowDimensions();
  const statColumns = width < 600 ? 2 : width < 950 ? 3 : 6;
  const actionColumns = width < 750 ? 2 : 4;
  const statCardBasis = statColumns === 3 ? 170 : 150;
  const actionCardBasis = actionColumns === 4 ? 145 : 150;
  const state = useAsyncData(async () => { const [metrics, sheets] = await Promise.all([dashboardRepository.get(propertyId), serviceSheetRepository.list(propertyId)]); return { metrics, sheets: sheets.data.slice(0, 3) }; }, [propertyId]);
  useRefreshOnFocus(() => {
    setLocalHour(new Date().getHours());
    return state.reload(true);
  }, state.loading || state.refreshing);
  useEffect(() => {
    const updateLocalHour = () => setLocalHour(new Date().getHours());
    const timer = setInterval(updateLocalHour, 60_000);
    return () => clearInterval(timer);
  }, []);
  const greeting = localHour < 12 ? 'Bună dimineața' : localHour < 18 ? 'Bună ziua' : 'Bună seara';
  if (state.loading) return <DashboardSkeleton />;
  if (state.error || !state.data) return <Screen header={<AppHeader />}><ErrorState message={state.error?.message ?? 'Date indisponibile.'} onRetry={() => void state.reload()} /></Screen>;
  const { metrics, sheets } = state.data;
  return <Screen header={<AppHeader />} scroll={false} bottomInset={false} style={styles.screen}>
    <View style={styles.dashboardRoot}>
      <LinearGradient onLayout={(event) => { const nextHeight = event.nativeEvent.layout.height; if (Math.abs(nextHeight - heroHeight) > 1) setHeroHeight(nextHeight); }} colors={['#082376', '#075CFF', '#0D78FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, styles.fixedHero]}><View style={styles.heroCopy}><AppText variant="title" style={{ color: '#fff' }}>{greeting}, {user?.firstName}! <AppText variant="title" style={styles.wave}>👋</AppText></AppText><AppText style={{ color: '#DDE8FF' }}>Ai control complet asupra activității din {activeProperty?.name}.</AppText></View><View style={styles.heroGraphic}><Ionicons name="analytics" size={74} color="#8CB7FF" /></View></LinearGradient>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: heroHeight + spacing.xs }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.reload(true)} tintColor={colors.primary} />}>
        <View style={[styles.dashboardSheet, { backgroundColor: colors.background, shadowColor: colors.shadow }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
    <View style={[styles.section, styles.firstSection]}>
      <DashboardSectionTitle title="Privire de ansamblu" subtitle="Indicatorii esențiali ai proprietății" icon="grid-outline" />
      <View style={styles.stats}>
        <StatCard style={{ flexGrow: 1, flexBasis: statCardBasis }} label="Total clienți" value={metrics.clientsTotal} icon="people-outline" color={palette.electric} helper={`+${metrics.clientsNew} noi`} />
        <StatCard style={{ flexGrow: 1, flexBasis: statCardBasis }} label="Clienți în așteptare" value={metrics.clientsWaiting} icon="time-outline" color={palette.warning} />
        <StatCard style={{ flexGrow: 1, flexBasis: statCardBasis }} label="G-Shop Net" value={formatCurrency(metrics.gshopNet)} icon="wallet-outline" color={palette.purple} />
        <StatCard style={{ flexGrow: 1, flexBasis: statCardBasis }} label="Venituri on hold" value={formatCurrency(metrics.revenueOnHold)} icon="hourglass-outline" color={palette.warning} />
        <StatCard style={{ flexGrow: 1, flexBasis: statCardBasis }} label="Total încasări" value={formatCurrency(metrics.totalRevenue)} icon="cash-outline" color={palette.success} />
        <StatCard style={{ flexGrow: 1, flexBasis: statCardBasis }} label="Total cheltuieli" value={formatCurrency(metrics.totalExpenses)} icon="receipt-outline" color={palette.warning} helper="Costuri interne + comisioane achitate" />
        <StatCard
          style={{ flexGrow: 1, flexBasis: statCardBasis }}
          label="Total colaboratori"
          value={formatCurrency(metrics.collaboratorTotal)}
          icon="people-circle-outline"
          color={palette.cyan}
          helper="Ține apăsat"
          helperIcon="finger-print-outline"
          onLongPress={() => setFinanceOpen(true)}
        />
      </View>
    </View>
    <View style={styles.section}>
      <DashboardSectionTitle title="Acțiuni rapide" subtitle="Ajungi imediat la comenzile folosite frecvent" icon="flash-outline" />
      <View style={styles.actions}>
        <QuickAction style={{ flexGrow: 1, flexBasis: actionCardBasis }} label="Adaugă client" icon="person-add-outline" onPress={() => router.push('/service/clients/create')} />
        <QuickAction style={{ flexGrow: 1, flexBasis: actionCardBasis }} label="Fișe de service" icon="document-text-outline" accent={palette.purple} onPress={() => router.push('/service/service-sheets')} />
        <QuickAction style={{ flexGrow: 1, flexBasis: actionCardBasis }} label="Scanează QR" icon="scan-outline" accent={palette.success} onPress={() => router.push('/service/qr-scanner')} />
        <QuickAction style={{ flexGrow: 1, flexBasis: actionCardBasis }} label="Colaboratori" icon="people-circle-outline" accent={palette.cyan} onPress={() => router.push('/service/collaborators')} />
      </View>
    </View>
    <View style={[styles.columns, styles.lowerSection]}>
      <Card style={styles.panel}><SectionHeader title="Activitate QR azi" action="Vezi clienții" onAction={() => router.push('/service/clients')} /><QRChart generated={metrics.qrGenerated} used={metrics.qrUsed} /><AppText variant="caption" style={{ color: palette.success, textAlign: 'right' }}>↗ actualizat în timp real</AppText></Card>
      <Card style={styles.panel}><SectionHeader title="Fișe de service recente" action="Vezi toate" onAction={() => router.push('/service/service-sheets')} />{sheets.length ? sheets.map((sheet) => <View key={sheet.id} style={styles.sheetRow}><View style={{ flex: 1 }}><AppText variant="label">{sheet.number} · {sheet.equipment}</AppText><AppText variant="caption" muted>{sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName}` : 'Client'} · {formatDate(sheet.receivedAt)}</AppText></View><AppText variant="label" style={{ color: palette.electric }}>{formatCurrency(sheet.totalCost)}</AppText></View>) : <AppText muted>Nu există fișe recente.</AppText>}</Card>
    </View>
        </View>
      </ScrollView>
    <CollaboratorFinanceSheet visible={financeOpen} propertyId={propertyId} onClose={() => setFinanceOpen(false)} onChanged={() => void state.reload(true)} />
    </View>
  </Screen>;
}

function DashboardSkeleton() {
  const { colors } = useAppTheme();
  return <Screen header={<AppHeader />} scroll={false} bottomInset={false} style={styles.screen}>
    <View style={styles.dashboardRoot}>
      <LinearGradient colors={['#082376', '#075CFF', '#0D78FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, styles.fixedHero]}>
        <View style={styles.skeletonHeroCopy}>
          <View style={styles.skeletonHeroTitle} />
          <View style={styles.skeletonHeroSubtitle} />
        </View>
        <View style={styles.skeletonHeroGraphic}><Ionicons name="analytics-outline" size={52} color="#A8C7FF" /></View>
      </LinearGradient>
      <View style={[styles.skeletonSheet, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        <View style={styles.skeletonHeading}>
          <View style={[styles.skeletonHeadingIcon, { backgroundColor: colors.primarySoft }]} />
          <View style={styles.skeletonHeadingCopy}>
            <View style={[styles.skeletonLine, styles.skeletonLineTitle, { backgroundColor: colors.surfaceMuted }]} />
            <View style={[styles.skeletonLine, styles.skeletonLineSubtitle, { backgroundColor: colors.surfaceMuted }]} />
          </View>
        </View>
        <View style={styles.skeletonGrid}>{Array.from({ length: 6 }, (_, index) => <View key={index} style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.skeletonCardIcon, { backgroundColor: colors.surfaceMuted }]} />
          <View style={[styles.skeletonLine, styles.skeletonValue, { backgroundColor: colors.surfaceMuted }]} />
          <View style={[styles.skeletonLine, styles.skeletonLabel, { backgroundColor: colors.surfaceMuted }]} />
        </View>)}</View>
      </View>
    </View>
  </Screen>;
}

function DashboardSectionTitle({ title, subtitle, icon }: { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }) {
  const { colors, isDark } = useAppTheme();
  return <View style={styles.sectionHeading}>
    <View style={[styles.sectionIcon, { backgroundColor: isDark ? `${colors.primary}22` : colors.primarySoft }]}><Ionicons name={icon} size={18} color={colors.primary} /></View>
    <View style={styles.sectionCopy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>{subtitle}</AppText></View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 0, paddingBottom: 0 },
  dashboardRoot: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollContent: {},
  dashboardSheet: { minHeight: 720, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 112, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  sheetHandle: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginBottom: spacing.sm },
  hero: { minHeight: 164, borderRadius: radius.xl, padding: spacing.xxl, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  fixedHero: { position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg },
  heroCopy: { flex: 1, gap: spacing.sm, maxWidth: 620 },
  wave: { color: '#FFD75C', fontSize: 30, lineHeight: 34 },
  heroGraphic: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#FFFFFF16', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  skeletonHeroCopy: { flex: 1, gap: spacing.md },
  skeletonHeroTitle: { width: '56%', maxWidth: 270, height: 24, borderRadius: radius.pill, backgroundColor: '#FFFFFFD9' },
  skeletonHeroSubtitle: { width: '78%', maxWidth: 430, height: 14, borderRadius: radius.pill, backgroundColor: '#FFFFFF70' },
  skeletonHeroGraphic: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FFFFFF16', alignItems: 'center', justifyContent: 'center' },
  skeletonSheet: { position: 'absolute', top: 174, left: 0, right: 0, bottom: 0, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: spacing.lg, gap: spacing.lg },
  skeletonHeading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skeletonHeadingIcon: { width: 38, height: 38, borderRadius: radius.md },
  skeletonHeadingCopy: { flex: 1, gap: spacing.sm },
  skeletonLine: { borderRadius: radius.pill },
  skeletonLineTitle: { width: 170, height: 15 },
  skeletonLineSubtitle: { width: 230, maxWidth: '72%', height: 10 },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  skeletonCard: { flexGrow: 1, flexBasis: 150, minWidth: 138, height: 132, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  skeletonCardIcon: { width: 38, height: 38, borderRadius: radius.md },
  skeletonValue: { width: '58%', height: 18 },
  skeletonLabel: { width: '76%', height: 10 },
  section: { gap: spacing.lg, marginTop: spacing.xxxl },
  firstSection: { marginTop: spacing.sm },
  sectionHeading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { minWidth: 0, flex: 1, gap: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  lowerSection: { marginTop: spacing.xxxl },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  panel: { minWidth: 290, flex: 1, gap: spacing.lg },
  sheetRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#8090A040' },
});
