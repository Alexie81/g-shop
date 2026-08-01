import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { ServiceSheetStatus } from '@/types';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { ComponentProps } from 'react';
import { Image, StyleSheet, View } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];
type PublicRepairStatus = {
  propertyName: string;
  client: { name: string; firstName: string; status: string; updatedAt?: string };
  repair: null | {
    number: string;
    equipment: string;
    brand?: string;
    model?: string;
    reportedIssue?: string;
    status: ServiceSheetStatus;
    receivedAt?: string;
    estimatedAt?: string;
    completedAt?: string;
    updatedAt?: string;
  };
};

const STATUS: Record<ServiceSheetStatus, { label: string; description: string; icon: IconName; color: string; soft: string }> = {
  NEW: { label: 'Fișă creată', description: 'Fișa a fost creată și urmează verificarea.', icon: 'document-text-outline', color: palette.electric, soft: palette.electricLight },
  WAITING: { label: 'În așteptare', description: 'Echipamentul așteaptă preluarea de către echipa service.', icon: 'time-outline', color: palette.warning, soft: palette.warningSoft },
  VERIFYING: { label: 'În verificare', description: 'Echipamentul este verificat pentru stabilirea diagnosticului.', icon: 'search-outline', color: palette.purple, soft: '#F2EAFF' },
  IN_PROGRESS: { label: 'În lucru', description: 'Echipa lucrează în acest moment la reparație.', icon: 'construct-outline', color: palette.electric, soft: palette.electricLight },
  WAITING_PARTS: { label: 'Așteptăm piesele', description: 'Reparația este în curs și așteaptă piesele necesare.', icon: 'cube-outline', color: palette.warning, soft: palette.warningSoft },
  COMPLETED: { label: 'Reparație finalizată', description: 'Lucrarea este finalizată. Service-ul te va contacta pentru predare.', icon: 'checkmark-circle-outline', color: palette.success, soft: palette.successSoft },
  DELIVERED: { label: 'Echipament predat', description: 'Echipamentul reparat a fost predat clientului.', icon: 'shield-checkmark-outline', color: palette.success, soft: palette.successSoft },
  CANCELLED: { label: 'Reparație anulată', description: 'Lucrarea a fost anulată. Contactează service-ul pentru detalii.', icon: 'close-circle-outline', color: palette.danger, soft: palette.dangerSoft },
};

const STEPS = ['Înregistrat', 'Verificare', 'În lucru', 'Finalizat', 'Predat'];
const STEP_BY_STATUS: Record<ServiceSheetStatus, number> = {
  NEW: 0,
  WAITING: 0,
  VERIFYING: 1,
  IN_PROGRESS: 2,
  WAITING_PARTS: 2,
  COMPLETED: 3,
  DELIVERED: 4,
  CANCELLED: -1,
};

export default function PublicRepairTracking() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors, isDark } = useAppTheme();
  const info = useAsyncData(
    () => apiRequest<PublicRepairStatus>(`/public/client-form/${encodeURIComponent(token ?? '')}`, { authenticated: false }),
    [token],
  );

  if (info.loading) return <Screen style={styles.page}><Brand /><LoadingState rows={4} /></Screen>;
  if (info.error || !info.data) return <Screen style={styles.page}><Brand /><ErrorState message={info.error?.message ?? 'Linkul nu este disponibil.'} /><Button label="Încearcă din nou" icon="refresh-outline" onPress={() => void info.reload()} /></Screen>;

  const { client, propertyName, repair } = info.data;
  const status = repair ? STATUS[repair.status] : null;
  const equipment = repair ? [repair.brand, repair.model, repair.equipment].filter(Boolean).join(' · ') : '';

  return (
    <Screen refreshing={info.refreshing} onRefresh={() => void info.reload(true)} style={styles.page}>
      <Brand propertyName={propertyName} />

      <View style={[styles.privateNotice, { backgroundColor: isDark ? '#12243E' : '#EEF4FF', borderColor: colors.border }]}>
        <Ionicons name="lock-closed-outline" size={17} color={colors.primary} />
        <AppText variant="caption" style={styles.noticeText}>Link privat. Nu îl distribui altor persoane.</AppText>
      </View>

      <View style={[styles.hero, { backgroundColor: status?.color ?? colors.primary }]}>
        <View style={styles.heroTop}>
          <View style={styles.heroCopy}>
            <AppText variant="caption" style={styles.heroEyebrow}>STATUSUL REPARAȚIEI</AppText>
            <AppText variant="display" style={styles.heroTitle}>{status?.label ?? 'Client înregistrat'}</AppText>
            <AppText style={styles.heroDescription}>{status?.description ?? 'Fișa de service se pregătește. Revino în curând pentru actualizări.'}</AppText>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name={status?.icon ?? 'person-add-outline'} size={34} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.updatedRow}>
          <Ionicons name="sync-outline" size={15} color="#DCE8FF" />
          <AppText variant="caption" style={styles.updatedText}>Actualizat {formatDate(repair?.updatedAt ?? client.updatedAt, true)}</AppText>
        </View>
      </View>

      <Card style={styles.clientCard}>
        <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="person-outline" size={23} color={colors.primary} />
        </View>
        <View style={styles.clientCopy}>
          <AppText variant="caption" muted>CLIENT</AppText>
          <AppText variant="heading">{client.name}</AppText>
          {repair ? <AppText variant="caption" muted>Fișa {repair.number}</AppText> : null}
        </View>
      </Card>

      {repair ? (
        <>
          <Card style={styles.section}>
            <View style={styles.sectionTitle}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="hardware-chip-outline" size={21} color={colors.primary} /></View>
              <View style={styles.sectionCopy}><AppText variant="heading">Echipamentul tău</AppText><AppText variant="caption" muted>Informațiile lucrării curente</AppText></View>
            </View>
            <View style={[styles.infoBox, { backgroundColor: colors.surfaceMuted }]}>
              <AppText variant="label">{equipment || 'Echipament înregistrat'}</AppText>
              {repair.reportedIssue ? <AppText muted>{repair.reportedIssue}</AppText> : null}
            </View>
          </Card>

          <Card style={styles.section}>
            <View style={styles.sectionTitle}>
              <View style={[styles.sectionIcon, { backgroundColor: status?.soft }]}><Ionicons name="git-branch-outline" size={21} color={status?.color} /></View>
              <View style={styles.sectionCopy}><AppText variant="heading">Progresul reparației</AppText><AppText variant="caption" muted>Etapele sunt actualizate de service</AppText></View>
            </View>
            {repair.status === 'CANCELLED' ? (
              <View style={[styles.cancelled, { backgroundColor: isDark ? '#351722' : palette.dangerSoft }]}>
                <Ionicons name="alert-circle-outline" size={21} color={palette.danger} />
                <AppText style={styles.cancelledText}>Lucrarea este anulată. Pentru detalii, contactează unitatea service.</AppText>
              </View>
            ) : <Timeline current={STEP_BY_STATUS[repair.status]} />}
          </Card>

          <Card style={styles.datesCard}>
            <DateItem icon="calendar-outline" label="Primit în service" value={repair.receivedAt} />
            {repair.estimatedAt ? <DateItem icon="flag-outline" label="Termen estimat" value={repair.estimatedAt} /> : null}
            {repair.completedAt ? <DateItem icon="checkmark-done-outline" label="Finalizat" value={repair.completedAt} /> : null}
          </Card>
        </>
      ) : null}

      <Button label="Actualizează statusul" icon="refresh-outline" variant="secondary" loading={info.refreshing} onPress={() => void info.reload(true)} />
      <AppText variant="caption" muted style={styles.footer}>Datele sunt afișate direct din sistemul G-Shop al unității service.</AppText>
    </Screen>
  );
}

