import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

export function StatCard({ label, value, icon, color, helper }: { label: string; value: string | number; icon: ComponentProps<typeof Ionicons>['name']; color: string; helper?: string }) {
  const { isDark } = useAppTheme();
  return <Card style={styles.card}><View style={[styles.icon, { backgroundColor: isDark ? `${color}26` : `${color}16` }]}><Ionicons name={icon} size={22} color={color} /></View><View style={styles.value}><AppText variant="title">{value}</AppText><AppText variant="caption" muted>{label}</AppText>{helper ? <AppText variant="caption" style={{ color, fontWeight: '800' }}>{helper}</AppText> : null}</View></Card>;
}
const styles = StyleSheet.create({ card: { flexGrow: 1, flexBasis: 155, minHeight: 116, flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', padding: spacing.md }, icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, value: { flex: 1, gap: 2 } });
