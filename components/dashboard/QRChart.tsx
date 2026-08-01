import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, spacing } from '@/theme/tokens';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export function QRChart({ generated, used }: { generated: number; used: number }) {
  const { colors } = useAppTheme(); const total = generated + used; const scale = Math.max(1, total); const circumference = 2 * Math.PI * 42;
  const usedLength = (used / scale) * circumference; const generatedLength = (generated / scale) * circumference;
  const rows = [{ label: 'QR folosite', value: used, color: palette.electric }, { label: 'QR generate', value: generated, color: palette.success }];
  return <View style={styles.wrap}><View style={styles.chart}><Svg width={118} height={118} viewBox="0 0 100 100"><Circle cx="50" cy="50" r="42" stroke={colors.surfaceMuted} strokeWidth="11" fill="none" /><Circle cx="50" cy="50" r="42" stroke={palette.electric} strokeWidth="11" fill="none" strokeDasharray={`${usedLength} ${circumference - usedLength}`} strokeLinecap="round" transform="rotate(-90 50 50)" /><Circle cx="50" cy="50" r="42" stroke={palette.success} strokeWidth="11" fill="none" strokeDasharray={`${generatedLength} ${circumference - generatedLength}`} strokeDashoffset={-usedLength} strokeLinecap="round" transform="rotate(-90 50 50)" /></Svg><View style={styles.center}><AppText variant="heading">{total}</AppText><AppText variant="caption" muted>Total</AppText></View></View><View style={styles.legend}>{rows.map((row) => <View key={row.label} style={styles.row}><View style={[styles.dot, { backgroundColor: row.color }]} /><AppText variant="caption" muted style={{ flex: 1 }}>{row.label}</AppText><AppText variant="label">{row.value}</AppText></View>)}</View></View>;
}
const styles = StyleSheet.create({ wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: spacing.xl, flexWrap: 'wrap' }, chart: { width: 118, height: 118, alignItems: 'center', justifyContent: 'center' }, center: { position: 'absolute', alignItems: 'center' }, legend: { minWidth: 150, flex: 1, gap: spacing.md }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, dot: { width: 8, height: 8, borderRadius: 4 } });
