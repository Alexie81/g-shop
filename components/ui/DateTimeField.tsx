import { AppText } from '@/components/ui/AppText';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { ChangeEvent, createElement, CSSProperties, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
  showNow?: boolean;
};

const webInputStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  border: 0,
  opacity: 0,
  cursor: 'pointer',
};

export function DateTimeField({ label, value, onChange, allowClear = false, showNow = false }: Props) {
  const { colors, isDark } = useAppTheme();
  const [draftDate, setDraftDate] = useState(() => dateFromValue(value));
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  const [webFocused, setWebFocused] = useState(false);
  const selectedDate = validDate(value);
  const displayValue = selectedDate ? formatRomanianDateTime(selectedDate) : 'ZZ-LL-AAAA · HH:MM';

  const openPicker = () => {
    Keyboard.dismiss();
    const initialDate = dateFromValue(value);
    setDraftDate(initialDate);

    if (Platform.OS === 'android') {
      openAndroidDateTimePicker(initialDate, onChange);
      return;
    }

    setIosPickerVisible(true);
  };

  const clearValue = () => onChange('');
  const setNow = () => onChange(new Date().toISOString());

  if (Platform.OS === 'web') {
    const handleWebChange = (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.currentTarget.value;
      if (!nextValue) {
        if (allowClear) clearValue();
        return;
      }
      const nextDate = dateFromWebValue(nextValue);
      if (nextDate) onChange(nextDate.toISOString());
    };

    return <View style={styles.wrapper}>
      <AppText variant="label">{label}</AppText>
      <View style={[styles.field, { backgroundColor: colors.input, borderColor: webFocused ? colors.primary : colors.border }]}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        <View style={styles.valueCopy}>
          <AppText numberOfLines={1} style={{ color: selectedDate ? colors.text : colors.textMuted }}>{displayValue}</AppText>
        </View>
        {createElement('input', {
          'aria-label': `${label}, dată și oră`,
          lang: 'ro-RO',
          type: 'datetime-local',
          value: webValue(value),
          step: 60,
          onChange: handleWebChange,
          onFocus: () => setWebFocused(true),
          onBlur: () => setWebFocused(false),
          style: {
            ...webInputStyle,
            right: (showNow ? 66 : 0) + (allowClear && selectedDate ? 78 : 0),
            width: 'auto',
          },
        })}
        <View style={styles.fieldActions}>
          {showNow ? <NowButton onPress={setNow} /> : null}
          {allowClear && selectedDate ? <ClearButton label={label} onPress={clearValue} /> : null}
        </View>
      </View>
    </View>;
  }

  const acceptIosDate = () => {
    onChange(draftDate.toISOString());
    setIosPickerVisible(false);
  };

  return <View style={styles.wrapper}>
    <AppText variant="label">{label}</AppText>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${selectedDate ? displayValue : 'Necompletat'}. Deschide selectorul de dată și oră.`}
      onPress={openPicker}
      style={({ pressed }) => [styles.field, { backgroundColor: colors.input, borderColor: colors.border, opacity: pressed ? 0.74 : 1 }]}
    >
      <Ionicons name="calendar-outline" size={20} color={colors.primary} />
      <View style={styles.valueCopy}>
        <AppText numberOfLines={1} style={{ color: selectedDate ? colors.text : colors.textMuted }}>{displayValue}</AppText>
      </View>
      <View style={styles.fieldActions}>
        {showNow ? <NowButton onPress={setNow} /> : null}
        {allowClear && selectedDate ? <ClearButton label={label} onPress={clearValue} /> : !showNow ? <Ionicons name="time-outline" size={20} color={colors.textMuted} /> : null}
      </View>
    </Pressable>

    {Platform.OS === 'ios' ? <Modal
      animationType="fade"
      transparent
      visible={iosPickerVisible}
      onRequestClose={() => setIosPickerVisible(false)}
    >
      <ModalSafeBottom style={styles.modalRoot} accessibilityViewIsModal>
        <Pressable accessibilityRole="button" accessibilityLabel="Anulează selectarea" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={() => setIosPickerVisible(false)} />
        <View style={[styles.pickerPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.pickerHeader}>
            <Pressable accessibilityRole="button" onPress={() => setIosPickerVisible(false)} hitSlop={8}>
              <AppText variant="label" muted>Anulează</AppText>
            </Pressable>
            <View style={styles.pickerTitle}>
              <AppText variant="label" numberOfLines={1}>{label}</AppText>
              <AppText variant="caption" style={{ color: colors.primary }}>{formatRomanianDateTime(draftDate)}</AppText>
            </View>
            <Pressable accessibilityRole="button" onPress={acceptIosDate} hitSlop={8}>
              <AppText variant="label" style={{ color: colors.primary }}>Gata</AppText>
            </Pressable>
          </View>
          <DateTimePicker
            value={draftDate}
            mode="datetime"
            display="spinner"
            locale="ro-RO"
            minuteInterval={1}
            themeVariant={isDark ? 'dark' : 'light'}
            onChange={(event, nextDate) => {
              if (event.type !== 'dismissed' && nextDate) setDraftDate(nextDate);
            }}
          />
        </View>
      </ModalSafeBottom>
    </Modal> : null}
  </View>;
}

function NowButton({ onPress }: { onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel="Setează data și ora curentă"
    hitSlop={6}
    onPress={(event) => {
      event.stopPropagation();
      onPress();
    }}
    style={({ pressed }) => [styles.nowButton, { backgroundColor: colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}
  >
    <Ionicons name="flash-outline" size={14} color={colors.primary} />
    <AppText variant="caption" style={{ color: colors.primary, fontWeight: '900' }}>Acum</AppText>
  </Pressable>;
}

function ClearButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Șterge ${label.toLocaleLowerCase('ro-RO')}`}
    hitSlop={10}
    onPress={(event) => {
      event.stopPropagation();
      onPress();
    }}
    style={styles.clearButton}
  >
    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
    <AppText variant="caption" style={{ color: colors.textMuted, fontWeight: '800' }}>Șterge</AppText>
  </Pressable>;
}

