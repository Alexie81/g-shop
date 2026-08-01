import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];
export const Input = forwardRef<TextInput, TextInputProps & { label?: string; error?: string; icon?: IconName }>(function Input({ label, error, icon, secureTextEntry, style, ...props }, ref) {
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.wrapper}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View style={[styles.field, { backgroundColor: colors.input, borderColor: error ? '#E7354C' : colors.border }]}>
        {icon ? <Ionicons name={icon} color={colors.textMuted} size={19} /> : null}
        <TextInput ref={ref} {...props} secureTextEntry={secureTextEntry && !visible} placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }, style]} />
        {secureTextEntry ? <Pressable hitSlop={10} onPress={() => setVisible((value) => !value)}><Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} color={colors.textMuted} size={20} /></Pressable> : null}
      </View>
      {error ? <AppText variant="caption" style={{ color: '#E7354C' }}>{error}</AppText> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  field: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { flex: 1, fontSize: 15, paddingVertical: spacing.md },
});
