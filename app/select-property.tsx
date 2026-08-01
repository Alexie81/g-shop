import { RouteLoader } from '@/components/layout/RouteLoader';
import { AppText } from '@/components/ui/AppText';
import { ErrorState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SelectPropertyScreen() {
  const { user, ready, requiresPropertySelection } = useAuth();
  const { properties, activeProperty, loading, error, selectProperty, reload } = useProperty();
  const { manual } = useLocalSearchParams<{ manual?: string }>();
  const { colors, isDark } = useAppTheme();
  const [selecting, setSelecting] = useState('');
  const entrance = useRef(new Animated.Value(0)).current;
  const floating = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entrance, { toValue: 1, damping: 18, stiffness: 105, mass: 0.82, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(floating, { toValue: 1, duration: 2600, useNativeDriver: true }),
      Animated.timing(floating, { toValue: 0, duration: 2600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [entrance, floating]);

  if (!ready || loading) return <RouteLoader />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (activeProperty && !requiresPropertySelection && manual !== '1') return <Redirect href={activeProperty.type === 'SERVICE' ? '/service/dashboard' : '/shop/home'} />;

  const choose = async (id: string) => {
    const property = properties.find((item) => item.id === id);
    if (!property || selecting) return;
    setSelecting(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      await selectProperty(property);
      router.replace(property.type === 'SERVICE' ? '/service/dashboard' : '/shop/home');
    } finally { setSelecting(''); }
  };

  const heroTranslate = entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const logoFloat = floating.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  const logoScale = floating.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });

  return <LinearGradient colors={isDark ? ['#020816', '#061634', '#08245A'] : ['#F9FBFF', '#EDF4FF', '#DDEAFF']} style={styles.root}>
    <View pointerEvents="none" style={[styles.orb, styles.orbTop, { backgroundColor: isDark ? 'rgba(38,113,255,0.22)' : 'rgba(36,111,255,0.13)' }]} />
    <View pointerEvents="none" style={[styles.orb, styles.orbBottom, { backgroundColor: isDark ? 'rgba(124,58,237,0.13)' : 'rgba(124,58,237,0.09)' }]} />
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.content, { opacity: entrance, transform: [{ translateY: heroTranslate }] }]}>
          <View style={styles.hero}>
            <Animated.View style={{ transform: [{ translateY: logoFloat }, { scale: logoScale }] }}>
              <LinearGradient colors={isDark ? ['rgba(36,104,255,0.38)', 'rgba(6,31,75,0.64)'] : ['#FFFFFF', '#E5EFFF']} style={[styles.logoHalo, { borderColor: isDark ? 'rgba(107,160,255,0.42)' : 'rgba(7,92,255,0.17)', shadowColor: colors.primary }]}>
                <View style={styles.logoCrop}><Image source={require('@/logo/logo.png')} resizeMode="cover" style={styles.logo} /></View>
              </LinearGradient>
            </Animated.View>
            <View style={[styles.workspaceBadge, { backgroundColor: isDark ? 'rgba(9,32,72,0.82)' : 'rgba(255,255,255,0.76)', borderColor: colors.border }]}><View style={styles.liveDot} /><AppText variant="caption" muted style={styles.badgeText}>WORKSPACE G-SHOP</AppText></View>
            <AppText variant="display" style={styles.title}>Alege proprietatea</AppText>
            <AppText muted style={styles.subtitle}>Fiecare proprietate are propriile date, utilizatori și module. Alege spațiul în care lucrezi acum.</AppText>
          </View>

          <View style={styles.listHeading}><View><AppText variant="heading">Spațiile tale de lucru</AppText><AppText variant="caption" muted>{properties.length} {properties.length === 1 ? 'proprietate disponibilă' : 'proprietăți disponibile'}</AppText></View><View style={[styles.secureIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="shield-checkmark-outline" size={21} color={colors.primary} /></View></View>

          {error ? <ErrorState message={error} onRetry={() => void reload()} /> : <View style={styles.list}>{properties.map((property, index) => {
            const service = property.type === 'SERVICE';
            const accent = service ? colors.primary : palette.purple;
            const cardOpacity = entrance.interpolate({ inputRange: [0, Math.min(0.88, 0.42 + index * 0.12), 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
            const cardTranslate = entrance.interpolate({ inputRange: [0, 1], outputRange: [30 + index * 7, 0] });
            return <Animated.View key={property.id} style={{ opacity: cardOpacity, transform: [{ translateY: cardTranslate }] }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Deschide ${property.name}`}
                disabled={Boolean(selecting)}
                onPress={() => void choose(property.id)}
                style={({ pressed }) => [styles.card, { backgroundColor: isDark ? 'rgba(7,21,45,0.94)' : 'rgba(255,255,255,0.94)', borderColor: pressed ? accent : colors.border, shadowColor: colors.shadow, opacity: selecting && selecting !== property.id ? 0.55 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
              >
                <View style={[styles.accentLine, { backgroundColor: accent }]} />
                <LinearGradient colors={service ? ['#3387FF', '#075CFF'] : ['#9B5BFF', '#6D28D9']} style={styles.propertyIcon}><Ionicons name={service ? 'construct-outline' : 'storefront-outline'} size={26} color="#fff" /></LinearGradient>
                <View style={styles.info}>
                  <AppText variant="heading" numberOfLines={2}>{property.name}</AppText>
                  <AppText variant="caption" muted numberOfLines={1}>{property.domain}</AppText>
                  <View style={[styles.type, { backgroundColor: isDark ? `${accent}20` : `${accent}10` }]}><Ionicons name={service ? 'document-text-outline' : 'bag-handle-outline'} size={13} color={accent} /><AppText variant="caption" style={{ color: accent, fontWeight: '800' }}>{service ? 'Service & fișe' : 'Magazin online · În lucru'}</AppText></View>
                </View>
                <View style={[styles.arrow, { backgroundColor: selecting === property.id ? accent : colors.surfaceMuted }]}>{selecting === property.id ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-forward" size={20} color={accent} />}</View>
              </Pressable>
            </Animated.View>;
          })}</View>}

          <View style={styles.footer}><Ionicons name="swap-horizontal-outline" size={17} color={colors.textMuted} /><AppText variant="caption" muted>Poți schimba proprietatea oricând din headerul aplicației.</AppText></View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  </LinearGradient>;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl },
  content: { width: '100%', maxWidth: 680, gap: spacing.xl },
  orb: { position: 'absolute', borderRadius: radius.pill },
  orbTop: { width: 360, height: 360, top: -220, right: -160 },
  orbBottom: { width: 390, height: 390, bottom: -275, left: -210 },
  hero: { alignItems: 'center', gap: spacing.md },
  logoHalo: { width: 124, height: 124, borderRadius: 40, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.24, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  logoCrop: { width: 102, height: 102, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 102, height: 102, transform: [{ scale: 1.72 }] },
  workspaceBadge: { minHeight: 28, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.success },
  badgeText: { fontSize: 9, letterSpacing: 1.45, fontWeight: '800' },
  title: { textAlign: 'center' },
  subtitle: { width: '100%', maxWidth: 520, textAlign: 'center' },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  secureIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  list: { gap: spacing.md },
  card: { minHeight: 112, borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, overflow: 'hidden', shadowOpacity: 0.08, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 3 },
  accentLine: { position: 'absolute', left: 0, top: 22, bottom: 22, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  propertyIcon: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  info: { minWidth: 0, flex: 1, gap: 3 },
  type: { alignSelf: 'flex-start', minHeight: 27, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing.sm, marginTop: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: 5 },
  arrow: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  footer: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
});
