import { AppText } from '@/components/ui/AppText';
import { useAsyncData } from '@/hooks/useAsyncData';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { ServiceSheetStatus } from '@/types';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ComponentProps, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type IconName = ComponentProps<typeof Ionicons>['name'];
type PublicRepairDocumentType = 'INTAKE' | 'FINAL_ESTIMATE' | 'EXIT';
type PublicRepairDocument = {
  type: PublicRepairDocumentType;
  label: string;
  available: boolean;
  url?: string;
  generatedAt?: string;
};

type PublicRepairStatus = {
  propertyName: string;
  contact?: { phone?: string | null; email?: string | null };
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
    documents: PublicRepairDocument[];
  };
};

const DOCUMENT_SLOTS: { type: PublicRepairDocumentType; label: string; icon: IconName }[] = [
  { type: 'INTAKE', label: 'Fișă de intrare', icon: 'document-text-outline' },
  { type: 'FINAL_ESTIMATE', label: 'Deviz final', icon: 'receipt-outline' },
  { type: 'EXIT', label: 'Fișă de ieșire', icon: 'document-attach-outline' },
];

const STATUS: Record<ServiceSheetStatus, { label: string; description: string; icon: IconName; color: string; soft: string }> = {
  NEW: { label: 'Fișă creată', description: 'Am înregistrat echipamentul și fișa ta de service.', icon: 'document-text-outline', color: palette.electric, soft: '#EDF4FF' },
  WAITING: { label: 'În așteptare', description: 'Echipamentul așteaptă preluarea de către echipa tehnică.', icon: 'time-outline', color: palette.warning, soft: '#FFF6E5' },
  VERIFYING: { label: 'În verificare', description: 'Echipa verifică echipamentul și stabilește pașii următori.', icon: 'search-outline', color: palette.purple, soft: '#F4EDFF' },
  IN_PROGRESS: { label: 'În lucru', description: 'Reparația este în desfășurare. Echipa lucrează la echipamentul tău.', icon: 'construct-outline', color: palette.electric, soft: '#EDF4FF' },
  WAITING_PARTS: { label: 'Așteptăm piesele', description: 'Intervenția este pregătită și așteptăm piesele necesare.', icon: 'cube-outline', color: palette.warning, soft: '#FFF6E5' },
  COMPLETED: { label: 'Reparație finalizată', description: 'Echipamentul este pregătit pentru predare.', icon: 'checkmark-circle-outline', color: palette.success, soft: '#EAF9EF' },
  DELIVERED: { label: 'Echipament predat', description: 'Echipamentul a fost predat, iar lucrarea este încheiată.', icon: 'shield-checkmark-outline', color: palette.success, soft: '#EAF9EF' },
  CANCELLED: { label: 'Reparație anulată', description: 'Lucrarea a fost anulată. Contactează service-ul pentru detalii.', icon: 'close-circle-outline', color: palette.danger, soft: '#FFF0F2' },
};

const STEPS = [
  { title: 'Înregistrare', description: 'Fișa și echipamentul sunt înregistrate în service.' },
  { title: 'Diagnosticare', description: 'Echipa verifică echipamentul și stabilește intervenția.' },
  { title: 'Reparație', description: 'Echipa efectuează lucrarea necesară asupra echipamentului.' },
  { title: 'Așteptăm piesele', description: 'Dacă este necesar, așteptăm sosirea pieselor pentru a continua lucrarea.' },
  { title: 'Finalizare', description: 'Reparația este verificată și pregătită pentru predare.' },
  { title: 'Predare', description: 'Echipamentul este predat clientului și lucrarea se încheie.' },
];

const STEP_BY_STATUS: Record<ServiceSheetStatus, number> = { NEW: 0, WAITING: 0, VERIFYING: 1, IN_PROGRESS: 2, WAITING_PARTS: 3, COMPLETED: 4, DELIVERED: 5, CANCELLED: -1 };

