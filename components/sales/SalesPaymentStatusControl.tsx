import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { SalesPaymentStatus } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

export function SalesPaymentStatusControl({ value, disabled = false, compact = false, onChange }: { value: SalesPaymentStatus; disabled?: boolean; compact?: boolean; onChange: (value: SalesPaymentStatus) => void }) {
  const { colors } = useAppTheme();
  return <View style={[styles.control, compact && styles.controlCompact, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
    {(['UNPAID', 'PAID'] as const).map((status) => {
      const active = value === status;
      const tone = status === 'PAID' ? palette.success : palette.warning;
      return <Pressable
        key={status}
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled }}
        disabled={disabled}
        onPress={() => onChange(status)}
        style={({ pressed }) => [styles.option, compact && styles.optionCompact, active && { backgroundColor: tone }, { opacity: disabled ? 0.55 : pressed ? 0.78 : 1 }]}
      >
        <Ionicons name={status === 'PAID' ? 'checkmark-circle-outline' : 'time-outline'} size={17} color={active ? '#FFFFFF' : colors.textMuted} />
        <AppText variant="caption" style={{ color: active ? '#FFFFFF' : colors.textMuted, fontWeight: '900' }}>{status === 'PAID' ? 'Achitat' : 'Neachitat'}</AppText>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  control: { minHeight: 48, padding: 4, borderWidth: 1, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 },
  controlCompact: { width: '100%' },
  option: { minHeight: 38, minWidth: 118, paddingHorizontal: spacing.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  optionCompact: { minWidth: 0, flex: 1, paddingHorizontal: spacing.sm },
});
