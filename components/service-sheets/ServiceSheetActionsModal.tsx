import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { ServiceSheet } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

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

  if (!sheet) return null;

  const closeThen = (action: (value: ServiceSheet) => void) => {
    onClose();
    action(sheet);
  };

  const requestDelete = () => Alert.alert(
    'Ștergi fișa de service?',
    `${sheet.number} va fi eliminată din aplicație. Datele rămân păstrate în siguranță în istoricul sistemului.`,
    [
      { text: 'Anulează', style: 'cancel' },
      {
        text: 'Șterge fișa',
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          void Promise.resolve(onDelete(sheet)).then(onClose).catch(() => undefined).finally(() => setDeleting(false));
        },
      },
    ],
  );

  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
    <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <Pressable accessibilityLabel="Închide meniul fișei" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <View style={styles.header}>
          <View style={[styles.sheetIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={24} color={colors.primary} /></View>
          <View style={styles.headerCopy}>
            <AppText variant="heading">{sheet.number}</AppText>
            <AppText variant="caption" muted numberOfLines={2}>{sheet.client ? `${sheet.client.firstName} ${sheet.client.lastName} · ` : ''}{sheet.equipment}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Închide" onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable>
        </View>

        <View style={styles.actions}>
          <Action icon="eye-outline" color={colors.primary} label="Vizualizare fișă de service" description="Deschide toate detaliile fișei" onPress={() => closeThen(onView)} />
          <Action icon="create-outline" color={palette.purple} label="Editare fișă de service" description="Modifică echipamentul, valorile și statusul" onPress={() => closeThen(onEdit)} />
          <Action icon="share-social-outline" color={palette.success} label="Trimitere fișă de service" description="Deschide meniul telefonului, inclusiv WhatsApp" onPress={() => void onSend(sheet)} />
          <Action icon="trash-outline" color={palette.danger} label="Ștergere fișă de service" description="Eliminare sigură, cu audit păstrat" onPress={requestDelete} loading={deleting} />
        </View>

        <View style={[styles.future, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
          <AppText variant="caption" muted style={styles.futureCopy}>PDF-ul și linkul public pentru WhatsApp vor fi generate de API într-o etapă viitoare.</AppText>
        </View>
      </View>
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
    <View style={[styles.actionIcon, { backgroundColor: `${color}16` }]}>{loading ? <ActivityIndicator color={color} /> : <Ionicons name={icon} size={21} color={color} />}</View>
    <View style={styles.actionCopy}><AppText variant="label">{label}</AppText><AppText variant="caption" muted>{description}</AppText></View>
    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
  </Pressable>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  handle: { width: 48, height: 5, borderRadius: radius.pill, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sheetIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  close: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: spacing.sm },
  action: { minHeight: 68, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, minWidth: 0, gap: 2 },
  future: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  futureCopy: { flex: 1 },
});
