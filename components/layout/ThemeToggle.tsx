import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { ThemePreference } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

const options: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'Sistem', icon: 'phone-portrait-outline' },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference, colors } = useAppTheme();
  return <View style={[styles.container, compact && styles.compactContainer, { backgroundColor: colors.surfaceMuted }]}>{options.map((option) => {
    const active = option.value === preference;
    return <Pressable key={option.value} accessibilityRole="button" onPress={() => void setPreference(option.value)} style={[styles.option, compact && styles.compactOption, active && { backgroundColor: colors.surface, shadowColor: colors.shadow }]}><Ionicons name={option.icon} size={compact ? 16 : 18} color={active ? colors.primary : colors.textMuted} />{compact ? null : <AppText variant="caption" style={{ color: active ? colors.primary : colors.textMuted, fontWeight: '800' }}>{option.label}</AppText>}</Pressable>;
  })}</View>;
}

const styles = StyleSheet.create({
  container: { padding: 4, borderRadius: radius.pill, flexDirection: 'row', alignSelf: 'center' },
  option: { minHeight: 38, minWidth: 82, borderRadius: radius.pill, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  compactContainer: { padding: 3 }, compactOption: { minWidth: 38, minHeight: 34, paddingHorizontal: 8 },
});
