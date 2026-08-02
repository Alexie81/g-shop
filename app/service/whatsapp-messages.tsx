import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
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
import { whatsAppMessageRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { WhatsAppMessage } from '@/types';
import { WHATSAPP_MESSAGE_TOKENS } from '@/utils/whatsapp-messages';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

type Draft = { id?: string; title: string; message: string; sortOrder: string };
const emptyDraft: Draft = { title: '', message: '', sortOrder: '1' };

export default function WhatsAppMessagesScreen() {
  useBackToAdministration();
  const { activeProperty } = useProperty();
  const { hasPermission } = useAuth();
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const mobile = width < 620;
  const propertyId = activeProperty?.id ?? '';
  const canManage = hasPermission('clients.view');
  const [heroHeight, setHeroHeight] = useState(176);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<WhatsAppMessage | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const state = useAsyncData(() => whatsAppMessageRepository.list(propertyId), [propertyId]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  const edit = (message?: WhatsAppMessage) => setDraft(message ? { id: message.id, title: message.title, message: message.message, sortOrder: String(message.sortOrder) } : { ...emptyDraft, sortOrder: String((state.data?.length ?? 0) + 1) });
  const save = async () => {
    if (!draft || draft.title.trim().length < 2 || !draft.message.trim()) return showToast('Completează titlul și mesajul.', 'error');
    setSaving(true);
    try {
      const input = { propertyId, title: draft.title.trim(), message: draft.message.trim(), sortOrder: Math.max(1, Math.min(999, Number.parseInt(draft.sortOrder, 10) || 1)) };
      if (draft.id) await whatsAppMessageRepository.update(draft.id, input); else await whatsAppMessageRepository.create(input);
      showToast(draft.id ? 'Mesajul a fost actualizat.' : 'Mesajul a fost adăugat.', 'success');
      setDraft(null);
      await state.reload(true);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Mesajul nu a putut fi salvat.', 'error'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await whatsAppMessageRepository.remove(deleting.id, propertyId);
      showToast('Mesajul a fost șters.', 'success');
      setDeleting(null);
      await state.reload(true);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Mesajul nu a putut fi șters.', 'error'); }
    finally { setDeleteBusy(false); }
  };

  return <Screen header={<AppHeader title="Mesaje WhatsApp" back onBack={() => router.replace('/service/more')} />} scroll={false} bottomInset={false} style={styles.screen}>
    <View style={styles.root}>
      <LinearGradient onLayout={(event) => setHeroHeight(event.nativeEvent.layout.height)} colors={isDark ? ['#064E3B', '#07A65A'] : ['#075E54', '#25D366']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, styles.fixedHero, mobile && styles.fixedHeroMobile]}>
        <View style={styles.heroGlow} />
        <View style={styles.heroCopy}>
          <View style={styles.eyebrow}><Ionicons name="flash-outline" size={15} color="#DFFFF0" /><AppText variant="caption" style={styles.eyebrowText}>RĂSPUNSURI RAPIDE</AppText></View>
          <AppText variant="title" style={styles.heroTitle}>Mesaje predefinite</AppText>
          <AppText style={styles.heroSubtitle} numberOfLines={2}>Creează-ți propriile texte și trimite-le clienților direct în WhatsApp.</AppText>
          <View style={styles.heroBadge}><Ionicons name="layers-outline" size={14} color="#fff" /><AppText variant="caption" style={styles.heroBadgeText}>{state.data?.length === 1 ? '1 mesaj disponibil' : `${state.data?.length ?? 0} mesaje disponibile`}</AppText></View>
        </View>
        <View style={styles.whatsAppMark}><Ionicons name="logo-whatsapp" size={mobile ? 39 : 46} color="#25D366" /></View>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: heroHeight + spacing.xs }]} refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.reload(true)} tintColor={colors.primary} />} showsVerticalScrollIndicator={false}>
        <View style={[styles.sheet, mobile && styles.sheetMobile, { backgroundColor: colors.background, shadowColor: colors.shadow }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sectionHeading}>
            <View style={[styles.sectionIcon, { backgroundColor: '#25D36618' }]}><Ionicons name="chatbubbles-outline" size={22} color="#12A653" /></View>
            <View style={styles.sectionCopy}><AppText variant="title">Mesajele contului tău</AppText><AppText variant="caption" muted>Private pentru utilizatorul conectat și disponibile în fiecare client</AppText></View>
            {canManage ? <Pressable accessibilityRole="button" accessibilityLabel="Adaugă mesaj WhatsApp" onPress={() => edit()} style={({ pressed }) => [styles.addButton, { backgroundColor: '#18B95D', opacity: pressed ? 0.78 : 1 }]}><Ionicons name="add" size={25} color="#fff" /></Pressable> : null}
          </View>

          <Card style={[styles.help, { backgroundColor: isDark ? '#063B2A' : '#EAFBF2', borderColor: isDark ? '#13764E' : '#BFEFD2' }]}>
            <Ionicons name="sparkles-outline" size={22} color="#12A653" />
            <View style={styles.helpCopy}><AppText variant="label">Mesaje personalizate automat</AppText><AppText variant="caption" muted>Variabilele sunt înlocuite cu datele clientului înainte de deschiderea WhatsApp.</AppText></View>
          </Card>

          {state.loading ? <LoadingState rows={4} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !state.data?.length ? <EmptyState icon="logo-whatsapp" title="Niciun mesaj predefinit" message={canManage ? 'Adaugă primul mesaj rapid pentru echipa ta.' : 'Administratorul nu a configurat încă mesaje rapide.'} /> : <View style={styles.list}>{state.data.map((item, index) => <MessageCard key={item.id} item={item} index={index} canManage={canManage} onEdit={() => edit(item)} onDelete={() => setDeleting(item)} />)}</View>}
        </View>
      </ScrollView>
    </View>

    <EditorModal draft={draft} saving={saving} onChange={setDraft} onSave={save} onClose={() => !saving && setDraft(null)} />
    <DeleteModal message={deleting} loading={deleteBusy} onClose={() => !deleteBusy && setDeleting(null)} onConfirm={remove} />
  </Screen>;
}

