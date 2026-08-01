import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { spacing } from '@/theme/tokens';
import { parseFinanceNumber } from '@/utils/client-finance';
import { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type FinanceNumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  helper?: string;
  error?: string;
  disabled?: boolean;
  percentage?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

function displayValue(value: number) {
  if (!Number.isFinite(value)) return '0';
  return String(value).replace('.', ',');
}

export function FinanceNumberField({ label, value, onChange, helper, error, disabled, percentage, testID, style }: FinanceNumberFieldProps) {
  const [draft, setDraft] = useState(() => displayValue(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(displayValue(value));
  }, [focused, value]);

  return <View style={[styles.wrapper, style]}>
    <Input
      testID={testID}
      label={label}
      value={draft}
      editable={!disabled}
      keyboardType="decimal-pad"
      inputMode="decimal"
      selectTextOnFocus
      onFocus={() => setFocused(true)}
      onBlur={() => {
        const next = Math.max(0, parseFinanceNumber(draft));
        setFocused(false);
        setDraft(displayValue(next));
        onChange(next);
      }}
      onChangeText={(text) => {
        setDraft(text);
        onChange(Math.max(0, parseFinanceNumber(text)));
      }}
      error={error}
      icon={percentage ? 'calculator-outline' : 'cash-outline'}
    />
    {helper && !error ? <AppText variant="caption" muted style={styles.helper}>{helper}</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { minWidth: 0, gap: spacing.xs },
  helper: { paddingHorizontal: spacing.xs },
});
