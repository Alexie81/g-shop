import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Pressable, StyleSheet, View } from 'react-native';

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useAppTheme();
  return <View style={styles.row}><AppText variant="heading">{title}</AppText>{action ? <Pressable onPress={onAction}><AppText variant="label" style={{ color: colors.brandAccent }}>{action}</AppText></Pressable> : null}</View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } });
