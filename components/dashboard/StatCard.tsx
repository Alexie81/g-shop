import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export function StatCard({ label, value, icon, color, helper, helperIcon = 'trending-up', detail, onLongPress, style }: { label: string; value: string | number; icon: ComponentProps<typeof Ionicons>['name']; color: string; helper?: string; helperIcon?: ComponentProps<typeof Ionicons>['name']; detail?: string; onLongPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors, isDark } = useAppTheme();
  const card = <Card elevated style={[styles.card, { borderColor: isDark ? `${color}38` : colors.border }, onLongPress ? styles.pressableCard : null, style]}>
    <View pointerEvents="none" style={[styles.glow, { backgroundColor: isDark ? `${color}12` : `${color}0D` }]} />
    <View style={styles.topRow}>
      <View style={[styles.icon, { backgroundColor: isDark ? `${color}26` : `${color}14` }]}><Ionicons name={icon} size={21} color={color} /></View>
      {helper ? <View style={[styles.helper, { backgroundColor: isDark ? `${color}20` : `${color}10` }]}><Ionicons name={helperIcon} size={12} color={color} /><AppText variant="caption" style={{ color, fontWeight: '800' }}>{helper}</AppText></View> : <View style={[styles.statusDot, { backgroundColor: color }]} />}
    </View>
    <View style={styles.valueWrap}>
      <AppText variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.value}>{value}</AppText>
      <AppText variant="caption" muted numberOfLines={2}>{label}</AppText>
      {detail ? <AppText variant="caption" numberOfLines={2} style={[styles.detail, { color }]}>{detail}</AppText> : null}
    </View>
    <View style={[styles.accent, { backgroundColor: color }]} />
  </Card>;
  if (!onLongPress) return card;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Ține apăsat pentru detalii.`} delayLongPress={420} onPress={Platform.OS === 'web' ? onLongPress : undefined} onLongPress={onLongPress} style={({ pressed }) => [style, pressed && styles.pressed]}>{card}</Pressable>;
}
const styles = StyleSheet.create({
  card: { minWidth: 0, minHeight: 128, padding: spacing.lg, justifyContent: 'space-between', overflow: 'hidden' },
  pressableCard: { width: '100%' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  glow: { position: 'absolute', width: 92, height: 92, borderRadius: 46, top: -48, right: -36 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  helper: { minHeight: 25, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5, opacity: 0.72 },
  valueWrap: { gap: 2, paddingTop: spacing.md },
  value: { fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.6 },
  detail: { paddingTop: 3, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  accent: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 0, height: 2, borderRadius: radius.pill, opacity: 0.72 },
});