export default function PublicRepairTracking() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const reveal = useRef(new Animated.Value(0)).current;
  const info = useAsyncData(
    () => apiRequest<PublicRepairStatus>(`/public/client-form/${encodeURIComponent(token ?? '')}`, { authenticated: false }),
    [token],
  );

  useEffect(() => {
    if (!info.data) return;
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 440, useNativeDriver: true }).start();
  }, [info.data, reveal]);

  if (info.loading) return <PublicState loading title="Se încarcă statusul" description="Preluăm cele mai noi informații direct din service." />;
  if (info.error || !info.data) return <PublicState title="Link indisponibil" description={info.error?.message ?? 'Statusul nu a putut fi încărcat.'} onRetry={() => void info.reload()} />;

  const { client, propertyName, repair, contact } = info.data;
  const status = repair ? STATUS[repair.status] : { label: 'Client înregistrat', description: 'Fișa de service se pregătește. Revino în curând pentru actualizări.', icon: 'person-add-outline' as IconName, color: palette.electric, soft: '#EDF4FF' };
  const equipment = repair ? [repair.brand, repair.model, repair.equipment].filter(Boolean).join(' · ') : '';
  const translateY = reveal.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const phone = contact?.phone?.trim() ?? '';
  const email = contact?.email?.trim() ?? '';

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
    <StatusBar style="dark" backgroundColor="#F5F7FB" />
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={info.refreshing} onRefresh={() => void info.reload(true)} tintColor={palette.electric} />}>
      <Brand propertyName={propertyName} />
      <Animated.View style={[styles.content, { opacity: reveal, transform: [{ translateY }] }]}>
        <View style={[styles.summary, { borderTopColor: status.color }]}>
          <View style={styles.summaryTop}><View style={[styles.statusIcon, { backgroundColor: status.soft }]}><Ionicons name={status.icon} size={27} color={status.color} /></View><View style={styles.summaryCopy}><AppText variant="caption" style={[styles.eyebrow, { color: status.color }]}>STATUSUL REPARAȚIEI</AppText><AppText variant="display" style={styles.summaryTitle}>{status.label}</AppText><AppText style={styles.summaryDescription}>{status.description}</AppText><View style={[styles.livePill, { backgroundColor: status.soft }]}><View style={[styles.liveDot, { backgroundColor: status.color }]} /><AppText variant="caption" style={{ color: status.color, fontWeight: '900' }}>{repair?.status === 'DELIVERED' ? 'Proces încheiat' : 'Actualizat în timp real'}</AppText></View></View></View>
          <View style={styles.summaryBottom}><View style={styles.clientMini}><View style={styles.avatar}><AppText variant="caption" style={styles.avatarText}>{initials(client.name)}</AppText></View><View style={styles.clientCopy}><AppText variant="label" numberOfLines={1}>{client.name}</AppText><AppText variant="caption" style={styles.muted}>{repair ? `Fișa ${repair.number}` : 'Fișă în curs de creare'}</AppText></View></View><View style={styles.updated}><AppText variant="caption" style={styles.updatedTitle}>Ultima actualizare</AppText><AppText variant="caption" style={styles.muted}>{formatDate(repair?.updatedAt ?? client.updatedAt, true)}</AppText></View></View>
        </View>

        {phone ? <QuickContact phone={phone} /> : null}

        {repair ? <>
          <View style={styles.card}>
            <SectionTitle icon="git-branch-outline" title="Parcursul reparației" description="Etapa curentă și ce urmează în continuare" />
            {repair.status === 'CANCELLED' ? <View style={styles.cancelled}><Ionicons name="alert-circle-outline" size={22} color={palette.danger} /><AppText style={styles.cancelledText}>Lucrarea a fost anulată. Contactează unitatea service pentru mai multe detalii.</AppText></View> : <VerticalTimeline current={STEP_BY_STATUS[repair.status]} currentLabel={status.label} color={status.color} soft={status.soft} />}
          </View>

          <View style={styles.card}>
            <SectionTitle icon="desktop-outline" title="Echipamentul tău" description="Detaliile lucrării curente" />
            <View style={styles.equipmentBox}><AppText variant="label">{equipment || 'Echipament înregistrat'}</AppText>{repair.reportedIssue ? <AppText style={styles.equipmentIssue}>{repair.reportedIssue}</AppText> : null}</View>
            <View style={styles.metaGrid}><Meta label="PRIMIT ÎN SERVICE" value={formatDate(repair.receivedAt)} /><Meta label="TERMEN ESTIMAT" value={repair.estimatedAt ? formatDate(repair.estimatedAt) : 'În curs de stabilire'} /><Meta label="FINALIZAT" value={repair.completedAt ? formatDate(repair.completedAt) : '—'} /></View>
          </View>

          {(repair.documents ?? []).some((document) => document.available && document.url?.trim()) ? <RepairDocuments documents={repair.documents ?? []} /> : null}
        </> : null}

        {phone || email ? <ContactCard propertyName={propertyName} phone={phone} email={email} /> : null}
        <Pressable accessibilityRole="button" onPress={() => void info.reload(true)} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}><Ionicons name="refresh-outline" size={19} color={palette.electric} /><AppText variant="label" style={styles.refreshText}>{info.refreshing ? 'Se actualizează…' : 'Actualizează statusul'}</AppText></Pressable>
        <AppText variant="caption" style={styles.footer}>Date actualizate direct din sistemul G-Shop al unității service.{`\n`}Acest link este privat și destinat exclusiv clientului.</AppText>
      </Animated.View>
    </ScrollView>
  </SafeAreaView>;
}

