import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ComponentProps } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export function QuickAction({ label, icon, onPress, accent, style }: { label: string; icon: ComponentProps<typeof Ionicons>['name']; onPress: () => void; accent?: string; style?: StyleProp<ViewStyle> }) {
  const { colors, isDark } = useAppTheme(); const color = accent ?? colors.primary;
  return <Pressable onPress={() => { Haptics.selectionAsync().catch(() => undefined); onPress(); }} style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: pressed ? `${color}78` : colors.border, opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}>
    <View style={[styles.icon, { backgroundColor: isDark ? `${color}28` : `${color}14` }]}><Ionicons name={icon} size={22} color={color} /></View>
    <AppText variant="label" numberOfLines={2} style={styles.label}>{label}</AppText>
    <View style={[styles.arrow, { backgroundColor: isDark ? `${color}1E` : colors.surfaceMuted }]}><Ionicons name="arrow-forward" size={15} color={color} /></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  action: { minWidth: 0, minHeight: 78, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { minWidth: 0, flex: 1, lineHeight: 18 },
  arrow: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
