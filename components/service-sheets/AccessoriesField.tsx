import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export const NO_ACCESSORIES_VALUE = 'Fără accesorii';

export function hasNoAccessories(value: string) {
  return value.trim().toLocaleLowerCase('ro-RO') === NO_ACCESSORIES_VALUE.toLocaleLowerCase('ro-RO');
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function AccessoriesField({ value, onChange, placeholder = 'Încărcător, husă, cablu…' }: Props) {
  const { colors } = useAppTheme();
  const withoutAccessories = hasNoAccessories(value);
  const previousValue = useRef(withoutAccessories ? '' : value);

  useEffect(() => {
    if (!hasNoAccessories(value)) previousValue.current = value;
  }, [value]);

  const toggleWithoutAccessories = () => {
    if (withoutAccessories) {
      onChange(previousValue.current);
      return;
    }

    previousValue.current = value;
    onChange(NO_ACCESSORIES_VALUE);
  };

  return <View style={styles.wrapper}>
    <View style={styles.header}>
      <AppText variant="label" style={styles.label}>Accesorii predate</AppText>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: withoutAccessories }}
        accessibilityLabel="Fără accesorii"
        onPress={toggleWithoutAccessories}
        style={({ pressed }) => [
          styles.option,
          {
            borderColor: withoutAccessories ? colors.primary : colors.border,
            backgroundColor: withoutAccessories ? colors.primarySoft : colors.surfaceMuted,
            opacity: pressed ? 0.74 : 1,
          },
        ]}
      >
        <View style={[
          styles.checkbox,
          {
            borderColor: withoutAccessories ? colors.primary : colors.border,
            backgroundColor: withoutAccessories ? colors.primary : colors.surface,
          },
        ]}>
          {withoutAccessories ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
        </View>
        <AppText variant="caption" style={{ color: withoutAccessories ? colors.primary : colors.text, fontWeight: '800' }}>Fără accesorii</AppText>
      </Pressable>
    </View>
    <View style={{ opacity: withoutAccessories ? 0.68 : 1 }}>
      <Input
        value={value}
        editable={!withoutAccessories}
        selectTextOnFocus={!withoutAccessories}
        onChangeText={onChange}
        placeholder={placeholder}
        icon={withoutAccessories ? 'checkmark-circle-outline' : 'cube-outline'}
      />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  header: { minHeight: 30, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { flexShrink: 1 },
  option: { minHeight: 34, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 7 },
  checkbox: { width: 20, height: 20, borderWidth: 1.5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
});