function Brand({ propertyName }: { propertyName?: string }) {
  return <View style={styles.topbar}><View style={styles.brand}><View style={styles.logoFrame}><View style={styles.logoCrop}><Image source={require('@/logo/logo.png')} resizeMode="cover" style={styles.logo} /></View></View><View style={styles.brandCopy}><AppText variant="heading">G-Shop</AppText><AppText variant="caption" style={styles.muted} numberOfLines={1}>{propertyName ?? 'Urmărire reparație'}</AppText></View></View><View style={styles.secure}><Ionicons name="lock-closed-outline" size={14} color={palette.electric} /><AppText variant="caption" style={styles.secureText}>Link privat</AppText></View></View>;
}

function SectionTitle({ icon, title, description }: { icon: IconName; title: string; description: string }) {
  return <View style={styles.sectionTitle}><View style={styles.sectionIcon}><Ionicons name={icon} size={21} color={palette.electric} /></View><View style={styles.sectionCopy}><AppText variant="heading">{title}</AppText><AppText variant="caption" style={styles.muted}>{description}</AppText></View></View>;
}

function VerticalTimeline({ current, currentLabel, color, soft }: { current: number; currentLabel: string; color: string; soft: string }) {
  const entries = useRef(STEPS.map(() => new Animated.Value(0))).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    entries.forEach((entry) => entry.setValue(0));
    const entrance = Animated.stagger(85, entries.map((entry) => Animated.spring(entry, { toValue: 1, damping: 18, stiffness: 180, mass: 0.75, useNativeDriver: true })));
    const heartbeat = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true })]));
    entrance.start();
    heartbeat.start();
    return () => { entrance.stop(); heartbeat.stop(); };
  }, [current, entries, pulse]);
  const activeScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] });
  return <View style={styles.timeline}>{STEPS.map((step, index) => {
    const done = index < current;
    const active = index === current;
    const entryStyle = { opacity: entries[index], transform: [{ translateY: entries[index].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] };
    return <Animated.View key={step.title} style={[styles.timelineStep, entryStyle]}><View style={styles.marker}>{active ? <Animated.View style={[styles.dot, { backgroundColor: '#fff', borderColor: color, shadowColor: color, transform: [{ scale: activeScale }] }]}><AppText variant="caption" style={{ color, fontWeight: '900' }}>{index + 1}</AppText></Animated.View> : <View style={[styles.dot, done && styles.dotDone]}>{done ? <Ionicons name="checkmark" size={15} color="#fff" /> : <AppText variant="caption" style={{ color: '#91A0B4', fontWeight: '900' }}>{index + 1}</AppText>}</View>}{index < STEPS.length - 1 ? <View style={[styles.line, done && styles.lineDone, active && { backgroundColor: soft }]} /> : null}</View><View style={[styles.stepContent, active && { backgroundColor: soft, borderColor: `${color}35` }, index > current && styles.future]}><View style={styles.stepTop}><AppText variant="label" style={active ? { color } : undefined}>{step.title}</AppText><View style={[styles.stepBadge, done && styles.doneBadge, active && { backgroundColor: color }]}><AppText variant="caption" style={[styles.stepBadgeText, done && styles.doneBadgeText, active && styles.activeBadgeText]}>{done ? 'Finalizat' : active ? currentLabel : 'Urmează'}</AppText></View></View><AppText variant="caption" style={styles.stepDescription}>{step.description}</AppText></View></Animated.View>;
  })}</View>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={styles.meta}><AppText variant="caption" style={styles.metaLabel}>{label}</AppText><AppText variant="caption" style={styles.metaValue}>{value}</AppText></View>;
}

