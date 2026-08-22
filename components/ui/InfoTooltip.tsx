import { AppText } from '@/components/ui/AppText';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

type Props = {
  title: string;
  description: string;
  size?: number;
};

export function InfoTooltip({ title, description, size = 18 }: Props) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Explicație: ${title}`}
      accessibilityHint="Deschide o explicație scurtă"
      hitSlop={8}
      onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.trigger, { backgroundColor: colors.primarySoft, opacity: pressed ? 0.65 : 1 }]}
    ><Ionicons name="information-circle-outline" size={size} color={colors.primary} /></Pressable>

    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
      <ModalSafeBottom style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Închide explicația" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="information-circle" size={25} color={colors.primary} /></View>
          <View style={styles.copy}><AppText variant="heading">{title}</AppText><AppText muted style={styles.description}>{description}</AppText></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Am înțeles" onPress={() => setOpen(false)} style={[styles.close, { backgroundColor: colors.primary }]}><AppText variant="label" style={styles.closeText}>Am înțeles</AppText></Pressable>
        </View>
      </ModalSafeBottom>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 430, borderWidth: 1, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  icon: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: spacing.sm, alignItems: 'center' },
  description: { textAlign: 'center', lineHeight: 21 },
  close: { minWidth: 150, minHeight: 44, borderRadius: radius.pill, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFFFFF' },
});
