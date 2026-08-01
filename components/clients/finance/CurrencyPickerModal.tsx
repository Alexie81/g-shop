import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { DEFAULT_CURRENCY_CODE, findCurrency, ISO_CURRENCIES, IsoCurrency } from '@/constants/currencies';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

type CurrencyPickerModalProps = {
  visible: boolean;
  value: string;
  onSelect: (code: string) => void;
  onClose: () => void;
};

export function CurrencyPickerModal({ visible, value, onSelect, onClose }: CurrencyPickerModalProps) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  useEffect(() => { if (!visible) setQuery(''); }, [visible]);

  const currencies = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ro-RO');
    const filtered = normalized
      ? ISO_CURRENCIES.filter((currency) => `${currency.code} ${currency.name}`.toLocaleLowerCase('ro-RO').includes(normalized))
      : ISO_CURRENCIES;
    if (normalized) return filtered;
    const preferred = filtered.find((currency) => currency.code === DEFAULT_CURRENCY_CODE);
    return preferred ? [preferred, ...filtered.filter((currency) => currency.code !== DEFAULT_CURRENCY_CODE)] : filtered;
  }, [query]);
  const selected = findCurrency(value);

  const renderCurrency = ({ item }: { item: IsoCurrency }) => {
    const active = item.code === value;
    return <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.code}, ${item.name}`}
      onPress={() => { onSelect(item.code); onClose(); }}
      style={({ pressed }) => [styles.row, {
        backgroundColor: active ? colors.primarySoft : pressed ? colors.surfaceMuted : 'transparent',
        borderColor: active ? colors.primary : colors.border,
      }]}
    >
      <View style={[styles.code, { backgroundColor: active ? colors.primary : colors.surfaceMuted }]}>
        <AppText variant="label" style={{ color: active ? '#fff' : colors.text }}>{item.code}</AppText>
      </View>
      <View style={styles.currencyCopy}>
        <AppText variant="label">{item.name}</AppText>
        <AppText variant="caption" muted>{item.minorUnit === null ? 'Fără unitate minoră' : `${item.minorUnit} zecimale`}</AppText>
      </View>
      {active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
    </Pressable>;
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="globe-outline" size={23} color={colors.primary} /></View>
          <View style={styles.headerCopy}><AppText variant="title">Alege moneda</AppText><AppText variant="caption" muted>Lista completă ISO 4217 · selectat {selected.code}</AppText></View>
          <Pressable accessibilityLabel="Închide selectorul de monedă" onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
        </View>
        <Input autoFocus icon="search-outline" value={query} onChangeText={setQuery} placeholder="Caută după cod sau denumire…" autoCapitalize="characters" autoCorrect={false} />
        <FlatList
          style={styles.currencyList}
          data={currencies}
          keyExtractor={(item) => item.code}
          renderItem={renderCurrency}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="search-outline" size={32} color={palette.warning} /><AppText variant="heading">Nicio monedă găsită</AppText><AppText muted>Încearcă un alt cod sau o altă denumire.</AppText></View>}
        />
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { alignSelf: 'center', width: '100%', maxWidth: 720, height: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: spacing.lg, gap: spacing.lg, overflow: 'hidden' },
  handle: { width: 48, height: 5, borderRadius: radius.pill, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  close: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  currencyList: { flex: 1 },
  list: { gap: spacing.sm, paddingBottom: spacing.xxl },
  row: { minHeight: 68, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  code: { width: 58, height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  currencyCopy: { flex: 1, minWidth: 0 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
});