function RepairDocuments({ documents }: { documents: PublicRepairDocument[] }) {
  const availableDocuments = DOCUMENT_SLOTS.flatMap((slot) => {
    const document = documents.find((item) => item.type === slot.type);
    return document?.available === true && document.url?.trim() ? [{ slot, document }] : [];
  });
  return <View style={styles.card}>
    <SectionTitle icon="documents-outline" title="Documentele reparației" description="Documente disponibile pentru această reparație" />
    <View style={styles.documentList}>{availableDocuments.map(({ slot, document }) => {
      const url = document.url!.trim();
      const label = document.label?.trim() || slot.label;
      const meta = document.generatedAt ? `Disponibil · ${formatDate(document.generatedAt, true)}` : 'PDF disponibil';
      return <Pressable
        key={slot.type}
        accessibilityRole="link"
        accessibilityLabel={`${label}. ${meta}`}
        onPress={() => void Linking.openURL(url)}
        style={({ pressed }) => [styles.documentItem, pressed && styles.pressed]}
      >
        <View style={styles.documentIcon}><Ionicons name={slot.icon} size={21} color={palette.electric} /></View>
        <View style={styles.documentCopy}><AppText variant="label" numberOfLines={1}>{label}</AppText><AppText variant="caption" style={styles.documentMeta}>{meta}</AppText></View>
        <View style={styles.documentBadge}><AppText variant="caption" style={styles.documentBadgeText}>Deschide</AppText></View>
        <Ionicons name="chevron-forward" size={18} color={palette.electric} />
      </Pressable>;
    })}</View>
  </View>;
}

function ContactCard({ propertyName, phone, email }: { propertyName: string; phone: string; email: string }) {
  const call = () => phone && Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
  const whatsapp = () => {
    const normalized = normalizeWhatsApp(phone);
    if (normalized) void Linking.openURL(`https://wa.me/${normalized}?text=${encodeURIComponent('Bună ziua! Vă contactez în legătură cu statusul reparației mele.')}`);
  };
  return <View style={styles.contact}><SectionTitle icon="call-outline" title="Ai nevoie de ajutor?" description={`Intră rapid în legătură cu echipa ${propertyName}.`} /><View style={styles.contactActions}>{phone ? <Pressable accessibilityRole="button" onPress={() => void call()} style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}><Ionicons name="call-outline" size={20} color="#fff" /><AppText variant="label" style={styles.callText}>Sună G-Shop acum</AppText></Pressable> : null}{phone ? <Pressable accessibilityRole="button" onPress={whatsapp} style={({ pressed }) => [styles.whatsappButton, pressed && styles.pressed]}><Ionicons name="logo-whatsapp" size={20} color="#129748" /><AppText variant="label" style={styles.whatsappText}>WhatsApp</AppText></Pressable> : null}{email ? <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(`mailto:${email}?subject=${encodeURIComponent('Întrebare despre statusul reparației')}`)} style={({ pressed }) => [styles.emailButton, pressed && styles.pressed]}><Ionicons name="mail-outline" size={19} color="#315170" /><AppText variant="label" style={styles.emailText}>Trimite un email</AppText></Pressable> : null}</View></View>;
}

