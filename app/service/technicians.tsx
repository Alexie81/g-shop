import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { KeyboardAwareScrollView } from '@/components/ui/KeyboardAwareScrollView';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useBackToAdministration } from '@/hooks/useBackToAdministration';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { technicianRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { Technician } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

type Draft = { id?: string; name: string; phone: string; specialty: string; notes: string };
const emptyDraft: Draft = { name: '', phone: '', specialty: '', notes: '' };

export default function TechniciansScreen() {
  useBackToAdministration();
  const { activeProperty } = useProperty();
  const { hasPermission } = useAuth();
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const mobile = width < 620;
  const propertyId = activeProperty?.id ?? '';
  const canCreate = hasPermission('service_sheets.create');
  const canUpdate = hasPermission('service_sheets.update');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Technician | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [heroHeight, setHeroHeight] = useState(mobile ? 240 : 190);
  const state = useAsyncData(() => technicianRepository.list(propertyId), [propertyId]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  const open = (item?: Technician) => setDraft(item ? { id: item.id, name: item.name, phone: item.phone ?? '', specialty: item.specialty ?? '', notes: item.notes ?? '' } : { ...emptyDraft });
  const save = async () => {
    if (!draft || draft.name.trim().length < 2) return showToast('Completează numele tehnicianului.', 'error');
    setSaving(true);
    try {
      const input = { propertyId, name: draft.name.trim(), phone: draft.phone.trim(), specialty: draft.specialty.trim(), notes: draft.notes.trim() };
      if (draft.id) await technicianRepository.update(draft.id, input); else await technicianRepository.create(input);
      showToast(draft.id ? 'Tehnicianul a fost actualizat.' : 'Tehnicianul a fost adăugat.', 'success');
      setDraft(null);
      await state.reload(true);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Tehnicianul nu a putut fi salvat.', 'error'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await technicianRepository.remove(deleting.id, propertyId);
      showToast('Tehnicianul a fost eliminat din lista activă.', 'success');
      setDeleting(null);
      await state.reload(true);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Tehnicianul nu a putut fi eliminat.', 'error'); }
    finally { setDeleteBusy(false); }
  };

  return <>
    <Screen header={<AppHeader title="Tehnicieni" back onBack={() => router.replace('/service/more')} />} scroll={false} bottomInset={false} style={styles.screen}>
      <View style={styles.root}>
        <LinearGradient onLayout={(event) => setHeroHeight(event.nativeEvent.layout.height)} colors={isDark ? ['#32146F', '#075CFF'] : ['#6937E6', '#075CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, styles.fixedHero, mobile && styles.fixedHeroMobile, mobile && styles.heroMobile]}>
          <View pointerEvents="none" style={styles.heroGlow} />
          <View style={styles.heroIcon}><Ionicons name="construct-outline" size={34} color="#FFFFFF" /></View>
          <View style={styles.heroCopy}><AppText variant="caption" style={styles.eyebrow}>ECHIPA SERVICE</AppText><AppText variant="title" style={styles.heroTitle}>Tehnicienii tăi, gata de selectat</AppText><AppText style={styles.heroText}>Adaugă echipa o singură dată și atribuie rapid fiecare fișă tehnicianului potrivit.</AppText></View>
          <View style={styles.count}><AppText variant="title" style={styles.countValue}>{state.data?.length ?? 0}</AppText><AppText variant="caption" style={styles.countLabel}>ACTIVI</AppText></View>
        </LinearGradient>

        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: heroHeight + spacing.xs }]} refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.reload(true)} tintColor={colors.primary} />} showsVerticalScrollIndicator={false}>
        <View style={[styles.sheet, mobile && styles.sheetMobile, { backgroundColor: colors.background, shadowColor: colors.shadow }]}>
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        <View style={styles.heading}>
          <View style={[styles.headingIcon, { backgroundColor: `${palette.purple}18` }]}><Ionicons name="people-outline" size={23} color={palette.purple} /></View>
          <View style={styles.headingCopy}><AppText variant="title">Lista tehnicienilor</AppText><AppText variant="caption" muted>Numele și specializarea apar în selectorul din fișa de service.</AppText></View>
          {canCreate ? <Button compact label="Adaugă" icon="person-add-outline" onPress={() => open()} /> : null}
        </View>

        <Card style={[styles.tip, { backgroundColor: isDark ? '#17274A' : '#EDF4FF', borderColor: isDark ? '#2B4E88' : '#C9DCFF' }]}>
          <Ionicons name="flash-outline" size={22} color={colors.primary} />
          <View style={styles.tipCopy}><AppText variant="label">Adăugare rapidă din fișă</AppText><AppText variant="caption" muted>Dacă lipsește cineva din listă, îl poți adăuga direct din câmpul Tehnician; va fi salvat automat și aici.</AppText></View>
        </Card>

        {state.loading ? <LoadingState rows={5} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !state.data?.length ? <EmptyState icon="construct-outline" title="Niciun tehnician salvat" message="Adaugă primul tehnician pentru a-l selecta în fișele de service." action={canCreate ? 'Adaugă tehnician' : undefined} onAction={canCreate ? () => open() : undefined} /> : <View style={styles.grid}>{state.data.map((item, index) => <TechnicianCard key={item.id} item={item} index={index} canUpdate={canUpdate} onEdit={() => open(item)} onDelete={() => setDeleting(item)} />)}</View>}
        </View>
        </ScrollView>
      </View>
    </Screen>

    <EditorModal draft={draft} saving={saving} onChange={setDraft} onSave={() => void save()} onClose={() => !saving && setDraft(null)} />
    <DeleteModal technician={deleting} loading={deleteBusy} onClose={() => !deleteBusy && setDeleting(null)} onConfirm={() => void remove()} />
  </>;
}

