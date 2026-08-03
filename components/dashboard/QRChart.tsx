import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, spacing } from '@/theme/tokens';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export function QRChart({ generated, used }: { generated: number; used: number }) {
  const { colors } = useAppTheme(); const total = generated + used; const scale = Math.max(1, total); const circumference = 2 * Math.PI * 42;
  const [selected, setSelected] = useState<'used' | 'generated' | 'total'>('total');
  const usedLength = (used / scale) * circumference; const generatedLength = (generated / scale) * circumference;
  const rows = [{ key: 'used' as const, label: 'QR folosite', value: used, color: palette.electric }, { key: 'generated' as const, label: 'QR generate', value: generated, color: palette.success }];
  const selectedValue = selected === 'used' ? used : selected === 'generated' ? generated : total;
  const selectedLabel = selected === 'used' ? 'Folosite' : selected === 'generated' ? 'Generate' : 'Total';
  const selectedPercent = selected === 'total' ? 100 : Math.round(selectedValue / scale * 100);
  const choose = (key: 'used' | 'generated' | 'total') => { setSelected(key); void Haptics.selectionAsync().catch(() => undefined); };
  return <View style={styles.wrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${selectedLabel}: ${selectedValue}, ${selectedPercent}%`} accessibilityHint="Atinge pentru a alterna categoria afișată" onPress={() => choose(selected === 'total' ? 'used' : selected === 'used' ? 'generated' : 'total')} style={styles.chart}>
      <Svg pointerEvents="none" width={118} height={118} viewBox="0 0 100 100"><Circle cx="50" cy="50" r="42" stroke={colors.surfaceMuted} strokeWidth="11" fill="none" /><Circle cx="50" cy="50" r="42" stroke={palette.electric} strokeWidth={selected === 'used' ? 14 : 11} fill="none" strokeDasharray={`${usedLength} ${circumference - usedLength}`} strokeLinecap="round" transform="rotate(-90 50 50)" /><Circle cx="50" cy="50" r="42" stroke={palette.success} strokeWidth={selected === 'generated' ? 14 : 11} fill="none" strokeDasharray={`${generatedLength} ${circumference - generatedLength}`} strokeDashoffset={-usedLength} strokeLinecap="round" transform="rotate(-90 50 50)" /></Svg>
      <View pointerEvents="none" style={styles.center}><AppText variant="heading">{selectedValue}</AppText><AppText variant="caption" muted>{selectedLabel}</AppText>{selected !== 'total' ? <AppText variant="caption" style={{ color: selected === 'used' ? palette.electric : palette.success }}>{selectedPercent}%</AppText> : null}</View>
    </Pressable>
    <View style={styles.legend}>{rows.map((row) => <Pressable key={row.key} accessibilityRole="button" accessibilityState={{ selected: selected === row.key }} onPress={() => choose(row.key)} style={({ pressed }) => [styles.row, { backgroundColor: selected === row.key ? colors.primarySoft : 'transparent', opacity: pressed ? 0.72 : 1 }]}><View style={[styles.dot, { backgroundColor: row.color }]} /><AppText variant="caption" muted style={{ flex: 1 }}>{row.label}</AppText><AppText variant="label">{row.value}</AppText></Pressable>)}<Pressable accessibilityRole="button" accessibilityState={{ selected: selected === 'total' }} onPress={() => choose('total')} style={({ pressed }) => [styles.row, { backgroundColor: selected === 'total' ? colors.primarySoft : 'transparent', opacity: pressed ? 0.72 : 1 }]}><View style={[styles.dot, { backgroundColor: colors.textMuted }]} /><AppText variant="caption" muted style={{ flex: 1 }}>Total QR</AppText><AppText variant="label">{total}</AppText></Pressable></View>
  </View>;
}
const styles = StyleSheet.create({ wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: spacing.xl, flexWrap: 'wrap' }, chart: { width: 118, height: 118, alignItems: 'center', justifyContent: 'center' }, center: { position: 'absolute', alignItems: 'center' }, legend: { minWidth: 150, flex: 1, gap: spacing.xs }, row: { minHeight: 38, borderRadius: 10, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, dot: { width: 8, height: 8, borderRadius: 4 } });
