import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { ServiceSheetStatus as Status } from '@/types';
import { StyleSheet, View } from 'react-native';

export const SERVICE_STATUS_LABELS: Record<Status, string> = { NEW: 'Nouă', WAITING: 'În așteptare', VERIFYING: 'În verificare', IN_PROGRESS: 'În lucru', WAITING_PARTS: 'Se așteaptă piesele', COMPLETED: 'Finalizată', DELIVERED: 'Predată', CANCELLED: 'Anulată' };
const tones: Record<Status, string> = { NEW: palette.electric, WAITING: palette.warning, VERIFYING: palette.purple, IN_PROGRESS: palette.cyan, WAITING_PARTS: '#D97706', COMPLETED: palette.success, DELIVERED: '#15803D', CANCELLED: palette.danger };
export function ServiceSheetStatus({ status }: { status: Status }) { const { isDark } = useAppTheme(); const color = tones[status]; return <View style={[styles.badge, { backgroundColor: isDark ? `${color}28` : `${color}14` }]}><View style={[styles.dot, { backgroundColor: color }]} /><AppText variant="caption" numberOfLines={1} style={[styles.label, { color }]}>{SERVICE_STATUS_LABELS[status]}</AppText></View>; }
const styles = StyleSheet.create({ badge: { alignSelf: 'flex-start', minHeight: 30, maxWidth: '100%', flexShrink: 0, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 6, height: 6, flexShrink: 0, borderRadius: 3 }, label: { flexShrink: 0, fontWeight: '800' } });
