import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export function QuickAction({ label, icon, onPress, accent }: { label: string; icon: ComponentProps<typeof Ionicons>['name']; onPress: () => void; accent?: string }) {
  const { colors, isDark } = useAppTheme(); const color = accent ?? colors.primary;
  return <Pressable onPress={() => { Haptics.selectionAsync().catch(() => undefined); onPress(); }} style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}><View style={[styles.icon, { backgroundColor: isDark ? `${color}28` : `${color}14` }]}><Ionicons name={icon} size={24} color={color} /></View><AppText variant="label" style={styles.label}>{label}</AppText><Ionicons name="arrow-forward" size={16} color={colors.textMuted} /></Pressable>;
}
const styles = StyleSheet.create({ action: { minWidth: 148, flexGrow: 1, flexBasis: 150, minHeight: 96, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, justifyContent: 'space-between' }, icon: { width: 39, height: 39, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, label: { flex: 1 } });
