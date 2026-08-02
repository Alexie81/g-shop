import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useBackToAdministration } from '@/hooks/useBackToAdministration';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { auditRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { AuditLog } from '@/types';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

type DeleteMode = 'selected' | 'all' | null;

const actionMeta = (action: string) => {
  if (action.includes('DELETE') || action.includes('CLEARED')) return { icon: 'trash-outline' as const, color: palette.danger, label: 'Ștergere' };
  if (action.includes('LOGIN') || action.includes('LOGOUT')) return { icon: 'log-in-outline' as const, color: palette.purple, label: 'Sesiune' };
  if (action.includes('CREATE') || action.includes('GENERATED')) return { icon: 'add-circle-outline' as const, color: palette.success, label: 'Creare' };
  if (action.includes('SHARE') || action.includes('SENT') || action.includes('USED')) return { icon: 'paper-plane-outline' as const, color: palette.cyan, label: 'Trimitere' };
  return { icon: 'create-outline' as const, color: palette.electric, label: 'Modificare' };
};

export default function AuditScreen() {
  useBackToAdministration();
  const { user } = useAuth();
  const { activeProperty } = useProperty();
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteMode, setDeleteMode] = useState<DeleteMode>(null);
  const [deleting, setDeleting] = useState(false);
  const state = useAsyncData(() => auditRepository.list(activeProperty?.id), [activeProperty?.id]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);
  const allRows = useMemo(() => state.data?.data ?? [], [state.data?.data]);
  const rows = useMemo(() => allRows.filter((item) => `${item.userName} ${item.action} ${item.module} ${item.summary}`.toLocaleLowerCase('ro-RO').includes(query.trim().toLocaleLowerCase('ro-RO'))), [allRows, query]);
  const usersCount = useMemo(() => new Set(allRows.map((item) => item.userName || 'Sistem')).size, [allRows]);
  const isAdmin = user?.role === 'ADMIN';

  const toggleSelectionMode = () => { setSelectionMode((current) => !current); setSelected(new Set()); setExpanded(null); };
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAllVisible = () => setSelected((current) => current.size === rows.length ? new Set() : new Set(rows.map((item) => item.id)));
  const remove = async () => {
    if (!deleteMode || !activeProperty) return;
    const ids = deleteMode === 'selected' ? [...selected] : undefined;
    if (deleteMode === 'selected' && !ids?.length) return;
    setDeleting(true);
    try {
      const result = await auditRepository.remove(activeProperty.id, ids);
      showToast(`${result.deleted} înregistrări au fost șterse.`, 'success');
      setDeleteMode(null); setSelectionMode(false); setSelected(new Set()); setExpanded(null);
      await state.reload(true);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Jurnalul nu a putut fi actualizat.', 'error'); }
    finally { setDeleting(false); }
  };

  return <Screen header={<AppHeader title="Istoric modificări" back onBack={() => router.replace('/service/more')} />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <View style={styles.stack}>
      <LinearGradient colors={isDark ? ['#102866', '#075CFF'] : ['#123EA9', '#0878FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View pointerEvents="none" style={styles.heroOrb} />
        <View style={styles.heroHeading}><View style={styles.heroIcon}><Ionicons name="shield-checkmark-outline" size={27} color="#FFFFFF" /></View><View style={styles.heroCopy}><AppText variant="caption" style={styles.eyebrow}>ACTIVITATE ȘI SECURITATE</AppText><AppText variant="title" style={styles.heroTitle}>Jurnalul proprietății</AppText><AppText variant="caption" style={styles.heroProperty} numberOfLines={1}>{activeProperty?.name}</AppText></View></View>
        <View style={styles.heroMetrics}><HeroMetric icon="time-outline" value={allRows.length} label="evenimente" /><View style={styles.heroDivider} /><HeroMetric icon="people-outline" value={usersCount} label="utilizatori" /></View>
      </LinearGradient>

      <Card style={styles.toolbar} elevated>
        <View style={styles.titleRow}><View style={[styles.titleIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="list-outline" size={21} color={colors.primary} /></View><View style={styles.titleCopy}><AppText variant="heading">Activitate înregistrată</AppText><AppText variant="caption" muted>{rows.length} rezultate · fiecare acțiune este asociată utilizatorului</AppText></View>{isAdmin ? <Pressable accessibilityRole="button" accessibilityLabel={selectionMode ? 'Închide selecția' : 'Selectează înregistrări pentru ștergere'} onPress={toggleSelectionMode} style={({ pressed }) => [styles.deleteToggle, { backgroundColor: selectionMode ? palette.danger : (isDark ? '#401722' : palette.dangerSoft), opacity: pressed ? 0.72 : 1 }]}><Ionicons name={selectionMode ? 'close' : 'trash-outline'} size={21} color={selectionMode ? '#FFFFFF' : palette.danger} /></Pressable> : null}</View>
        <View style={[styles.search, { backgroundColor: colors.input, borderColor: colors.border }]}><Ionicons name="search-outline" size={20} color={colors.textMuted} /><TextInput value={query} onChangeText={setQuery} placeholder="Caută utilizator, acțiune sau modul…" placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.text }]} />{query ? <Pressable accessibilityRole="button" accessibilityLabel="Șterge căutarea" onPress={() => setQuery('')} style={styles.clearSearch}><Ionicons name="close-circle" size={20} color={colors.textMuted} /></Pressable> : null}</View>
      </Card>

      {selectionMode ? <Card style={[styles.selectionBar, { borderColor: `${palette.danger}35`, backgroundColor: isDark ? '#15111A' : '#FFFFFF' }]}>
        <View style={styles.selectionInfo}>
          <View style={[styles.selectionIcon, { backgroundColor: isDark ? '#401722' : palette.dangerSoft }]}><Ionicons name="checkbox-outline" size={20} color={palette.danger} /></View>
          <View style={styles.selectionCopy}><AppText variant="label">{selected.size} selectate</AppText><AppText variant="caption" muted>Atinge intrările pe care vrei să le elimini.</AppText></View>
          <Pressable accessibilityRole="button" onPress={toggleAllVisible} style={({ pressed }) => [styles.selectVisible, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.72 : 1 }]}><Ionicons name="checkmark-done-outline" size={17} color={colors.primary} /><AppText variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>{selected.size === rows.length && rows.length ? 'Deselectează' : 'Selectează afișate'}</AppText></Pressable>
        </View>
        <View style={styles.selectionActions}><AuditDeleteButton label="Șterge selectate" icon="trash-outline" disabled={!selected.size} onPress={() => setDeleteMode('selected')} subtle /><AuditDeleteButton label="Șterge tot jurnalul" icon="trash-bin-outline" onPress={() => setDeleteMode('all')} /></View>
      </Card> : null}

      {state.loading ? <LoadingState rows={6} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !rows.length ? <EmptyState icon="time-outline" title="Nicio acțiune găsită" message={query ? 'Încearcă un alt termen de căutare.' : 'Istoricul va apărea aici după utilizarea aplicației.'} /> : <View style={styles.list}>{rows.map((item) => <AuditCard key={item.id} item={item} expanded={expanded === item.id} selectionMode={selectionMode} selected={selected.has(item.id)} onPress={() => selectionMode ? toggle(item.id) : setExpanded((current) => current === item.id ? null : item.id)} />)}</View>}
    </View>
    <DeleteAuditModal mode={deleteMode} selectedCount={selected.size} loading={deleting} compact={compact} onClose={() => !deleting && setDeleteMode(null)} onConfirm={() => void remove()} />
  </Screen>;
}

function HeroMetric({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) { return <View style={styles.heroMetric}><Ionicons name={icon} size={18} color="#FFFFFF" /><View><AppText variant="label" style={styles.heroMetricValue}>{value}</AppText><AppText variant="caption" style={styles.heroMetricLabel}>{label}</AppText></View></View>; }

function AuditCard({ item, expanded, selectionMode, selected, onPress }: { item: AuditLog; expanded: boolean; selectionMode: boolean; selected: boolean; onPress: () => void }) {
  const { colors, isDark } = useAppTheme();
  const meta = actionMeta(item.action);
  return <Pressable accessibilityRole={selectionMode ? 'checkbox' : 'button'} accessibilityState={selectionMode ? { checked: selected } : { expanded }} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}>
    <Card style={[styles.audit, selected && { borderColor: palette.danger, borderWidth: 1.5 }]} elevated>
      <View style={[styles.actionLine, { backgroundColor: meta.color }]} />
      {selectionMode ? <View style={[styles.checkbox, { borderColor: selected ? palette.danger : colors.border, backgroundColor: selected ? palette.danger : colors.surface }]}>{selected ? <Ionicons name="checkmark" size={17} color="#FFFFFF" /> : null}</View> : <View style={[styles.icon, { backgroundColor: `${meta.color}16` }]}><Ionicons name={meta.icon} size={20} color={meta.color} /></View>}
      <View style={styles.auditCopy}>
        <View style={styles.auditTop}><AppText variant="label" style={styles.summary}>{item.summary}</AppText><View style={[styles.actionBadge, { backgroundColor: `${meta.color}14` }]}><AppText variant="caption" style={{ color: meta.color, fontWeight: '800' }}>{meta.label}</AppText></View></View>
        <View style={styles.metaRow}><View style={[styles.userBadge, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="person-outline" size={14} color={colors.textMuted} /><AppText variant="caption" numberOfLines={1}>{item.userName || 'Sistem'}</AppText></View><AppText variant="caption" muted>{formatDate(item.createdAt, true)}</AppText></View>
        <AppText variant="caption" muted numberOfLines={expanded ? undefined : 1}>Modul: {item.module} · Acțiune: {item.action}</AppText>
        {expanded ? <View style={[styles.details, { backgroundColor: isDark ? colors.surfaceMuted : '#F7F9FC', borderColor: colors.border }]}><DetailLine label="Entitate" value={`${item.entityType || '—'} · ${item.entityId || 'fără ID'}`} /><DetailLine label="Dispozitiv" value={item.device || 'Nespecificat'} /><DetailLine label="IP" value={item.ipAddress || 'Nespecificat'} />{item.before ? <JsonDetail label="Înainte" value={item.before} /> : null}{item.after ? <JsonDetail label="După" value={item.after} /> : null}</View> : null}
      </View>
      {!selectionMode ? <View style={[styles.expandIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textMuted} /></View> : null}
    </Card>
  </Pressable>;
}

function DetailLine({ label, value }: { label: string; value: string }) { return <View style={styles.detailLine}><AppText variant="caption" muted style={styles.detailLabel}>{label}</AppText><AppText variant="caption" style={styles.detailValue}>{value}</AppText></View>; }
function JsonDetail({ label, value }: { label: string; value: unknown }) { return <View style={styles.jsonBlock}><AppText variant="caption" muted>{label}</AppText><AppText variant="caption" selectable>{JSON.stringify(value, null, 2)}</AppText></View>; }

function AuditDeleteButton({ label, icon, disabled = false, subtle = false, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; disabled?: boolean; subtle?: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.auditDeleteButton, { backgroundColor: subtle ? (isDark ? '#32151E' : palette.dangerSoft) : palette.danger, borderColor: subtle ? `${palette.danger}45` : palette.danger, opacity: disabled ? 0.42 : pressed ? 0.78 : 1 }]}><Ionicons name={icon} size={19} color={subtle ? palette.danger : '#FFFFFF'} /><AppText variant="label" style={{ color: subtle ? palette.danger : '#FFFFFF' }}>{label}</AppText></Pressable>;
}

function DeleteAuditModal({ mode, selectedCount, loading, compact, onClose, onConfirm }: { mode: DeleteMode; selectedCount: number; loading: boolean; compact: boolean; onClose: () => void; onConfirm: () => void }) {
  const { colors, isDark } = useAppTheme();
  const all = mode === 'all';
  return <Modal visible={Boolean(mode)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}><View style={[styles.modalOverlay, compact && styles.modalOverlayCompact, { backgroundColor: colors.overlay }]}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />{mode ? <View style={[styles.confirmCard, compact && styles.confirmCardCompact, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
    <View style={styles.confirmHeader}><View style={[styles.confirmIcon, { backgroundColor: isDark ? '#401722' : palette.dangerSoft }]}><Ionicons name={all ? 'trash-bin-outline' : 'trash-outline'} size={27} color={palette.danger} /></View><View style={styles.confirmHeading}><AppText variant="title">{all ? 'Ștergi tot jurnalul?' : `Ștergi ${selectedCount} înregistrări?`}</AppText><AppText variant="caption" muted>{all ? 'Această acțiune afectează întregul istoric.' : 'Vor fi eliminate doar elementele selectate.'}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Închide" onPress={onClose} disabled={loading} style={[styles.confirmClose, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable></View>
    <View style={[styles.confirmNotice, { backgroundColor: isDark ? '#171C2B' : '#F4F7FC', borderColor: colors.border }]}><Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} /><AppText variant="caption" muted style={styles.confirmCopy}>{all ? 'Toate intrările proprietății active vor fi eliminate.' : 'Doar acțiunile selectate vor fi eliminate.'} Operațiunea va rămâne consemnată printr-o înregistrare de securitate.</AppText></View>
    <View style={[styles.confirmActions, compact && styles.confirmActionsCompact]}><Pressable accessibilityRole="button" disabled={loading} onPress={onClose} style={({ pressed }) => [styles.confirmAction, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.72 : 1 }]}><AppText variant="label">Anulează</AppText></Pressable><Pressable accessibilityRole="button" disabled={loading} onPress={onConfirm} style={({ pressed }) => [styles.confirmAction, styles.confirmDanger, { opacity: loading ? 0.55 : pressed ? 0.78 : 1 }]}><Ionicons name="trash-outline" size={19} color="#FFFFFF" /><AppText variant="label" style={{ color: '#FFFFFF' }}>{loading ? 'Se șterge…' : all ? 'Șterge tot' : 'Șterge selectate'}</AppText></Pressable></View>
  </View> : null}</View></Modal>;
}

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 920, alignSelf: 'center', gap: spacing.lg }, hero: { minHeight: 164, borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden', gap: spacing.lg }, heroOrb: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -65, top: -115, backgroundColor: 'rgba(255,255,255,0.11)' }, heroHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, heroIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }, heroCopy: { minWidth: 0, flex: 1, gap: 1 }, eyebrow: { color: '#C9DCFF', fontWeight: '900', letterSpacing: 1 }, heroTitle: { color: '#FFFFFF' }, heroProperty: { color: '#D8E6FF' }, heroMetrics: { minHeight: 55, flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, paddingHorizontal: spacing.lg, backgroundColor: 'rgba(3,20,64,0.20)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }, heroMetric: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, heroMetricValue: { color: '#FFFFFF' }, heroMetricLabel: { color: '#C7DBFF' }, heroDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.18)' },
  toolbar: { gap: spacing.md }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, titleIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, titleCopy: { minWidth: 0, flex: 1, gap: 2 }, deleteToggle: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, search: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md }, searchInput: { minWidth: 0, flex: 1, fontSize: 15 }, clearSearch: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  list: { gap: spacing.sm }, audit: { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingLeft: spacing.xl }, actionLine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 }, auditCopy: { minWidth: 0, flex: 1, gap: 5 }, icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, checkbox: { width: 29, height: 29, marginTop: 5, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }, auditTop: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: spacing.sm }, summary: { minWidth: 180, flex: 1 }, actionBadge: { minHeight: 25, paddingHorizontal: spacing.sm, borderRadius: radius.pill, justifyContent: 'center' }, metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' }, userBadge: { maxWidth: '100%', minHeight: 26, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 5 }, expandIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, details: { marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderRadius: radius.md, gap: spacing.sm }, detailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, detailLabel: { width: 72 }, detailValue: { minWidth: 0, flex: 1 }, jsonBlock: { gap: 3 },
  selectionBar: { gap: spacing.md, padding: spacing.md }, selectionInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, selectionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, selectionCopy: { minWidth: 95, flex: 1, gap: 1 }, selectVisible: { minHeight: 38, maxWidth: 170, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, selectionActions: { flexDirection: 'row', gap: spacing.sm }, auditDeleteButton: { minHeight: 46, minWidth: 0, flex: 1, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }, modalOverlayCompact: { justifyContent: 'flex-end', padding: 0 }, confirmCard: { width: '100%', maxWidth: 480, borderWidth: 1, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.24, shadowRadius: 32, elevation: 16 }, confirmCardCompact: { maxWidth: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: spacing.lg, paddingBottom: spacing.xxl }, confirmHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, confirmHeading: { minWidth: 0, flex: 1, gap: 3 }, confirmIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, confirmClose: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, confirmNotice: { minHeight: 62, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, confirmCopy: { minWidth: 0, flex: 1, lineHeight: 20 }, confirmActions: { width: '100%', flexDirection: 'row', gap: spacing.md }, confirmActionsCompact: { flexDirection: 'row' }, confirmAction: { minHeight: 52, minWidth: 0, flex: 1, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm }, confirmDanger: { backgroundColor: palette.danger, borderColor: palette.danger },
});
