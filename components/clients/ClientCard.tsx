import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Client } from '@/types';
import { formatDate, fullName, initials } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

const avatarColors = [palette.electric, palette.purple, palette.success, palette.warning, palette.cyan];

export function ClientCard({ client, index = 0 }: { client: Client; index?: number }) {
  const { colors } = useAppTheme();
  return <Pressable onPress={() => router.push(`/service/clients/${client.id}`)}>
    <Card style={styles.card}>
      <View style={[styles.avatar, { backgroundColor: avatarColors[index % avatarColors.length] }]}><AppText variant="label" style={{ color: '#fff' }}>{initials(client.firstName, client.lastName)}</AppText></View>
      <View style={styles.main}>
        <View style={styles.heading}><AppText variant="heading" numberOfLines={1} style={{ flex: 1 }}>{fullName(client)}</AppText>{client.qr && client.qr.status !== 'NOT_GENERATED' ? <StatusBadge status={client.qr.status} /> : null}</View>
        <View style={styles.contact}><Ionicons name="call-outline" size={14} color={colors.textMuted} /><AppText variant="caption" muted>{client.phone}</AppText>{client.email ? <><Ionicons name="mail-outline" size={14} color={colors.textMuted} /><AppText variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>{client.email}</AppText></> : null}</View>
        <View style={styles.meta}><AppText variant="caption" muted>Fișe: <AppText variant="caption" style={{ fontWeight: '800' }}>{client.serviceSheetsCount}</AppText></AppText><AppText variant="caption" muted>Ultima activitate: {formatDate(client.lastActivityAt ?? client.updatedAt)}</AppText></View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Card>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 6 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
});