function QuickContact({ phone }: { phone: string }) {
  const tel = phone.replace(/[^\d+]/g, '');
  const whatsapp = normalizeWhatsApp(phone);
  return <View style={styles.quickContact}><Pressable accessibilityRole="button" onPress={() => void Linking.openURL(`tel:${tel}`)} style={({ pressed }) => [styles.quickCall, pressed && styles.pressed]}><Ionicons name="call-outline" size={19} color="#fff" /><AppText variant="label" style={styles.callText}>Sună acum</AppText></Pressable><Pressable accessibilityRole="button" onPress={() => void Linking.openURL(`https://wa.me/${whatsapp}?text=${encodeURIComponent('Bună ziua! Vă contactez în legătură cu statusul reparației mele.')}`)} style={({ pressed }) => [styles.quickWhatsApp, pressed && styles.pressed]}><Ionicons name="logo-whatsapp" size={20} color="#fff" /><AppText variant="label" style={styles.callText}>WhatsApp</AppText></Pressable></View>;
}

function PublicState({ loading = false, title, description, onRetry }: { loading?: boolean; title: string; description: string; onRetry?: () => void }) {
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" backgroundColor="#F5F7FB" /><View style={styles.statePage}><Brand /><View style={styles.stateCard}><View style={styles.stateIcon}>{loading ? <ActivityIndicator color={palette.electric} /> : <Ionicons name="cloud-offline-outline" size={30} color={palette.electric} />}</View><AppText variant="title" style={styles.center}>{title}</AppText><AppText style={[styles.muted, styles.center]}>{description}</AppText>{onRetry ? <Pressable onPress={onRetry} style={styles.refresh}><Ionicons name="refresh-outline" size={19} color={palette.electric} /><AppText variant="label" style={styles.refreshText}>Încearcă din nou</AppText></Pressable> : null}</View></View></SafeAreaView>;
}

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'GS'; }
function normalizeWhatsApp(value: string) { let digits = value.replace(/\D/g, ''); if (digits.startsWith('00')) digits = digits.slice(2); if (digits.startsWith('0')) digits = `40${digits.slice(1)}`; return digits; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FB' }, page: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: spacing.md, paddingBottom: 44 }, content: { gap: spacing.md },
  topbar: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xs, paddingBottom: spacing.md }, brand: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, brandCopy: { minWidth: 0, flex: 1 }, logoFrame: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE6F3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: '#17305A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 }, logoCrop: { width: 42, height: 42, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, logo: { width: 42, height: 42, transform: [{ scale: 2.04 }] }, secure: { height: 34, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: '#DCE6F5', backgroundColor: '#fff' }, secureText: { color: '#52617A', fontWeight: '800' }, muted: { color: '#67758D' },
  summary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E9F2', borderTopWidth: 4, borderRadius: radius.xl, padding: spacing.xl, shadowColor: '#182E54', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 4 }, summaryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, statusIcon: { width: 56, height: 56, flexShrink: 0, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, summaryCopy: { minWidth: 0, flex: 1 }, eyebrow: { fontWeight: '900', letterSpacing: 1, marginBottom: spacing.xs }, summaryTitle: { color: '#071534', fontSize: 27, lineHeight: 32, marginBottom: spacing.sm }, summaryDescription: { color: '#67758D', fontSize: 13, lineHeight: 20 }, livePill: { minHeight: 31, alignSelf: 'flex-start', marginTop: spacing.md, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, liveDot: { width: 7, height: 7, borderRadius: 4 }, summaryBottom: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: '#E3E9F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, clientMini: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, avatar: { width: 39, height: 39, borderRadius: 14, backgroundColor: palette.electric, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontWeight: '900' }, clientCopy: { minWidth: 0, flex: 1 }, updated: { alignItems: 'flex-end' }, updatedTitle: { color: '#071534', fontWeight: '800' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E9F2', borderRadius: radius.xl, padding: spacing.xl, shadowColor: '#182E54', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 3 }, sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }, sectionIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#EDF4FF', alignItems: 'center', justifyContent: 'center' }, sectionCopy: { minWidth: 0, flex: 1 },
  timeline: {}, timelineStep: { minHeight: 92, flexDirection: 'row', gap: spacing.sm }, marker: { width: 40, alignItems: 'center' }, dot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#E3E9F2', backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center', zIndex: 2, shadowOpacity: 0.18, shadowRadius: 8 }, dotDone: { backgroundColor: palette.success, borderColor: palette.success }, line: { position: 'absolute', top: 30, bottom: -2, width: 2, backgroundColor: '#E3E9F2' }, lineDone: { backgroundColor: palette.success }, stepContent: { minWidth: 0, flex: 1, marginBottom: spacing.sm, padding: spacing.sm, paddingTop: spacing.xs, borderWidth: 1, borderColor: 'transparent', borderRadius: radius.lg }, future: { opacity: 0.62 }, stepTop: { minHeight: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, stepBadge: { minHeight: 25, borderRadius: radius.pill, paddingHorizontal: spacing.sm, backgroundColor: '#F1F4F8', alignItems: 'center', justifyContent: 'center' }, stepBadgeText: { color: '#8694A8', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, doneBadge: { backgroundColor: '#EAF9EF' }, doneBadgeText: { color: palette.success }, activeBadgeText: { color: '#fff' }, stepDescription: { color: '#67758D', lineHeight: 17, marginTop: spacing.xs }, cancelled: { flexDirection: 'row', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, backgroundColor: '#FFF0F2' }, cancelledText: { minWidth: 0, flex: 1, color: '#071534' },
  equipmentBox: { borderWidth: 1, borderColor: '#E3E9F2', backgroundColor: '#F8FAFD', borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm }, equipmentIssue: { color: '#67758D', lineHeight: 20 }, metaGrid: { marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, meta: { minWidth: 125, flex: 1, minHeight: 66, borderRadius: radius.md, backgroundColor: '#F5F7FB', padding: spacing.sm }, metaLabel: { color: '#7B8799', fontSize: 9, fontWeight: '800', marginBottom: spacing.xs }, metaValue: { color: '#071534', fontWeight: '900' },
  documentList: { gap: spacing.sm }, documentItem: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: '#CFE1F6', borderRadius: radius.lg, backgroundColor: '#F2F8FF' }, documentItemUnavailable: { borderColor: '#E3E8EF', backgroundColor: '#F7F9FC' }, documentIcon: { width: 42, height: 42, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, documentIconUnavailable: { backgroundColor: '#EEF2F6' }, documentCopy: { minWidth: 0, flex: 1 }, documentMeta: { marginTop: 3, color: '#718096', fontSize: 10 }, documentBadge: { minHeight: 26, borderRadius: radius.pill, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, documentBadgeUnavailable: { backgroundColor: '#E9EDF2' }, documentBadgeText: { color: palette.electric, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, documentBadgeTextUnavailable: { color: '#718096' },
  contact: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE7F7', borderRadius: radius.xl, padding: spacing.xl, shadowColor: '#182E54', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 3 }, contactActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, callButton: { minHeight: 52, minWidth: 190, flexGrow: 1.35, borderRadius: radius.lg, backgroundColor: palette.electric, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md }, callText: { color: '#fff' }, whatsappButton: { minHeight: 52, minWidth: 130, flexGrow: 1, borderRadius: radius.lg, backgroundColor: '#EAFBF1', borderWidth: 1, borderColor: '#CCEFDA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md }, whatsappText: { color: '#129748' }, emailButton: { minHeight: 50, width: '100%', borderRadius: radius.lg, backgroundColor: '#F0F4FA', borderWidth: 1, borderColor: '#E3E9F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, emailText: { color: '#315170' },
  quickContact: { padding: 5, borderWidth: 1, borderColor: '#E3E9F2', borderRadius: 20, backgroundColor: '#fff', flexDirection: 'row', gap: spacing.sm, shadowColor: '#182E54', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 }, quickCall: { minWidth: 0, flex: 1, minHeight: 50, borderRadius: radius.lg, backgroundColor: palette.electric, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, quickWhatsApp: { minWidth: 0, flex: 1, minHeight: 50, borderRadius: radius.lg, backgroundColor: '#18B75B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  refresh: { minHeight: 51, borderRadius: radius.lg, borderWidth: 1, borderColor: '#D8E5FA', backgroundColor: '#EEF4FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md }, refreshText: { color: palette.electric }, pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] }, footer: { color: '#8794A7', textAlign: 'center', lineHeight: 16, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  statePage: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', padding: spacing.md }, stateCard: { minHeight: 330, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E9F2', borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }, stateIcon: { width: 68, height: 68, borderRadius: 23, backgroundColor: '#EDF4FF', alignItems: 'center', justifyContent: 'center' }, center: { textAlign: 'center' },
});
