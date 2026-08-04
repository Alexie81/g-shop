import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAppTheme } from '@/contexts/ThemeContext';
import { appUpdateRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { AppUpdateInfo } from '@/types';
import { compareVersions, isNativeUpdateAvailable, manifestReleaseVersion, releaseVersion } from '@/utils/app-version';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

export function AppUpdateCoordinator() {
  const { colors, isDark } = useAppTheme();
  const updates = Updates.useUpdates();
  const checked = useRef(false);
  const [visible, setVisible] = useState(false);
  const [published, setPublished] = useState<AppUpdateInfo | null>(null);

  useEffect(() => {
    if (checked.current || Platform.OS === 'web') return;
    checked.current = true;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const info = await appUpdateRepository.get();
          const nativeUpdateAvailable = isNativeUpdateAvailable(info.latestBuildNumber, info.latestVersion);
          if (Updates.isEnabled && !updates.isUpdatePending) {
            try {
              const result = await Updates.checkForUpdateAsync();
              const candidate = result.isAvailable ? manifestReleaseVersion(result.manifest) : null;
              if (result.isAvailable && (!candidate || compareVersions(candidate, releaseVersion()) > 0)) {
                await Updates.fetchUpdateAsync();
              }
            }
            catch { /* Verificarea versiunii native rămâne disponibilă fără serviciul OTA. */ }
          }
          if (!nativeUpdateAvailable) return;
          setPublished(info);
          setVisible(true);
        } catch {
          // Pornirea aplicației nu trebuie blocată dacă verificarea nu este disponibilă.
        }
      })();
    }, 1200);

    return () => clearTimeout(timer);
  }, [updates.isUpdatePending]);

  const openNativeUpdate = () => {
    setVisible(false);
    router.push('/app-update');
  };

  const availableVersion = published?.latestVersion ?? releaseVersion();
  const notes = published?.releaseNotes.slice(0, 2) ?? [];

  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setVisible(false)}>
    <ModalSafeBottom style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} />
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <LinearGradient colors={isDark ? ['#32146F', '#075CFF'] : ['#6937E6', '#075CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View pointerEvents="none" style={styles.glow} />
          <View style={styles.updateIcon}><Ionicons name="cloud-download-outline" size={31} color="#FFFFFF" /></View>
          <View style={styles.heroCopy}><AppText variant="caption" style={styles.eyebrow}>ACTUALIZARE G-SHOP</AppText><AppText variant="title" style={styles.heroTitle}>O versiune nouă este gata</AppText><AppText style={styles.heroText}>Este disponibilă o versiune nouă a aplicației Android.</AppText></View>
          <Pressable accessibilityLabel="Mai târziu" onPress={() => setVisible(false)} style={styles.close}><Ionicons name="close" size={22} color="#FFFFFF" /></Pressable>
        </LinearGradient>

        <View style={styles.body}>
          <View style={[styles.versionRow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <View><AppText variant="caption" muted>Versiunea curentă</AppText><AppText variant="heading">{releaseVersion()}</AppText></View>
            <View style={[styles.arrow, { backgroundColor: colors.primarySoft }]}><Ionicons name="arrow-forward" size={18} color={colors.primary} /></View>
            <View style={styles.available}><AppText variant="caption" muted>Actualizarea</AppText><AppText variant="heading" style={{ color: colors.primary }}>{availableVersion}</AppText></View>
          </View>

          <View style={styles.notes}>{notes.map((note) => <View key={note} style={styles.note}><View style={[styles.check, { backgroundColor: `${palette.success}18` }]}><Ionicons name="checkmark" size={15} color={palette.success} /></View><AppText style={styles.noteCopy}>{note}</AppText></View>)}</View>

          <Button label="Vezi actualizarea" icon="sparkles-outline" onPress={openNativeUpdate} />
          <Pressable onPress={() => setVisible(false)} style={styles.later}><AppText variant="label" muted>Mai târziu</AppText></Pressable>
        </View>
      </View>
    </ModalSafeBottom>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg }, card: { width: '100%', maxWidth: 470, borderWidth: 1, borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.28, shadowRadius: 34, elevation: 20 }, hero: { minHeight: 184, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, overflow: 'hidden' }, glow: { position: 'absolute', width: 250, height: 250, borderRadius: 125, top: -155, right: -60, backgroundColor: '#FFFFFF18' }, updateIcon: { width: 62, height: 62, borderRadius: 21, backgroundColor: '#FFFFFF1E', borderWidth: 1, borderColor: '#FFFFFF2A', alignItems: 'center', justifyContent: 'center' }, heroCopy: { minWidth: 0, flex: 1, gap: 3 }, eyebrow: { color: '#DDE7FF', fontWeight: '900', letterSpacing: 1 }, heroTitle: { color: '#FFFFFF' }, heroText: { color: '#E4ECFF' }, close: { position: 'absolute', top: spacing.md, right: spacing.md, width: 38, height: 38, borderRadius: 13, backgroundColor: '#FFFFFF18', alignItems: 'center', justifyContent: 'center' }, body: { padding: spacing.xl, gap: spacing.lg }, versionRow: { minHeight: 76, padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, arrow: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, available: { minWidth: 0, flex: 1 }, notes: { gap: spacing.sm }, note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, check: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, noteCopy: { minWidth: 0, flex: 1, lineHeight: 21 }, later: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
});
