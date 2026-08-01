import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
export default function PublicSuccess() { const { colors } = useAppTheme(); return <Screen><Card style={styles.card}><View style={[styles.icon, { backgroundColor: palette.successSoft }]}><Ionicons name="checkmark-circle" size={48} color={palette.success} /></View><AppText variant="title" style={styles.center}>Solicitarea a fost înregistrată</AppText><AppText muted style={styles.center}>Datele au ajuns la echipa de service. Codul QR este acum marcat ca folosit, iar operatorul a primit o notificare.</AppText><Button variant="outline" label="Închide formularul" onPress={() => router.replace('/')} style={{ borderColor: colors.border }} /></Card></Screen>; }
const styles = StyleSheet.create({ card: { minHeight: 420, maxWidth: 560, width: '100%', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: spacing.lg }, icon: { width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center' }, center: { textAlign: 'center' } });
