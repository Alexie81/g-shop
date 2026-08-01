import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

export default function LoginScreen() {
  const { colors, isDark } = useAppTheme();
  const { login, savedUsername } = useAuth();
  const [username, setUsername] = useState(savedUsername || 'admin');
  const [password, setPassword] = useState('admin');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (savedUsername) setUsername(savedUsername); }, [savedUsername]);

  const submit = async () => {
    if (!username.trim() || !password) { setError('Completează utilizatorul și parola.'); return; }
    setLoading(true); setError('');
    try { await login(username, password, remember); router.replace('/'); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Autentificarea a eșuat.'); }
    finally { setLoading(false); }
  };

  return <LinearGradient colors={isDark ? ['#040C1A', '#071B3C', '#052A68'] : ['#F9FBFF', '#EEF4FF', '#DDEAFF']} style={styles.root}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.top}><Image source={require('@/logo/logo_text.png')} resizeMode="contain" style={[styles.wordmark, { borderRadius: radius.lg }]} /><AppText variant="body" muted style={styles.tagline}>Gestionează. Automatizează. Crește.</AppText></View>
        <Card style={styles.card} elevated>
          <View style={styles.heading}><View style={[styles.lock, { backgroundColor: colors.primarySoft }]}><Ionicons name="shield-checkmark-outline" size={25} color={colors.primary} /></View><AppText variant="title">Bine ai revenit</AppText><AppText muted style={styles.center}>Autentifică-te pentru a continua în G-Shop.</AppText></View>
          <View style={styles.form}>
            <Input label="Utilizator" icon="person-outline" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} returnKeyType="next" />
            <Input label="Parolă" icon="lock-closed-outline" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={() => void submit()} returnKeyType="done" />
            <View style={styles.row}><Pressable onPress={() => setRemember((value) => !value)} style={styles.remember}><View style={[styles.checkbox, { borderColor: remember ? colors.primary : colors.border, backgroundColor: remember ? colors.primary : 'transparent' }]}>{remember ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}</View><AppText variant="caption">Ține-mă minte</AppText></Pressable><Pressable onPress={() => router.push('/(auth)/forgot-password')}><AppText variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>Ai uitat parola?</AppText></Pressable></View>
            {error ? <View style={[styles.error, { backgroundColor: palette.dangerSoft }]}><Ionicons name="alert-circle" size={18} color={palette.danger} /><AppText variant="caption" style={{ color: palette.danger, flex: 1 }}>{error}</AppText></View> : null}
            <Button label="Autentificare" icon="arrow-forward" loading={loading} onPress={() => void submit()} />
          </View>
          <View style={[styles.demo, { borderTopColor: colors.border }]}><AppText variant="caption" muted>Cont inițial: admin / admin</AppText><AppText variant="caption" muted>Schimbă parola după prima autentificare.</AppText></View>
        </Card>
        <ThemeToggle />
        <AppText variant="caption" muted style={styles.center}>Conexiune securizată la baza de date online</AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  </LinearGradient>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 }, scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.xl }, top: { alignItems: 'center', width: '100%' }, wordmark: { width: 270, height: 110 }, tagline: { textTransform: 'uppercase', letterSpacing: 2.2, marginTop: -12 }, card: { width: '100%', maxWidth: 460, padding: spacing.xxl, gap: spacing.xl }, heading: { alignItems: 'center', gap: spacing.sm }, lock: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, center: { textAlign: 'center' }, form: { gap: spacing.lg }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, remember: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, checkbox: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }, error: { borderRadius: radius.sm, padding: spacing.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, demo: { borderTopWidth: 1, paddingTop: spacing.lg, alignItems: 'center', gap: 3 },
});
