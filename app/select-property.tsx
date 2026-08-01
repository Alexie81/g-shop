import { RouteLoader } from '@/components/layout/RouteLoader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SelectPropertyScreen() {
  const { user, ready } = useAuth(); const { properties, loading, error, selectProperty, reload } = useProperty(); const { colors } = useAppTheme();
  if (!ready || loading) return <RouteLoader />; if (!user) return <Redirect href="/(auth)/login" />;
  const choose = async (id: string) => { const property = properties.find((item) => item.id === id); if (!property) return; await selectProperty(property); router.replace(property.type === 'SERVICE' ? '/service/dashboard' : '/shop/home'); };
  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}><View style={styles.content}><Image source={require('@/logo/logo.png')} style={styles.logo} /><AppText variant="display" style={styles.center}>Alege proprietatea</AppText><AppText muted style={styles.center}>Fiecare proprietate este un workspace separat, cu propriile date și module.</AppText>{error ? <ErrorState message={error} onRetry={() => void reload()} /> : <View style={styles.list}>{properties.map((property) => <Pressable key={property.id} onPress={() => void choose(property.id)}><Card style={styles.card} elevated><View style={[styles.icon, { backgroundColor: property.type === 'SERVICE' ? colors.primary : '#7C3AED' }]}><Ionicons name={property.type === 'SERVICE' ? 'construct-outline' : 'storefront-outline'} size={27} color="#fff" /></View><View style={styles.info}><AppText variant="heading">{property.name}</AppText><AppText variant="caption" muted>{property.domain}</AppText><View style={[styles.type, { backgroundColor: colors.surfaceMuted }]}><AppText variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>{property.type === 'SERVICE' ? 'Service & intervenții' : 'Magazin online · În lucru'}</AppText></View></View><Ionicons name="arrow-forward-circle" size={27} color={colors.primary} /></Card></Pressable>)}</View>}</View></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, content: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }, logo: { width: 78, height: 78, borderRadius: 22, alignSelf: 'center', marginBottom: spacing.md }, center: { textAlign: 'center' }, list: { gap: spacing.lg, marginTop: spacing.xl }, card: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg }, icon: { width: 54, height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' }, info: { flex: 1, gap: 3 }, type: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: spacing.sm, marginTop: spacing.sm } });