function MessageCard({ item, index, canManage, onEdit, onDelete }: { item: WhatsAppMessage; index: number; canManage: boolean; onEdit: () => void; onDelete: () => void }) {
  const { colors, isDark } = useAppTheme();
  const accents = ['#25D366', palette.electric, palette.purple, palette.warning];
  const accent = accents[index % accents.length];
  return <Card style={styles.messageCard}>
    <View style={[styles.cardAccent, { backgroundColor: accent }]} />
    <View style={styles.cardTop}>
      <View style={[styles.cardIcon, { backgroundColor: `${accent}${isDark ? '22' : '14'}` }]}><Ionicons name="chatbubble-ellipses-outline" size={21} color={accent} /></View>
      <View style={styles.cardTitle}><AppText variant="heading" numberOfLines={2}>{item.title}</AppText><AppText variant="caption" muted>Ordinea {item.sortOrder}</AppText></View>
      {canManage ? <View style={styles.cardActions}><Pressable accessibilityLabel={`Editează ${item.title}`} onPress={onEdit} style={[styles.iconButton, { backgroundColor: colors.primarySoft }]}><Ionicons name="create-outline" size={19} color={colors.primary} /></Pressable><Pressable accessibilityLabel={`Șterge ${item.title}`} onPress={onDelete} style={[styles.iconButton, { backgroundColor: isDark ? '#4B1822' : palette.dangerSoft }]}><Ionicons name="trash-outline" size={18} color={palette.danger} /></Pressable></View> : null}
    </View>
    <View style={[styles.messagePreview, { backgroundColor: colors.surfaceMuted }]}><AppText style={styles.messageText}>{item.message}</AppText></View>
  </Card>;
}

