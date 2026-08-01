import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { QRStatus } from '@/types';
import { StyleSheet, View } from 'react-native';

const qrConfig: Record<QRStatus, { label: string; color: string; soft: string }> = {
  NOT_GENERATED: { label: 'QR indisponibil', color: '#64748B', soft: '#EDF1F5' },
  GENERATED: { label: 'QR generat', color: palette.success, soft: palette.successSoft },
  SENT: { label: 'QR trimis', color: palette.purple, soft: '#F1EAFE' },
  USED: { label: 'QR folosit', color: palette.electric, soft: palette.electricLight },
  EXPIRED: { label: 'QR expirat', color: palette.warning, soft: palette.warningSoft },
  INVALIDATED: { label: 'QR invalidat', color: palette.danger, soft: palette.dangerSoft },
  REGENERATED: { label: 'QR generat', color: palette.success, soft: palette.successSoft },
};

export function StatusBadge({ status, label }: { status?: QRStatus; label?: string }) {
  const { isDark } = useAppTheme();
  const config = status ? qrConfig[status] : { label: label ?? 'Activ', color: palette.electric, soft: palette.electricLight };
  return <View style={[styles.badge, { backgroundColor: isDark ? `${config.color}24` : config.soft }]}><View style={[styles.dot, { backgroundColor: config.color }]} /><AppText variant="caption" style={{ color: config.color, fontWeight: '800' }}>{label ?? config.label}</AppText></View>;
}

const styles = StyleSheet.create({ badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 6, height: 6, borderRadius: 3 } });
