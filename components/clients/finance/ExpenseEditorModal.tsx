import { FinanceNumberField } from '@/components/clients/finance/FinanceNumberField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { ClientFinanceExpense } from '@/utils/client-finance';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

export type ExpenseInput = { description: string; amount: number };

type ExpenseEditorModalProps = {
  visible: boolean;
  currencyCode: string;
  expense?: ClientFinanceExpense | null;
  onSubmit: (input: ExpenseInput) => Promise<void> | void;
  onClose: () => void;
};

export function ExpenseEditorModal({ visible, currencyCode, expense, onSubmit, onClose }: ExpenseEditorModalProps) {
  const { colors } = useAppTheme();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setDescription(expense?.description ?? '');
    setAmount(expense?.amount ?? 0);
    setError('');
  }, [expense, visible]);

  const submit = async () => {
    const cleanDescription = description.trim();
    if (!cleanDescription) return setError('Descrierea cheltuielii este obligatorie.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Valoarea trebuie să fie mai mare decât zero.');
    setSaving(true);
    setError('');
    try {
      await onSubmit({ description: cleanDescription, amount });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Cheltuiala nu a putut fi salvată.');
    } finally {
      setSaving(false);
    }
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView style={[styles.overlay, { backgroundColor: colors.overlay }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.header}>
          <View style={[styles.icon, { backgroundColor: `${palette.warning}18` }]}><Ionicons name="receipt-outline" size={23} color={palette.warning} /></View>
          <View style={styles.headerCopy}><AppText variant="title">{expense ? 'Editează cheltuiala' : 'Cheltuială nouă'}</AppText><AppText variant="caption" muted>Cost intern suplimentar asociat clientului</AppText></View>
          <Pressable accessibilityLabel="Închide" onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable>
        </View>
        <Input label="Descriere" icon="create-outline" value={description} onChangeText={setDescription} placeholder="Ex: curier, consumabile, transport" autoCapitalize="sentences" maxLength={120} />
        <FinanceNumberField label={`Valoare (${currencyCode})`} value={amount} onChange={setAmount} />
        {error ? <View style={[styles.error, { backgroundColor: `${palette.danger}12` }]}><Ionicons name="alert-circle-outline" size={18} color={palette.danger} /><AppText variant="caption" style={{ color: palette.danger, flex: 1 }}>{error}</AppText></View> : null}
        <View style={styles.actions}>
          <Button variant="outline" label="Anulează" onPress={onClose} disabled={saving} style={styles.action} />
          <Button label={expense ? 'Salvează modificarea' : 'Adaugă cheltuiala'} icon="checkmark" loading={saving} onPress={() => void submit()} style={styles.action} />
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modal: { width: '100%', maxWidth: 560, borderWidth: 1, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.lg, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  close: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  error: { borderRadius: radius.sm, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  action: { flex: 1, minWidth: 190 },
});
