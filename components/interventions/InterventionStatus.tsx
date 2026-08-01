import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { InterventionStatus as Status } from '@/types';
import { StyleSheet, View } from 'react-native';
export const INTERVENTION_LABELS: Record<Status, string> = { SCHEDULED: 'Programată', CONFIRMED: 'Confirmată', TRAVELLING: 'În deplasare', IN_PROGRESS: 'În lucru', WAITING: 'În așteptare', COMPLETED: 'Finalizată', CANCELLED: 'Anulată' };
const colors: Record<Status, string> = { SCHEDULED: palette.electric, CONFIRMED: palette.purple, TRAVELLING: palette.warning, IN_PROGRESS: palette.cyan, WAITING: '#D97706', COMPLETED: palette.success, CANCELLED: palette.danger };
export function InterventionStatus({ status }: { status: Status }) { const { isDark } = useAppTheme(); const color = colors[status]; return <View style={[styles.badge, { backgroundColor: isDark ? `${color}28` : `${color}14` }]}><AppText variant="caption" style={{ color, fontWeight: '800' }}>{INTERVENTION_LABELS[status]}</AppText></View>; }
const styles = StyleSheet.create({ badge: { borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.sm, alignSelf: 'flex-start' } });
