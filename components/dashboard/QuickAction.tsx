import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ComponentProps } from 'react';
import { Pressable, StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';

export function QuickAction({ label, icon, onPress, accent, style }: { label: string; icon: ComponentProps<typeof Ionicons>['name']; onPress: () => void; accent?: string; style?: StyleProp<ViewStyle> }) {
  const { colors, isDark } = useAppTheme(); const color = accent ?? colors.primary;
  const compact = useWindowDimensions().width < 520;
  return <Pressable onPress={() => { Haptics.selectionAsync().catch(() => undefined); onPress(); }} style={({ pressed }) => [styles.action, compact && styles.actionCompact, { backgroundColor: colors.surface, borderColor: pressed ? `${color}78` : colors.border, opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}>
    <View style={[styles.icon, compact && styles.iconCompact, { backgroundColor: isDark ? `${color}28` : `${color}14` }]}><Ionicons name={icon} size={compact ? 20 : 22} color={color} /></View>
    <AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.label}>{label}</AppText>
    {!compact ? <View style={[styles.arrow, { backgroundColor: isDark ? `${color}1E` : colors.surfaceMuted }]}><Ionicons name="arrow-forward" size={15} color={color} /></View> : null}
  </Pressable>;
}
const styles = StyleSheet.create({
  action: { minWidth: 0, minHeight: 78, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionCompact: { minHeight: 72, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: spacing.xs },
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  iconCompact: { width: 36, height: 36, borderRadius: radius.sm },
  label: { minWidth: 0, flex: 1, lineHeight: 18 },
  arrow: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