function openAndroidDateTimePicker(initialDate: Date, onChange: (value: string) => void) {
  DateTimePickerAndroid.open({
    value: initialDate,
    mode: 'date',
    display: 'default',
    onChange: (dateEvent: DateTimePickerEvent, pickedDate?: Date) => {
      if (dateEvent.type === 'dismissed' || !pickedDate) return;
      const nextDate = new Date(initialDate);
      nextDate.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());

      DateTimePickerAndroid.open({
        value: nextDate,
        mode: 'time',
        display: 'default',
        is24Hour: true,
        onChange: (timeEvent: DateTimePickerEvent, pickedTime?: Date) => {
          if (timeEvent.type === 'dismissed' || !pickedTime) return;
          nextDate.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
          onChange(nextDate.toISOString());
        },
      });
    },
  });
}

function validDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateFromValue(value: string): Date {
  return validDate(value) ?? new Date();
}

function formatRomanianDateTime(date: Date): string {
  return `${twoDigits(date.getDate())}-${twoDigits(date.getMonth() + 1)}-${date.getFullYear()} · ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

function webValue(value: string): string {
  const date = validDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}T${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

function dateFromWebValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hours, minutes] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  field: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  valueCopy: { minWidth: 0, flex: 1, paddingVertical: spacing.md },
  fieldActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, zIndex: 2 },
  nowButton: { minWidth: 58, height: 32, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  clearButton: { minWidth: 72, height: 32, paddingHorizontal: spacing.xs, flexDirection: 'row', gap: 3, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', padding: spacing.lg },
  pickerPanel: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.md, paddingBottom: spacing.xxl },
  pickerHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  pickerTitle: { minWidth: 0, flex: 1, alignItems: 'center', gap: 2 },
});
