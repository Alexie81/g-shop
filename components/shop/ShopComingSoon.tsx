import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useProperty } from '@/contexts/PropertyContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

const features = ['Produse și categorii', 'Stocuri și variante', 'Prețuri și reduceri', 'Comenzi și clienți', 'Sincronizare website', 'Rapoarte de vânzări'];
export function ShopComingSoon({ section = 'Shop' }: { section?: string }) {
  const { colors } = useAppTheme(); const { activeProperty } = useProperty();
  return <Screen header={<AppHeader title={section} />}><LinearGradient colors={['#075CFF', '#073BA8', '#071A42']} style={styles.hero}><View style={styles.badge}><Ionicons name="construct" size={15} color={palette.warning} /><AppText variant="caption" style={{ color: palette.warning, fontWeight: '800' }}>ÎN LUCRU</AppText></View><Ionicons name="storefront-outline" size={58} color="#fff" /><AppText variant="display" style={[styles.center, { color: '#fff' }]}>Modulul Shop este în curs de dezvoltare</AppText><AppText style={[styles.center, { color: '#CBDCFF' }]}>Pregătim modulul complet pentru gestionarea magazinului calculatoareprofesionale.ro. În curând vei administra produsele, stocurile, comenzile și sincronizarea cu website-ul direct din G-Shop.</AppText><View style={styles.progressTrack}><View style={styles.progress} /></View><AppText variant="caption" style={{ color: '#fff' }}>Dezvoltare modul · 28%</AppText></LinearGradient><Card style={styles.propertyCard}><View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="business-outline" size={24} color={colors.primary} /></View><View style={{ flex: 1 }}><AppText variant="heading">{activeProperty?.name ?? 'Calculatoare Profesionale'}</AppText><AppText variant="caption" muted>{activeProperty?.domain ?? 'calculatoareprofesionale.ro'}</AppText></View></Card><AppText variant="heading">Funcții planificate</AppText><View style={styles.grid}>{features.map((feature) => <Card key={feature} style={styles.feature}><Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} /><AppText variant="label" style={{ flex: 1 }}>{feature}</AppText></Card>)}</View><Button variant="outline" icon="swap-horizontal-outline" label="Schimbă proprietatea" onPress={() => router.push('/select-property')} /></Screen>;
}
const styles = StyleSheet.create({ hero: { borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', gap: spacing.lg, overflow: 'hidden' }, badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, backgroundColor: '#FFFFFF18', paddingVertical: 7, paddingHorizontal: spacing.md }, center: { textAlign: 'center', maxWidth: 650 }, progressTrack: { width: '100%', maxWidth: 500, height: 9, borderRadius: 9, backgroundColor: '#FFFFFF25', overflow: 'hidden' }, progress: { width: '28%', height: '100%', backgroundColor: palette.warning, borderRadius: 9 }, propertyCard: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, feature: { minWidth: 220, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md } });
