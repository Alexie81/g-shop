import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { SalesSheet } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

type Props = {
  visible: boolean;
  sheet: SalesSheet | null;
  confirmOnOpen?: boolean;
  onClose: () => void;
  onEdit?: (sheet: SalesSheet) => void;
  onDelete?: (sheet: SalesSheet) => Promise<void>;
};

export function SalesSheetActionsModal({ visible, sheet, confirmOnOpen = false, onClose, onEdit, onDelete }: Props) {
  const { colors } = useAppTheme();
  const [confirming, setConfirming] = useState(confirmOnOpen);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { if (visible) setConfirming(confirmOnOpen); }, [confirmOnOpen, visible]);
  if (!sheet) return null;

  const close = () => { if (!deleting) onClose(); };
  const edit = () => { onClose(); onEdit?.(sheet); };
  const remove = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try { await onDelete(sheet); onClose(); }
    catch { /* Pagina afișează eroarea și păstrează confirmarea deschisă. */ }
    finally { setDeleting(false); }
  };

  return <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
    <ModalSafeBottom style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Închide acțiunile" onPress={close} />
      <View style={[styles.panel, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <View style={styles.heading}>
          <View style={[styles.icon, { backgroundColor: confirming ? `${palette.danger}16` : colors.primarySoft }]}><Ionicons name={confirming ? 'trash-outline' : 'document-text-outline'} size={24} color={confirming ? palette.danger : colors.primary} /></View>
          <View style={styles.headingCopy}><AppText variant="heading">{confirming ? 'Ștergi fișa de vânzare?' : sheet.number}</AppText><AppText variant="caption" muted numberOfLines={2}>{confirming ? `${sheet.number} · ${sheet.customerName}` : sheet.customerName}</AppText></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Închide" disabled={deleting} onPress={close} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={20} color={colors.text} /></Pressable>
        </View>
        {confirming ? <>
          <View style={[styles.warning, { backgroundColor: `${palette.danger}0E`, borderColor: `${palette.danger}35` }]}><Ionicons name="alert-circle-outline" size={22} color={palette.danger} /><AppText variant="caption" style={styles.headingCopy}>Fișa, documentele PDF și semnătura ei vor fi șterse definitiv de pe server. Numărul poate fi refolosit numai dacă este ultimul emis în acel an.</AppText></View>
          <View style={styles.confirmActions}><Button variant="outline" label="Anulează" disabled={deleting} onPress={close} style={styles.confirmButton} /><Button variant="danger" icon="trash-outline" label="Șterge definitiv" loading={deleting} onPress={() => void remove()} style={styles.confirmButton} /></View>
        </> : <View style={styles.actions}>
          {onEdit ? <Action icon="create-outline" label="Editează fișa" color={colors.primary} onPress={edit} /> : null}
          {onDelete ? <Action icon="trash-outline" label="Șterge fișa" color={palette.danger} onPress={() => setConfirming(true)} /> : null}
        </View>}
      </View>
    </ModalSafeBottom>
  </Modal>;
}

function Action({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderColor: colors.border }]}><View style={[styles.actionIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={21} color={color} /></View><AppText variant="label" style={styles.headingCopy}>{label}</AppText><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  panel: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  handle: { width: 48, height: 5, alignSelf: 'center', borderRadius: radius.pill },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headingCopy: { minWidth: 0, flex: 1 },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  close: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: spacing.sm },
  action: { minHeight: 64, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  warning: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  confirmButton: { flexGrow: 1, flexBasis: 150 },
});
