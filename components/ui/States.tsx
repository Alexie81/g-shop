import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { LoadingExperience } from '@/components/ui/LoadingExperience';
import { useAppTheme } from '@/contexts/ThemeContext';
import { spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

export function LoadingState(_props: { rows?: number }) {
  return <LoadingExperience />;
}

export function EmptyState({ icon = 'file-tray-outline', title, message, action, onAction }: { icon?: keyof typeof Ionicons.glyphMap; title: string; message: string; action?: string; onAction?: () => void }) {
  const { colors } = useAppTheme();
  return <View style={styles.empty}><View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name={icon} size={28} color={colors.primary} /></View><AppText variant="heading">{title}</AppText><AppText muted style={styles.center}>{message}</AppText>{action ? <Button compact variant="secondary" label={action} onPress={onAction} /> : null}</View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <EmptyState icon="cloud-offline-outline" title="Nu am putut încărca datele" message={message} action={onRetry ? 'Încearcă din nou' : undefined} onAction={onRetry} />;
}

const styles = StyleSheet.create({ empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md }, icon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' }, center: { textAlign: 'center', maxWidth: 340 } });
