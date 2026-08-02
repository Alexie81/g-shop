import { AppText } from '@/components/ui/AppText';
import { LoadingGlyph } from '@/components/ui/LoadingExperience';
import { Button } from '@/components/ui/Button';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { ServiceSheet } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  visible: boolean;
  sheet: ServiceSheet | null;
  onClose: () => void;
  onView: (sheet: ServiceSheet) => void;
  onEdit: (sheet: ServiceSheet) => void;
  onSend: (sheet: ServiceSheet) => Promise<void> | void;
  onDelete: (sheet: ServiceSheet) => Promise<void> | void;
};

export function ServiceSheetActionsModal({ visible, sheet, onClose, onView, onEdit, onSend, onDelete }: Props) {
  const { colors } = useAppTheme();
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [translateY, visible]);

  const closeByDrag = useCallback(() => {
    if (deleting) return;
    Animated.timing(translateY, { toValue: 720, duration: 230, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      translateY.setValue(0);
      setConfirmingDelete(false);
      onClose();
    });
  }, [deleting, onClose, translateY]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 76 || gesture.vy > 0.65) { closeByDrag(); return; }
      Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 230, mass: 0.8, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 230, mass: 0.8, useNativeDriver: true }).start(),
  }), [closeByDrag, translateY]);

  if (!sheet) return null;

  const closeThen = (action: (value: ServiceSheet) => void) => {
    setConfirmingDelete(false);
    onClose();
    action(sheet);
  };

  const close = () => {
    if (deleting) return;
    setConfirmingDelete(false);
    onClose();
  };

  const cancelDelete = () => {
    if (!deleting) setConfirmingDelete(false);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(sheet);
      setConfirmingDelete(false);
      onClose();
    } catch { /* The list screen surfaces the actionable error. */ }
    finally { setDeleting(false); }
  };

  return <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={confirmingDelete ? cancelDelete : close}>
    <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Închide meniul fișei" style={StyleSheet.absoluteFill} onPress={confirmingDelete ? cancelDelete : close} />
      <Animated.View style={[styles.sheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, transform: [{ translateY }] }]}>
        {confirmingDelete ? <>
          <View {...panResponder.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Trage în jos pentru a închide" style={styles.draggableHeader}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.header}>
              <View style={[styles.sheetIcon, { backgroundColor: `${palette.danger}16` }]}><Ionicons name="trash-outline" size={24} color={palette.danger} /></View>
              <View style={styles.headerCopy}>
                <AppText variant="heading">Ștergi fișa?</AppText>
                <AppText variant="caption" muted numberOfLines={2}>{sheet.number} | {sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName}` : sheet.equipment}</AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Înapoi la acțiuni" disabled={deleting} onPress={cancelDelete} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="arrow-back" size={21} color={colors.text} /></Pressable>
            </View>
          </View>
          <View style={[styles.deleteNotice, { backgroundColor: `${palette.danger}0E`, borderColor: `${palette.danger}35` }]}>
            <Ionicons name="alert-circle-outline" size={22} color={palette.danger} />
            <AppText variant="caption" style={styles.futureCopy}>Fișa va fi eliminată din aplicație. Acțiunea va rămâne înregistrată în istoricul sistemului.</AppText>
          </View>
          <View style={styles.deleteActions}><Button variant="outline" label="Anulează" disabled={deleting} onPress={cancelDelete} style={styles.deleteButton} /><Button variant="danger" icon="trash-outline" label="Șterge fișa" loading={deleting} onPress={() => void confirmDelete()} style={styles.deleteButton} /></View>
        </> : <>
          <View {...panResponder.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Trage în jos pentru a închide" style={styles.draggableHeader}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.header}>
              <View style={[styles.sheetIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={24} color={colors.primary} /></View>
              <View style={styles.headerCopy}>
                <AppText variant="heading">{sheet.number}</AppText>
                <AppText variant="caption" muted numberOfLines={2}>{sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName} | ` : ''}{sheet.equipment}</AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Închide" onPress={close} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable>
            </View>
          </View>
          <View style={styles.actions}>
            <Action icon="eye-outline" color={colors.primary} label="Vizualizare fișă de service" description="Deschide toate detaliile fișei" onPress={() => closeThen(onView)} />
            <Action icon="create-outline" color={palette.purple} label="Editare fișă de service" description="Modifică echipamentul, valorile și statusul" onPress={() => closeThen(onEdit)} />
            <Action icon="logo-whatsapp" color={palette.success} label="Trimitere fișă de service" description="Generează PDF-ul actual și deschide conversația clientului" onPress={() => void onSend(sheet)} />
            <Action icon="trash-outline" color={palette.danger} label="Ștergere fișă de service" description="Eliminare sigură, cu audit păstrat" onPress={() => setConfirmingDelete(true)} />
          </View>
          <View style={[styles.future, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
            <AppText variant="caption" muted style={styles.futureCopy}>La fiecare trimitere se generează un PDF nou, folosind exact datele curente.</AppText>
          </View>
        </>}
      </Animated.View>
    </View>
  </Modal>;
}

function Action({ icon, color, label, description, onPress, loading = false }: { icon: IconName; color: string; label: string; description: string; onPress: () => void; loading?: boolean }) {
  const { colors } = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    disabled={loading}
    onPress={onPress}
    style={({ pressed }) => [styles.action, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceMuted : colors.surface, opacity: loading ? 0.65 : 1 }]}
  >
    <View style={[styles.actionIcon, { backgroundColor: `${color}16` }]}>{loading ? <LoadingGlyph color={color} size={20} /> : <Ionicons name={icon} size={21} color={color} />}</View>
    <View style={styles.actionCopy}><AppText variant="label">{label}</AppText><AppText variant="caption" muted>{description}</AppText></View>
    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
  </Pressable>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  draggableHeader: { minHeight: 88, marginHorizontal: -spacing.lg, marginTop: -spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.md },
  handle: { width: 48, height: 5, borderRadius: radius.pill, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sheetIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  close: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: spacing.sm },
  action: { minHeight: 68, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, minWidth: 0, gap: 2 },
  future: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  futureCopy: { flex: 1 },
  deleteNotice: { minHeight: 68, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  deleteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  deleteButton: { flexGrow: 1, flexBasis: 130 },
});
