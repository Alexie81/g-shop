import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Client } from '@/types';
import { StyleSheet, View } from 'react-native';

export function ClientStatusBadge({ status }: { status: Client['status'] }) {
  const { isDark } = useAppTheme();
  const finalized = status === 'FINALIZED';
  const color = finalized ? palette.success : palette.danger;

  return <View style={[styles.badge, { backgroundColor: isDark ? `${color}24` : `${color}12` }]}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <AppText variant="caption" style={{ color, fontWeight: '800' }}>{finalized ? 'Finalizat' : 'Activ'}</AppText>
  </View>;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