function TechnicianCard({ item, index, canUpdate, onEdit, onDelete }: { item: Technician; index: number; canUpdate: boolean; onEdit: () => void; onDelete: () => void }) {
  const { colors, isDark } = useAppTheme();
  const accents = [palette.purple, palette.electric, palette.cyan, palette.success];
  const accent = accents[index % accents.length];
  const initials = item.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  return <Card style={styles.card} elevated>
    <View style={[styles.avatar, { backgroundColor: `${accent}${isDark ? '28' : '16'}` }]}><AppText variant="heading" style={{ color: accent }}>{initials || 'T'}</AppText></View>
    <View style={styles.cardCopy}><AppText variant="heading" numberOfLines={1}>{item.name}</AppText><AppText variant="caption" muted numberOfLines={1}>{item.specialty || 'Tehnician service'}</AppText>{item.phone ? <View style={styles.meta}><Ionicons name="call-outline" size={14} color={colors.textMuted} /><AppText variant="caption" muted>{item.phone}</AppText></View> : null}</View>
    {canUpdate ? <View style={styles.cardActions}><Pressable accessibilityLabel={`Editează ${item.name}`} onPress={onEdit} style={[styles.iconButton, { backgroundColor: colors.primarySoft }]}><Ionicons name="create-outline" size={19} color={colors.primary} /></Pressable><Pressable accessibilityLabel={`Elimină ${item.name}`} onPress={onDelete} style={[styles.iconButton, { backgroundColor: isDark ? '#4B1822' : palette.dangerSoft }]}><Ionicons name="trash-outline" size={18} color={palette.danger} /></Pressable></View> : null}
  </Card>;
}

function EditorModal({ draft, saving, onChange, onSave, onClose }: { draft: Draft | null; saving: boolean; onChange: (draft: Draft | null) => void; onSave: () => void; onClose: () => void }) {
  const { colors } = useAppTheme();
  return <Modal visible={Boolean(draft)} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
    <ModalSafeBottom style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <KeyboardAvoidingView style={styles.modalPositioner} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {draft ? <View style={[styles.editor, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.modalHeader}><View style={[styles.modalIcon, { backgroundColor: `${palette.purple}18` }]}><Ionicons name="person-add-outline" size={24} color={palette.purple} /></View><View style={styles.modalCopy}><AppText variant="title">{draft.id ? 'Editează tehnicianul' : 'Tehnician nou'}</AppText><AppText variant="caption" muted>Date compacte, reutilizate în toate fișele.</AppText></View><Pressable accessibilityLabel="Închide" disabled={saving} onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={22} color={colors.text} /></Pressable></View>
          <KeyboardAwareScrollView style={styles.editorScroll} contentContainerStyle={styles.editorContent} automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Input label="Nume și prenume *" value={draft.name} autoFocus onChangeText={(name) => onChange({ ...draft, name })} placeholder="ex. Andrei Popescu" />
            <View style={styles.formRow}><View style={styles.formField}><Input label="Telefon" value={draft.phone} keyboardType="phone-pad" onChangeText={(phone) => onChange({ ...draft, phone })} placeholder="07..." /></View><View style={styles.formField}><Input label="Specializare" value={draft.specialty} onChangeText={(specialty) => onChange({ ...draft, specialty })} placeholder="Laptopuri, GSM..." /></View></View>
            <Input label="Notițe" value={draft.notes} multiline numberOfLines={3} style={styles.multiline} onChangeText={(notes) => onChange({ ...draft, notes })} placeholder="Opțional" />
            <View style={styles.modalActions}><Button label="Renunță" variant="outline" disabled={saving} onPress={onClose} style={styles.actionButton} /><Button label={draft.id ? 'Salvează' : 'Adaugă tehnicianul'} icon="checkmark-circle-outline" loading={saving} onPress={onSave} style={styles.actionPrimary} /></View>
          </KeyboardAwareScrollView>
        </View> : null}
      </KeyboardAvoidingView>
    </ModalSafeBottom>
  </Modal>;
}

function DeleteModal({ technician, loading, onClose, onConfirm }: { technician: Technician | null; loading: boolean; onClose: () => void; onConfirm: () => void }) {
  const { colors } = useAppTheme();
  return <Modal visible={Boolean(technician)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}><ModalSafeBottom style={[styles.overlay, styles.deleteOverlay, { backgroundColor: colors.overlay }]}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />{technician ? <View style={[styles.deleteCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}><View style={[styles.deleteIcon, { backgroundColor: palette.dangerSoft }]}><Ionicons name="trash-outline" size={28} color={palette.danger} /></View><AppText variant="title" style={styles.deleteTitle}>Elimini tehnicianul?</AppText><AppText muted style={styles.deleteText}>{technician.name} nu va mai apărea în selector. Fișele existente rămân neschimbate.</AppText><View style={styles.modalActions}><Button label="Păstrează" variant="outline" disabled={loading} onPress={onClose} style={styles.actionButton} /><Button label="Elimină" variant="danger" icon="trash-outline" loading={loading} onPress={onConfirm} style={styles.actionPrimary} /></View></View> : null}</ModalSafeBottom></Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 0, paddingBottom: 0 }, root: { flex: 1, overflow: 'hidden' }, scroll: { flex: 1 }, scrollContent: {}, sheet: { minHeight: 720, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 112, gap: spacing.lg, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 12 }, sheetMobile: { paddingHorizontal: spacing.md }, sheetHandle: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center' }, hero: { minHeight: 190, borderRadius: radius.xl, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, overflow: 'hidden' }, fixedHero: { position: 'absolute', zIndex: 0, top: spacing.lg, left: spacing.lg, right: spacing.lg }, fixedHeroMobile: { top: spacing.md, left: spacing.md, right: spacing.md }, heroMobile: { minHeight: 240, alignItems: 'flex-start', flexWrap: 'wrap' }, heroGlow: { position: 'absolute', width: 300, height: 300, borderRadius: 150, right: -90, top: -165, backgroundColor: '#FFFFFF16' }, heroIcon: { width: 70, height: 70, borderRadius: 24, backgroundColor: '#FFFFFF1E', borderWidth: 1, borderColor: '#FFFFFF28', alignItems: 'center', justifyContent: 'center' }, heroCopy: { minWidth: 220, flex: 1, gap: spacing.xs }, eyebrow: { color: '#DDE7FF', fontWeight: '900', letterSpacing: 1.1 }, heroTitle: { color: '#FFFFFF' }, heroText: { color: '#E4ECFF', maxWidth: 600 }, count: { minWidth: 86, minHeight: 74, borderRadius: 22, backgroundColor: '#FFFFFF16', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }, countValue: { color: '#FFFFFF' }, countLabel: { color: '#DDE7FF', fontWeight: '900' }, heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, headingIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, headingCopy: { minWidth: 0, flex: 1, gap: 2 }, tip: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, tipCopy: { minWidth: 0, flex: 1, gap: 2 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, card: { minWidth: 300, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, avatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, cardCopy: { minWidth: 0, flex: 1, gap: 2 }, meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }, cardActions: { flexDirection: 'row', gap: spacing.sm }, iconButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  overlay: { justifyContent: 'flex-end' }, modalPositioner: { flex: 1, justifyContent: 'flex-end' }, editor: { width: '100%', maxWidth: 680, maxHeight: '94%', alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: spacing.lg, gap: spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: -12 }, shadowOpacity: 0.22, shadowRadius: 30, elevation: 18 }, editorScroll: { flexShrink: 1 }, editorContent: { gap: spacing.lg, paddingBottom: spacing.sm }, handle: { width: 48, height: 5, borderRadius: 3, alignSelf: 'center' }, modalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, modalIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, modalCopy: { minWidth: 0, flex: 1, gap: 2 }, close: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, formField: { minWidth: 200, flex: 1 }, multiline: { minHeight: 76, textAlignVertical: 'top' }, modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, actionButton: { minWidth: 150, flex: 1 }, actionPrimary: { minWidth: 210, flex: 1.35 }, deleteOverlay: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg }, deleteCard: { width: '100%', maxWidth: 440, padding: spacing.xl, borderWidth: 1, borderRadius: radius.xl, alignItems: 'center', gap: spacing.lg }, deleteIcon: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, deleteTitle: { textAlign: 'center' }, deleteText: { textAlign: 'center', lineHeight: 22 },
});
