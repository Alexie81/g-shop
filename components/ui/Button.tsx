import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

export function Button({ label, onPress, icon, variant = 'primary', loading, disabled, compact, style }:
  { label: string; onPress?: () => void; icon?: IconName; variant?: Variant; loading?: boolean; disabled?: boolean; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useAppTheme();
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const backgroundColor = primary ? colors.primary : danger ? palette.danger : variant === 'secondary' ? colors.primarySoft : 'transparent';
  const foreground = primary || danger ? '#fff' : variant === 'secondary' ? colors.primary : colors.text;
  const borderColor = variant === 'outline' ? colors.border : 'transparent';
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); onPress?.(); }}
      style={({ pressed }) => [styles.button, compact && styles.compact, { backgroundColor, borderColor, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : icon ? <Ionicons name={icon} size={compact ? 17 : 19} color={foreground} /> : null}
      <AppText variant="label" style={{ color: foreground }}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: spacing.xl, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, borderWidth: 1 },
  compact: { minHeight: 38, paddingHorizontal: spacing.md, borderRadius: radius.sm },
});
