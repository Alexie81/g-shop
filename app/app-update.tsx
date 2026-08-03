import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useBackToAdministration } from '@/hooks/useBackToAdministration';
import { appUpdateRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { compareVersions, releaseVersion } from '@/utils/app-version';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Linking, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

export default function AppUpdateScreen() {
  useBackToAdministration();
  const { colors } = useAppTheme();
  const { showToast } = useToast();
  const [installing, setInstalling] = useState(false);
  const [heroHeight, setHeroHeight] = useState(190);
  const state = useAsyncData(() => appUpdateRepository.get(), []);
  const currentVersion = releaseVersion();
  const serverVersion = state.data?.latestVersion ?? currentVersion;
  const latest = compareVersions(serverVersion, currentVersion) > 0 ? serverVersion : currentVersion;
  const updateAvailable = compareVersions(currentVersion, latest) < 0;

  const download = async () => {
    const url = state.data?.downloadUrl?.trim();
    if (!url) return showToast('Linkul pentru versiunea Android nu a fost publicat încă.', 'info');
    try { await Linking.openURL(url); } catch { showToast('Pagina de descărcare nu a putut fi deschisă.', 'error'); }
  };

  const installLatest = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      if (Platform.OS !== 'web' && Updates.isEnabled) {
        const ota = await Updates.checkForUpdateAsync();
        if (ota.isAvailable) {
          showToast('Descărcăm actualizarea. Aplicația se va redeschide automat.', 'info');
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return;
        }
      }
      if (updateAvailable) await download();
      else showToast('Ai deja cea mai nouă versiune disponibilă.', 'success');
    } catch {
      if (updateAvailable) await download();
      else showToast('Actualizarea nu a putut fi verificată acum.', 'error');
    } finally {
      setInstalling(false);
    }
  };

  return <Screen header={<AppHeader title="Actualizare aplicație" back onBack={() => router.replace('/service/more')} />} scroll={false} bottomInset={false} style={styles.screen}>
    <View style={styles.root}>
      <LinearGradient onLayout={(event) => setHeroHeight(event.nativeEvent.layout.height)} colors={updateAvailable ? ['#5B21B6', '#075CFF'] : ['#075CFF', '#08A7C7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, styles.fixedHero]}>
        <View pointerEvents="none" style={styles.orb} />
        <View style={styles.appIcon}><Ionicons name="cloud-download-outline" size={38} color="#FFFFFF" /></View>
        <View style={styles.heroCopy}><AppText variant="caption" style={styles.eyebrow}>G-SHOP PENTRU ANDROID</AppText><AppText variant="title" style={styles.heroTitle}>{updateAvailable ? 'Este disponibilă o versiune nouă' : 'Aplicația este actualizată'}</AppText><AppText style={styles.heroSubtitle}>{updateAvailable ? `Poți trece acum de la versiunea ${currentVersion} la ${latest}.` : `Folosești versiunea ${currentVersion}, cea mai nouă versiune publicată.`}</AppText></View>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: heroHeight + spacing.xs }]} refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.reload(true)} tintColor={colors.primary} />} showsVerticalScrollIndicator={false}>
      <View style={[styles.sheet, { backgroundColor: colors.background, shadowColor: colors.shadow }]}>
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
      {state.loading ? <LoadingState rows={4} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : <>
        <Card style={styles.versionCard} elevated>
          <View style={[styles.statusIcon, { backgroundColor: updateAvailable ? `${palette.warning}18` : `${palette.success}18` }]}><Ionicons name={updateAvailable ? 'arrow-up-circle-outline' : 'checkmark-circle-outline'} size={29} color={updateAvailable ? palette.warning : palette.success} /></View>
          <View style={styles.versionCopy}><AppText variant="heading">Versiuni</AppText><View style={styles.versionRows}><Version label="Instalată" value={currentVersion} /><Ionicons name="arrow-forward" size={18} color={colors.textMuted} /><Version label="Disponibilă" value={latest} accent={updateAvailable} /></View></View>
          <View style={[styles.statusBadge, { backgroundColor: updateAvailable ? `${palette.warning}16` : `${palette.success}16` }]}><AppText variant="caption" style={{ color: updateAvailable ? palette.warning : palette.success, fontWeight: '800' }}>{updateAvailable ? 'UPDATE' : 'LA ZI'}</AppText></View>
        </Card>

        <Card style={styles.section} elevated>
          <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: `${palette.purple}16` }]}><Ionicons name="sparkles-outline" size={22} color={palette.purple} /></View><View style={styles.sectionCopy}><AppText variant="heading">Ce este nou</AppText><AppText variant="caption" muted>Noutățile incluse în versiunea {latest}.</AppText></View></View>
          <View style={styles.notes}>{(state.data?.releaseNotes.length ? state.data.releaseNotes : ['Îmbunătățiri de stabilitate și experiență.']).map((note, index) => <View key={`${index}-${note}`} style={styles.note}><View style={[styles.noteIndex, { backgroundColor: colors.primarySoft }]}><AppText variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>{index + 1}</AppText></View><AppText style={styles.noteText}>{note}</AppText></View>)}</View>
          {state.data?.publishedAt ? <AppText variant="caption" muted>Publicată la {state.data.publishedAt}</AppText> : null}
        </Card>

        <Card style={styles.section} elevated>
          <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: `${palette.success}16` }]}><Ionicons name="shield-checkmark-outline" size={22} color={palette.success} /></View><View style={styles.sectionCopy}><AppText variant="heading">Actualizare sigură</AppText><AppText variant="caption" muted>Descarcă versiunea exclusiv din linkul oficial publicat de G-Shop.</AppText></View></View>
          <Button label={updateAvailable ? 'Descarcă și actualizează' : 'Verifică și actualizează'} icon="download-outline" loading={installing} disabled={Platform.OS !== 'android' && Platform.OS !== 'web'} onPress={() => void installLatest()} />
          <Button variant="outline" label="Verifică din nou" icon="refresh-outline" loading={state.refreshing} onPress={() => void state.reload(true)} />
        </Card>
      </>}
      </View>
      </ScrollView>
    </View>
  </Screen>;
}