function Brand({ propertyName }: { propertyName?: string }) {
  return <View style={styles.brand}><Image source={require('@/logo/logo.png')} style={styles.logo} /><View style={styles.brandCopy}><AppText variant="title">G-Shop</AppText><AppText variant="caption" muted numberOfLines={1}>{propertyName ?? 'Urmărire reparație'}</AppText></View></View>;
}

function Timeline({ current }: { current: number }) {
  const { colors } = useAppTheme();
  return <View style={styles.timeline}>{STEPS.map((step, index) => {
    const reached = index <= current;
    return <View key={step} style={styles.step}>
      <View style={styles.stepRail}>
        <View style={[styles.stepDot, { backgroundColor: reached ? colors.primary : colors.surfaceMuted, borderColor: reached ? colors.primary : colors.border }]}>{reached ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}</View>
        {index < STEPS.length - 1 ? <View style={[styles.stepLine, { backgroundColor: index < current ? colors.primary : colors.border }]} /> : null}
      </View>
      <AppText variant="caption" style={[styles.stepLabel, { color: reached ? colors.text : colors.textMuted }]}>{step}</AppText>
    </View>;
  })}</View>;
}

function DateItem({ icon, label, value }: { icon: IconName; label: string; value?: string }) {
  const { colors } = useAppTheme();
  return <View style={styles.dateItem}><View style={[styles.dateIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name={icon} size={19} color={colors.primary} /></View><View style={styles.dateCopy}><AppText variant="caption" muted>{label}</AppText><AppText variant="label">{formatDate(value)}</AppText></View></View>;
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 720, gap: spacing.md, paddingHorizontal: spacing.md },
  brand: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: spacing.md, marginVertical: spacing.sm, maxWidth: '100%' },
  brandCopy: { flexShrink: 1 },
  logo: { width: 48, height: 48, borderRadius: 14 },
  privateNotice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  noticeText: { flexShrink: 1 },
  hero: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.xl, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroCopy: { flex: 1, gap: spacing.sm },
  heroEyebrow: { color: '#DCE8FF', fontWeight: '800', letterSpacing: 1.1 },
  heroTitle: { color: '#FFFFFF', fontSize: 28, lineHeight: 34 },
  heroDescription: { color: '#F2F6FF' },
  heroIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#FFFFFF20', alignItems: 'center', justifyContent: 'center' },
  updatedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  updatedText: { color: '#DCE8FF' },
  clientCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  clientCopy: { flex: 1, gap: 1 },
  section: { gap: spacing.lg },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1 },
  infoBox: { borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  timeline: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: spacing.sm },
  step: { flex: 1, alignItems: 'center' },
  stepRail: { width: '100%', alignItems: 'center', position: 'relative' },
  stepDot: { width: 25, height: 25, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  stepLine: { position: 'absolute', left: '50%', top: 11, width: '100%', height: 3 },
  stepLabel: { marginTop: spacing.sm, textAlign: 'center', fontSize: 10, lineHeight: 14 },
  cancelled: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderRadius: radius.md, padding: spacing.lg },
  cancelledText: { flex: 1 },
  datesCard: { gap: spacing.md },
  dateItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dateCopy: { flex: 1 },
  footer: { textAlign: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.xs },
});
