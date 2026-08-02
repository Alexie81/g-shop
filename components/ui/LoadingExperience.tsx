import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, useWindowDimensions, View } from 'react-native';

export function LoadingExperience({
  fullScreen = false,
  title = 'Se încarcă datele',
  message = 'Sincronizăm informațiile cu workspace-ul tău.',
}: {
  fullScreen?: boolean;
  title?: string;
  message?: string;
}) {
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < 430;
  const pulse = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const progressAnimation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: 1250,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }));
    pulseAnimation.start();
    progressAnimation.start();
    return () => {
      pulseAnimation.stop();
      progressAnimation.stop();
    };
  }, [progress, pulse]);

  const content = <LinearGradient
    colors={isDark ? ['#0C1D35', '#07152D'] : ['#FFFFFF', '#F1F6FF']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={[
      styles.card,
      fullScreen ? styles.cardFull : styles.cardInline,
      compact && styles.cardCompact,
      { borderColor: colors.border, shadowColor: colors.shadow },
    ]}
  >
    <View style={styles.cardGlow} />
    <View style={styles.logoStage}>
      <Animated.View style={[
        styles.logoHalo,
        {
          backgroundColor: colors.primarySoft,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.58, 0.95] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }],
        },
      ]} />
      <Animated.View style={{ transform: [
        { translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [2, -5] }) },
        { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.035] }) },
      ] }}>
        <Image source={require('@/logo/app-icon.png')} resizeMode="contain" style={styles.logo} />
      </Animated.View>
      <View style={[styles.syncBadge, { backgroundColor: colors.primary }]}><LoadingGlyph color="#FFFFFF" size={15} /></View>
    </View>

    <View style={styles.copy}>
      <AppText variant="title" style={styles.title}>{title}</AppText>
      <AppText muted style={styles.message}>{message}</AppText>
    </View>

    <View accessibilityRole="progressbar" accessibilityLabel={title} style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
      <Animated.View style={[
        styles.progressFill,
        {
          backgroundColor: colors.primary,
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-132, 210] }) }],
        },
      ]} />
    </View>
    <View style={styles.statusRow}><View style={styles.liveDot} /><AppText variant="caption" muted>Conexiune securizată · date online</AppText></View>
  </LinearGradient>;

  if (!fullScreen) return content;
  return <LinearGradient
    colors={isDark ? ['#040C1A', '#07152D'] : ['#F8FAFF', '#EAF1FF']}
    style={styles.screen}
  >
    <View style={[styles.orb, styles.orbOne, { backgroundColor: `${colors.primary}16` }]} />
    <View style={[styles.orb, styles.orbTwo, { backgroundColor: `${palette.purple}12` }]} />
    {content}
  </LinearGradient>;
}

export function LoadingGlyph({ color, size = 18 }: { color: string; size?: number }) {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(rotation, {
      toValue: 1,
      duration: 760,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [rotation]);
  return <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
    <Ionicons name="sync" size={size} color={color} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: radius.pill },
  orbOne: { width: 320, height: 320, right: -140, top: -100 },
  orbTwo: { width: 260, height: 260, left: -130, bottom: -80 },
  card: { width: '100%', maxWidth: 390, borderWidth: 1, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowOpacity: 0.16, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 9 },
  cardFull: { minHeight: 344, borderRadius: 32, padding: spacing.xxxl, gap: spacing.xl },
  cardInline: { minHeight: 260, borderRadius: radius.xl, padding: spacing.xxl, gap: spacing.lg },
  cardCompact: { paddingHorizontal: spacing.xl },
  cardGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, top: -145, right: -75, backgroundColor: '#2F79FF12' },
  logoStage: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  logoHalo: { position: 'absolute', width: 104, height: 104, borderRadius: 34 },
  logo: { width: 82, height: 82 },
  syncBadge: { position: 'absolute', right: 1, bottom: 2, width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  copy: { alignItems: 'center', gap: spacing.xs },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', maxWidth: 300 },
  progressTrack: { width: 210, height: 7, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { width: 92, height: 7, borderRadius: radius.pill },
  statusRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.success },
});