function Version({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { const { colors } = useAppTheme(); return <View><AppText variant="caption" muted>{label}</AppText><AppText variant="heading" style={accent ? { color: colors.primary } : undefined}>{value}</AppText></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 0, paddingBottom: 0 }, root: { flex: 1, overflow: 'hidden' }, scroll: { flex: 1 }, scrollContent: {}, sheet: { width: '100%', maxWidth: 820, minHeight: 720, alignSelf: 'center', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: spacing.lg, paddingBottom: 112, gap: spacing.lg, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 12 }, sheetHandle: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center' }, hero: { minHeight: 190, borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: spacing.md }, fixedHero: { position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg }, orb: { position: 'absolute', width: 250, height: 250, borderRadius: 125, top: -140, right: -75, backgroundColor: 'rgba(255,255,255,0.11)' }, appIcon: { width: 74, height: 74, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.17)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }, heroCopy: { alignItems: 'center', gap: spacing.xs }, eyebrow: { color: '#D6E5FF', fontWeight: '900', letterSpacing: 1.1 }, heroTitle: { color: '#FFFFFF', textAlign: 'center' }, heroSubtitle: { color: '#D8E7FF', textAlign: 'center' },
  versionCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, statusIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, versionCopy: { minWidth: 0, flex: 1, gap: spacing.sm }, versionRows: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }, statusBadge: { minHeight: 28, borderRadius: radius.pill, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  expoNotice: { minHeight: 74, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, noticeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, noticeCopy: { minWidth: 0, flex: 1, gap: 2 },
  section: { gap: spacing.lg }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, sectionIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, sectionCopy: { minWidth: 0, flex: 1, gap: 2 }, notes: { gap: spacing.md }, note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, noteIndex: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, noteText: { minWidth: 0, flex: 1 },
});
