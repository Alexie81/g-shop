import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { AppText } from '@/components/ui/AppText';
import { LoadingGlyph } from '@/components/ui/LoadingExperience';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

export default function LoginScreen() {
  const { colors, isDark } = useAppTheme();
  const { login, savedUsername } = useAuth();
  const [username, setUsername] = useState(savedUsername);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(Boolean(savedUsername));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (savedUsername) { setUsername(savedUsername); setRemember(true); } }, [savedUsername]);
  useEffect(() => {
    Animated.spring(entrance, { toValue: 1, damping: 18, stiffness: 110, mass: 0.8, useNativeDriver: true }).start();
  }, [entrance]);

  const submit = async () => {
    if (!username.trim() || !password) { setError('Completează utilizatorul și parola.'); return; }
    setLoading(true); setError('');
    try { await login(username, password, remember); router.replace('/'); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Autentificarea a eșuat.'); }
    finally { setLoading(false); }
  };

  const toggleRemember = () => {
    Haptics.selectionAsync().catch(() => undefined);
    setRemember((value) => !value);
  };

  return <LinearGradient colors={isDark ? ['#020816', '#061838', '#052762'] : ['#F9FBFF', '#EEF4FF', '#DCE9FF']} style={styles.root}>
    <View pointerEvents="none" style={[styles.orb, styles.orbTop, { backgroundColor: isDark ? 'rgba(20,89,255,0.22)' : 'rgba(36,111,255,0.15)' }]} />
    <View pointerEvents="none" style={[styles.orb, styles.orbBottom, { backgroundColor: isDark ? 'rgba(0,189,255,0.12)' : 'rgba(0,151,255,0.10)' }]} />
    <LinearGradient pointerEvents="none" colors={['transparent', isDark ? 'rgba(32,111,255,0.30)' : 'rgba(32,111,255,0.16)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.lightBeam} />

    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.shell, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }]}>
          <View style={styles.logoArea}>
            <LinearGradient colors={isDark ? ['rgba(38,113,255,0.36)', 'rgba(7,33,77,0.52)'] : ['rgba(255,255,255,0.98)', 'rgba(226,238,255,0.94)']} style={[styles.logoHalo, { borderColor: isDark ? 'rgba(91,151,255,0.40)' : 'rgba(7,92,255,0.16)' }]}>
              <View style={styles.logoCrop}><Image source={require('@/logo/logo.png')} resizeMode="cover" style={styles.logo} /></View>
            </LinearGradient>
            <View style={[styles.secureBadge, { backgroundColor: isDark ? 'rgba(11,34,72,0.82)' : 'rgba(255,255,255,0.78)', borderColor: colors.border }]}>
              <View style={[styles.onlineDot, { shadowColor: palette.success }]} />
              <AppText variant="caption" muted style={styles.badgeText}>WORKSPACE SECURIZAT</AppText>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: isDark ? 'rgba(8,25,49,0.92)' : 'rgba(255,255,255,0.94)', borderColor: isDark ? 'rgba(91,138,203,0.30)' : 'rgba(146,168,202,0.30)', shadowColor: colors.shadow }]}>
            <View style={[styles.cardGlow, { backgroundColor: isDark ? 'rgba(28,105,255,0.18)' : 'rgba(28,105,255,0.09)' }]} />
            <View style={styles.heading}>
              <LinearGradient colors={['#4A8CFF', '#075CFF']} style={styles.shield}>
                <Ionicons name="shield-checkmark" size={21} color="#FFFFFF" />
              </LinearGradient>
              <AppText variant="display" style={styles.title}>Bine ai revenit</AppText>
              <AppText muted style={styles.subtitle}>Intră în centrul de control G-Shop.</AppText>
            </View>

            <View style={styles.form}>
              <Input label="Utilizator" icon="person-outline" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} returnKeyType="next" />
              <Input label="Parolă" icon="lock-closed-outline" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={() => void submit()} returnKeyType="done" />

              <View style={styles.row}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: remember }} onPress={toggleRemember} style={({ pressed }) => [styles.remember, pressed && styles.pressed]}>
                  <LinearGradient colors={remember ? ['#3E8BFF', '#075CFF'] : ['transparent', 'transparent']} style={[styles.checkbox, { borderColor: remember ? colors.primary : colors.border }]}>
                    {remember ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
                  </LinearGradient>
                  <AppText variant="caption" style={styles.rememberText}>Ține-mă minte</AppText>
                </Pressable>
                <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={10} style={({ pressed }) => pressed && styles.pressed}>
                  <AppText variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>Ai uitat parola?</AppText>
                </Pressable>
              </View>

              {error ? <View style={[styles.error, { backgroundColor: isDark ? 'rgba(231,53,76,0.15)' : palette.dangerSoft, borderColor: 'rgba(231,53,76,0.24)' }]}><Ionicons name="alert-circle" size={18} color={palette.danger} /><AppText variant="caption" style={{ color: palette.danger, flex: 1 }}>{error}</AppText></View> : null}

              <Pressable disabled={loading} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined); void submit(); }} style={({ pressed }) => [styles.loginButton, { opacity: loading ? 0.72 : pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
                <LinearGradient colors={['#3988FF', '#075CFF', '#0648D7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.loginGradient}>
                  {loading ? <LoadingGlyph color="#FFFFFF" size={20} /> : <><AppText variant="label" style={styles.loginLabel}>Intră în G-Shop</AppText><View style={styles.arrowBubble}><Ionicons name="arrow-forward" size={17} color="#FFFFFF" /></View></>}
                </LinearGradient>
              </Pressable>
            </View>

            <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
              <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
              <AppText variant="caption" muted>Datele sunt transmise criptat către server</AppText>
            </View>
          </View>

          <View style={styles.themeArea}>
            <AppText variant="caption" muted style={styles.themeLabel}>ASPECT INTERFAȚĂ</AppText>
            <ThemeToggle />
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  </LinearGradient>;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl },
  shell: { width: '100%', maxWidth: 440, alignItems: 'center', gap: spacing.xl },
  orb: { position: 'absolute', borderRadius: radius.pill },
  orbTop: { width: 330, height: 330, top: -190, right: -130 },
  orbBottom: { width: 390, height: 390, bottom: -250, left: -190 },
  lightBeam: { position: 'absolute', top: 155, left: -100, right: -100, height: 2, transform: [{ rotate: '-7deg' }] },
  logoArea: { alignItems: 'center', gap: spacing.md },
  logoHalo: { width: 116, height: 116, borderRadius: 38, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: palette.electric, shadowOpacity: 0.24, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  logoCrop: { width: 94, height: 94, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 94, height: 94, transform: [{ scale: 1.72 }] },
  secureBadge: { minHeight: 28, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.success, shadowOpacity: 0.65, shadowRadius: 5 },
  badgeText: { fontSize: 10, letterSpacing: 1.45, fontWeight: '800' },
  card: { width: '100%', borderRadius: 28, borderWidth: 1, padding: spacing.xxl, overflow: 'hidden', shadowOpacity: 0.14, shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 10 },
  cardGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -120, right: -70 },
  heading: { alignItems: 'center', gap: spacing.sm },
  shield: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs, shadowColor: palette.electric, shadowOpacity: 0.30, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  title: { fontSize: 29, lineHeight: 35, letterSpacing: -0.75, textAlign: 'center' },
  subtitle: { textAlign: 'center' },
  form: { gap: spacing.lg, marginTop: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  remember: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rememberText: { fontWeight: '700' },
  checkbox: { width: 23, height: 23, borderWidth: 1.5, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.66 },
  error: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  loginButton: { minHeight: 56, borderRadius: 18, overflow: 'hidden', shadowColor: palette.electric, shadowOpacity: 0.28, shadowRadius: 15, shadowOffset: { width: 0, height: 9 }, elevation: 6 },
  loginGradient: { minHeight: 56, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  loginLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  arrowBubble: { position: 'absolute', right: 8, width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  cardFooter: { marginTop: spacing.xxl, paddingTop: spacing.lg, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  themeArea: { alignItems: 'center', gap: spacing.sm },
  themeLabel: { fontSize: 9, letterSpacing: 1.5, fontWeight: '800' },
});
