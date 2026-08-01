import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export function Card({ children, style, elevated = false }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; elevated?: boolean }>) {
  const { colors, isDark } = useAppTheme();
  return <View style={[styles.card, { backgroundColor: elevated ? colors.surfaceElevated : colors.surface, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: isDark ? 0.12 : 0.07 }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 2 },
});
