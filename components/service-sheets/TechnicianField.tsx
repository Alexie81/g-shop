import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { technicianRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { Technician, UUID } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

type TechnicianSelection = { id: UUID; name: string };
type Draft = { name: string; phone: string; specialty: string; notes: string };
const emptyDraft: Draft = { name: '', phone: '', specialty: '', notes: '' };

export function TechnicianField({ propertyId, technicianId, technicianName, onChange }: {
  propertyId: UUID;
  technicianId?: UUID;
  technicianName?: string;
  onChange: (selection: TechnicianSelection) => void;
}) {
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const [visible, setVisible] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [items, setItems] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try { setItems(await technicianRepository.list(propertyId)); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Tehnicienii nu au putut fi încărcați.', 'error'); }
    finally { setLoading(false); }
  }, [propertyId, showToast]);

  useEffect(() => { if (visible) void load(); }, [load, visible]);

  const current = useMemo(() => items.find((item) => item.id === technicianId), [items, technicianId]);
  const selectedName = current?.name || technicianName?.trim() || '';

  const select = (item: Technician) => {
    onChange({ id: item.id, name: item.name });
    setVisible(false);
    setAdding(false);
  };

  const save = async () => {
    if (draft.name.trim().length < 2) return showToast('Completează numele tehnicianului.', 'error');
    setSaving(true);
    try {
      const created = await technicianRepository.create({
        propertyId,
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        specialty: draft.specialty.trim(),
        notes: draft.notes.trim(),
      });
      setItems((currentItems) => [...currentItems, created].sort((a, b) => a.name.localeCompare(b.name, 'ro')));
      onChange({ id: created.id, name: created.name });
      setDraft(emptyDraft);
      setAdding(false);
      setVisible(false);
      showToast('Tehnicianul a fost salvat și selectat.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Tehnicianul nu a putut fi salvat.', 'error'); }
    finally { setSaving(false); }
  };

  const close = () => {
    if (saving) return;
    setVisible(false);
    setAdding(false);
    setDraft(emptyDraft);
  };

  return <>
    <View style={styles.wrapper}>
      <AppText variant="label">Tehnician</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Selectează tehnicianul" onPress={() => setVisible(true)} style={({ pressed }) => [styles.field, { backgroundColor: colors.input, borderColor: selectedName ? `${colors.primary}70` : colors.border, opacity: pressed ? 0.78 : 1 }]}>
        <View style={[styles.fieldIcon, { backgroundColor: selectedName ? colors.primarySoft : colors.surfaceMuted }]}><Ionicons name="construct-outline" size={20} color={selectedName ? colors.primary : colors.textMuted} /></View>
        <View style={styles.fieldCopy}><AppText variant={selectedName ? 'label' : 'body'} style={!selectedName ? { color: colors.textMuted } : undefined}>{selectedName || 'Alege un tehnician'}</AppText>{current?.specialty ? <AppText variant="caption" muted>{current.specialty}</AppText> : null}</View>
        <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
      </Pressable>
    </View>

    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <ModalSafeBottom style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityLabel="Închide lista tehnicienilor" style={StyleSheet.absoluteFill} onPress={close} />
        <KeyboardAvoidingView style={styles.positioner} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.header}>
              <View style={[styles.headerIcon, { backgroundColor: `${palette.purple}18` }]}><Ionicons name={adding ? 'person-add-outline' : 'people-outline'} size={24} color={palette.purple} /></View>
              <View style={styles.headerCopy}><AppText variant="title">{adding ? 'Tehnician nou' : 'Alege tehnicianul'}</AppText><AppText variant="caption" muted>{adding ? 'Va rămâne disponibil și la următoarele fișe.' : 'Selectează persoana care preia lucrarea.'}</AppText></View>
              <Pressable accessibilityLabel="Închide" disabled={saving} onPress={close} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
            </View>

            {adding ? <ScrollView style={styles.formScroll} automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
              <Input label="Nume și prenume *" value={draft.name} autoFocus onChangeText={(name) => setDraft((value) => ({ ...value, name }))} placeholder="ex. Andrei Popescu" />
              <View style={styles.row}><View style={styles.flex}><Input label="Telefon" value={draft.phone} keyboardType="phone-pad" onChangeText={(phone) => setDraft((value) => ({ ...value, phone }))} placeholder="07..." /></View><View style={styles.flex}><Input label="Specializare" value={draft.specialty} onChangeText={(specialty) => setDraft((value) => ({ ...value, specialty }))} placeholder="Laptopuri, GSM..." /></View></View>
              <Input label="Notițe" value={draft.notes} onChangeText={(notes) => setDraft((value) => ({ ...value, notes }))} multiline numberOfLines={3} style={styles.multiline} placeholder="Opțional" />
              <View style={styles.actions}><Button label="Înapoi" variant="outline" disabled={saving} onPress={() => setAdding(false)} style={styles.flex} /><Button label="Salvează și selectează" icon="checkmark-circle-outline" loading={saving} onPress={() => void save()} style={styles.flexWide} /></View>
            </ScrollView> : <>
              <View style={[styles.help, { backgroundColor: isDark ? '#221544' : '#F4EFFF', borderColor: isDark ? '#5639A5' : '#DDD0FF' }]}><Ionicons name="information-circle-outline" size={20} color={palette.purple} /><AppText variant="caption" style={styles.helpCopy}>Poți gestiona lista completă și din Mai mult → Tehnicieni.</AppText></View>
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
                {loading ? <View style={styles.empty}><Ionicons name="sync-outline" size={24} color={colors.primary} /><AppText muted>Se încarcă tehnicienii…</AppText></View> : items.length ? items.map((item) => <Pressable key={item.id} onPress={() => select(item)} style={({ pressed }) => [styles.item, { backgroundColor: item.id === technicianId ? colors.primarySoft : colors.surfaceMuted, borderColor: item.id === technicianId ? `${colors.primary}70` : colors.border, opacity: pressed ? 0.75 : 1 }]}>
                  <View style={[styles.avatar, { backgroundColor: item.id === technicianId ? colors.primary : `${palette.purple}18` }]}><Ionicons name="person-outline" size={21} color={item.id === technicianId ? '#fff' : palette.purple} /></View>
                  <View style={styles.itemCopy}><AppText variant="label">{item.name}</AppText><AppText variant="caption" muted numberOfLines={1}>{[item.specialty, item.phone].filter(Boolean).join(' · ') || 'Tehnician service'}</AppText></View>
                  {item.id === technicianId ? <Ionicons name="checkmark-circle" size={23} color={colors.primary} /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
                </Pressable>) : <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="people-outline" size={28} color={colors.textMuted} /></View><AppText variant="heading">Niciun tehnician salvat</AppText><AppText variant="caption" muted style={styles.emptyText}>Adaugă primul tehnician și îl vei putea selecta automat în orice fișă.</AppText></View>}
              </ScrollView>
              <Button label="Adaugă un tehnician nou" icon="person-add-outline" onPress={() => setAdding(true)} />
            </>}
          </View>
        </KeyboardAvoidingView>
      </ModalSafeBottom>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm }, field: { minHeight: 58, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, fieldIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, fieldCopy: { minWidth: 0, flex: 1, gap: 1 },
  overlay: { justifyContent: 'flex-end' }, positioner: { flex: 1, justifyContent: 'flex-end' }, sheet: { width: '100%', maxWidth: 680, maxHeight: '92%', alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: spacing.lg, gap: spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: -12 }, shadowOpacity: 0.22, shadowRadius: 30, elevation: 18 }, handle: { width: 48, height: 5, borderRadius: 3, alignSelf: 'center' }, header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, headerIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, headerCopy: { minWidth: 0, flex: 1, gap: 2 }, close: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, help: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, helpCopy: { minWidth: 0, flex: 1 }, list: { maxHeight: 410 }, listContent: { gap: spacing.sm }, item: { minHeight: 68, padding: spacing.md, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, itemCopy: { minWidth: 0, flex: 1, gap: 2 }, empty: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl }, emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, emptyText: { textAlign: 'center', maxWidth: 340 }, formScroll: { flexShrink: 1 }, form: { gap: spacing.lg, paddingBottom: spacing.sm }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, flex: { minWidth: 190, flex: 1 }, flexWide: { minWidth: 230, flex: 1.4 }, multiline: { minHeight: 74, textAlignVertical: 'top' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
