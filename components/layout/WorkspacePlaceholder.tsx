import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAppTheme } from '@/contexts/ThemeContext';
import { spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

export function WorkspacePlaceholder({ title, description, icon = 'sparkles-outline' }: { title: string; description: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useAppTheme();
  return <Screen header={<AppHeader title={title} />}><Card style={styles.card}><View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name={icon} color={colors.primary} size={34} /></View><AppText variant="title" style={styles.center}>{title}</AppText><AppText muted style={styles.center}>{description}</AppText></Card></Screen>;
}
const styles = StyleSheet.create({ card: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: spacing.md }, icon: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, center: { textAlign: 'center', maxWidth: 440 } });