function EditorModal({ draft, saving, onChange, onSave, onClose }: { draft: Draft | null; saving: boolean; onChange: (draft: Draft | null) => void; onSave: () => void; onClose: () => void }) {
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 620;
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (draft) translateY.setValue(0); }, [draft, translateY]);
  const closeByDrag = useCallback(() => {
    if (saving) return;
    Animated.timing(translateY, { toValue: 720, duration: 230, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      onClose();
    });
  }, [onClose, saving, translateY]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !saving,
    onStartShouldSetPanResponderCapture: () => !saving,
    onMoveShouldSetPanResponder: () => !saving,
    onMoveShouldSetPanResponderCapture: () => !saving,
    onPanResponderGrant: () => translateY.stopAnimation(),
    onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 52 || gesture.vy > 0.38) { closeByDrag(); return; }
      Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 230, mass: 0.8, useNativeDriver: true }).start();
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 230, mass: 0.8, useNativeDriver: true }).start(),
  }), [closeByDrag, saving, translateY]);
  const appendToken = (token: string) => draft && onChange({ ...draft, message: `${draft.message}${draft.message ? ' ' : ''}${token}` });
  return <Modal visible={Boolean(draft)} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityLabel="Închide editorul" style={StyleSheet.absoluteFill} onPress={onClose} />
      {draft ? <Animated.View style={[styles.editor, mobile && styles.editorMobile, { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ translateY }] }]}>
        <View {...panResponder.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Trage în jos pentru a închide" style={styles.draggableModalHeader}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <View style={styles.modalHeader}><View style={[styles.modalIcon, { backgroundColor: '#25D36618' }]}><Ionicons name="logo-whatsapp" size={25} color="#18B95D" /></View><View style={styles.modalTitle}><AppText variant="title">{draft.id ? 'Editează mesajul' : 'Mesaj WhatsApp nou'}</AppText><AppText variant="caption" muted>Textul rămâne asociat exclusiv contului tău.</AppText></View></View>
        </View>
        <Pressable accessibilityLabel="Închide" hitSlop={8} disabled={saving} onPress={onClose} style={[styles.closeButton, styles.closeButtonFloating, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorContent}>
          <View style={styles.field}><AppText variant="label">Titlu</AppText><TextInput value={draft.title} onChangeText={(title) => onChange({ ...draft, title })} maxLength={80} placeholder="Ex: Reparația este finalizată" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, backgroundColor: colors.input, borderColor: colors.border }]} /></View>
          <View style={styles.field}><View style={styles.fieldLabelRow}><AppText variant="label">Mesaj</AppText><AppText variant="caption" muted>{draft.message.length}/1000</AppText></View><TextInput value={draft.message} onChangeText={(message) => onChange({ ...draft, message })} maxLength={1000} multiline textAlignVertical="top" placeholder="Scrie mesajul trimis clientului…" placeholderTextColor={colors.textMuted} style={[styles.input, styles.messageInput, { color: colors.text, backgroundColor: colors.input, borderColor: colors.border }]} /></View>
          <View style={styles.tokens}><AppText variant="caption" muted>Apasă pentru a insera o variabilă:</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tokenRow}>{WHATSAPP_MESSAGE_TOKENS.map((token) => <Pressable key={token} onPress={() => appendToken(token)} style={[styles.token, { backgroundColor: isDark ? '#063B2A' : '#EAFBF2', borderColor: isDark ? '#13764E' : '#BFEFD2' }]}><AppText variant="caption" style={styles.tokenText}>{token}</AppText></Pressable>)}</ScrollView></View>
          <View style={styles.field}><AppText variant="label">Ordinea afișării</AppText><TextInput value={draft.sortOrder} onChangeText={(sortOrder) => onChange({ ...draft, sortOrder: sortOrder.replace(/\D/g, '').slice(0, 3) })} keyboardType="number-pad" maxLength={3} placeholder="1" placeholderTextColor={colors.textMuted} style={[styles.input, styles.orderInput, { color: colors.text, backgroundColor: colors.input, borderColor: colors.border }]} /><AppText variant="caption" muted>Pozițiile sunt păstrate automat consecutiv: 1, 2, 3, 4…</AppText></View>
        </ScrollView>
        <View style={styles.modalActions}><Button label="Renunță" variant="outline" disabled={saving} onPress={onClose} style={styles.actionButton} /><Button label={draft.id ? 'Salvează' : 'Adaugă mesajul'} icon="checkmark-circle-outline" loading={saving} onPress={onSave} style={styles.actionPrimary} /></View>
      </Animated.View> : null}
    </KeyboardAvoidingView>
  </Modal>;
}

function DeleteModal({ message, loading, onClose, onConfirm }: { message: WhatsAppMessage | null; loading: boolean; onClose: () => void; onConfirm: () => void }) {
  const { colors } = useAppTheme();
  return <Modal visible={Boolean(message)} transparent animationType="fade" onRequestClose={onClose}><View style={[styles.modalOverlay, styles.deleteOverlay, { backgroundColor: colors.overlay }]}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />{message ? <View style={[styles.deleteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.deleteIcon, { backgroundColor: palette.dangerSoft }]}><Ionicons name="trash-outline" size={28} color={palette.danger} /></View><AppText variant="title" style={styles.deleteTitle}>Ștergi mesajul?</AppText><AppText muted style={styles.deleteCopy}>„{message.title}” va dispărea imediat din mesajele rapide ale clienților.</AppText><View style={styles.modalActions}><Button label="Păstrează" variant="outline" disabled={loading} onPress={onClose} style={styles.actionButton} /><Button label="Șterge" variant="danger" icon="trash-outline" loading={loading} onPress={onConfirm} style={styles.actionPrimary} /></View></View> : null}</View></Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 0, paddingBottom: 0 }, root: { flex: 1, overflow: 'hidden' }, scroll: { flex: 1 }, scrollContent: {},
  hero: { minHeight: 176, borderRadius: radius.xl, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, overflow: 'hidden' }, fixedHero: { position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg }, fixedHeroMobile: { top: spacing.md, left: spacing.md, right: spacing.md }, heroGlow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, top: -155, right: -65, backgroundColor: '#FFFFFF18' }, heroCopy: { minWidth: 0, flex: 1, gap: spacing.xs }, eyebrow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, eyebrowText: { color: '#E1FFF0', fontWeight: '900', letterSpacing: 1.1 }, heroTitle: { color: '#fff' }, heroSubtitle: { color: '#E5FFF0', maxWidth: 650 }, heroBadge: { alignSelf: 'flex-start', marginTop: spacing.sm, minHeight: 29, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: '#FFFFFF1D', flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, heroBadgeText: { color: '#fff', fontWeight: '800' }, whatsAppMark: { width: 78, height: 78, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#063D24', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
  sheet: { minHeight: 720, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 112, gap: spacing.lg, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 12 }, sheetMobile: { paddingHorizontal: spacing.md }, sheetHandle: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center' }, sectionHeading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, sectionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, sectionCopy: { minWidth: 0, flex: 1 }, addButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }, help: { minHeight: 76, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, helpCopy: { minWidth: 0, flex: 1, gap: 3 }, list: { gap: spacing.md },
  messageCard: { gap: spacing.md, overflow: 'hidden', paddingLeft: spacing.xl }, cardAccent: { position: 'absolute', left: 0, top: 17, bottom: 17, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, cardIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, cardTitle: { minWidth: 0, flex: 1, gap: 2 }, cardActions: { flexDirection: 'row', gap: spacing.sm }, iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, messagePreview: { borderRadius: radius.md, padding: spacing.md }, messageText: { lineHeight: 21 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' }, editor: { width: '94%', maxWidth: 700, maxHeight: '92%', borderWidth: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: spacing.xl, gap: spacing.lg }, editorMobile: { width: '100%', paddingHorizontal: spacing.lg }, draggableModalHeader: { marginHorizontal: -spacing.lg, marginTop: -spacing.sm, paddingLeft: spacing.lg, paddingRight: 76, paddingTop: spacing.sm, gap: spacing.md }, modalHandle: { width: 46, height: 5, borderRadius: radius.pill, alignSelf: 'center' }, modalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, modalIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, modalTitle: { minWidth: 0, flex: 1 }, closeButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, closeButtonFloating: { position: 'absolute', top: 34, right: spacing.lg, zIndex: 5, elevation: 5 }, editorContent: { gap: spacing.lg, paddingBottom: spacing.sm }, field: { gap: spacing.sm }, fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }, input: { minHeight: 54, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontWeight: '600', outlineStyle: 'none' } as never, messageInput: { minHeight: 150, paddingTop: spacing.md, paddingBottom: spacing.md }, orderInput: { width: 110 }, tokens: { gap: spacing.sm }, tokenRow: { gap: spacing.sm, paddingRight: spacing.lg }, token: { height: 38, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, tokenText: { color: '#10994A', fontWeight: '800' }, modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, actionButton: { flex: 1, minWidth: 125 }, actionPrimary: { flex: 1.4, minWidth: 160 },
  deleteOverlay: { justifyContent: 'center', padding: spacing.xl }, deleteCard: { width: '100%', maxWidth: 430, borderWidth: 1, borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', gap: spacing.lg }, deleteIcon: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' }, deleteTitle: { textAlign: 'center' }, deleteCopy: { textAlign: 'center' },
});
