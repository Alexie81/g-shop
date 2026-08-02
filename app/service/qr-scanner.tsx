import { AppHeader } from '@/components/layout/AppHeader';
import { ScanServiceSheetModal } from '@/components/service-sheets/ScanServiceSheetModal';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { serviceSheetRepository } from '@/repositories/api-repositories';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { ServiceSheet, UUID } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

type ScanTarget = { clientId: UUID; clientName: string; existingSheet: ServiceSheet | null };

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const { colors, isDark } = useAppTheme();
  const { activeProperty } = useProperty();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const mobile = width < 620;
  const [heroHeight, setHeroHeight] = useState(132);
  const scanProgress = useRef(new Animated.Value(0)).current;
  const cameraWidth = Math.min(width - (mobile ? 32 : 64), 720);
  const guideSize = cameraWidth * (mobile ? 0.74 : 0.56);

  useFocusEffect(useCallback(() => {
    setScanned(false);
    setBusy(false);
    setScanTarget(null);
  }, []));

  useEffect(() => {
    if (!permission?.granted || scanned) {
      scanProgress.stopAnimation();
      return;
    }
    scanProgress.setValue(0);
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(scanProgress, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(scanProgress, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [permission?.granted, scanProgress, scanned]);

  const handleScan = async ({ data }: BarcodeScanningResult) => {
    if (scanned || busy) return;
    setScanned(true);
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    try {
      const result = await apiRequest<{ clientId: string; clientName: string }>('/qr/resolve', {
        method: 'POST',
        body: JSON.stringify({ data, action: 'OPEN_PROFILE', propertyId: activeProperty?.id, device: `${Platform.OS} ${Platform.Version}` }),
      });
      const existingSheet = activeProperty?.id
        ? await serviceSheetRepository.list(activeProperty.id).then((response) => response.data.find((sheet) => sheet.clientId === result.clientId) ?? null).catch(() => null)
        : null;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      showToast(`${result.clientName}: completează fișa rapidă.`, 'success');
      setScanTarget({ clientId: result.clientId, clientName: result.clientName, existingSheet });
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      showToast(error instanceof Error ? error.message : 'Codul nu este valid.', 'error');
      setTimeout(() => setScanned(false), 1200);
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return <Screen header={<AppHeader title="Scanare" />}>
      <View style={styles.stateWrap}><Card style={styles.permission}><View style={[styles.permissionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="camera-outline" size={34} color={colors.primary} /></View><AppText variant="heading">Pregătim camera…</AppText><AppText variant="caption" muted style={styles.center}>Verificăm accesul necesar pentru scanarea codului QR.</AppText></Card></View>
    </Screen>;
  }

  if (!permission.granted) {
    return <Screen header={<AppHeader title="Scanare" />}>
      <View style={styles.stateWrap}><Card style={styles.permission}><View style={[styles.permissionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="camera-outline" size={38} color={colors.primary} /></View><View style={styles.permissionCopy}><AppText variant="title" style={styles.center}>Activează camera</AppText><AppText muted style={styles.center}>G-Shop folosește camera numai pentru citirea codurilor QR ale clienților.</AppText></View><Button label="Permite accesul" icon="camera-outline" onPress={() => void requestPermission()} style={styles.permissionButton} /></Card></View>
    </Screen>;
  }

  const scanTranslate = scanProgress.interpolate({ inputRange: [0, 1], outputRange: [10, Math.max(12, guideSize - 14)] });

  return <Screen header={<AppHeader title="Scanare" />} scroll={false} bottomInset={false} style={styles.screenContent}>
    <View style={styles.root}>
      <View style={[styles.heroLayer, mobile && styles.heroLayerMobile]}>
        <LinearGradient onLayout={(event) => { const nextHeight = event.nativeEvent.layout.height; if (Math.abs(nextHeight - heroHeight) > 1) setHeroHeight(nextHeight); }} colors={isDark ? ['#0B3280', '#075CFF'] : ['#123D9D', '#1477FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, mobile && styles.heroMobile]}>
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />
          <View style={styles.heroIcon}><Ionicons name="qr-code-outline" size={30} color="#fff" /></View>
          <View style={styles.heroCopy}><View style={styles.eyebrow}><View style={styles.liveDot} /><AppText variant="caption" style={styles.eyebrowText}>CAMERĂ PREGĂTITĂ</AppText></View><AppText variant="title" style={styles.heroTitle}>Scanează codul clientului</AppText><AppText variant="caption" style={styles.heroSubtitle}>Încadrează codul în chenar. Fișa rapidă se deschide automat.</AppText></View>
        </LinearGradient>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: heroHeight + spacing.xs }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.sheet, mobile && styles.sheetMobile, { backgroundColor: colors.background, shadowColor: colors.shadow }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.page}>
            <View style={[styles.cameraShell, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
              <View style={[styles.cameraWrap, { aspectRatio: mobile ? 0.78 : 1.48 }]}>
                <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned ? undefined : (result) => void handleScan(result)}>
                  <LinearGradient colors={['rgba(2,8,20,0.28)', 'rgba(2,8,20,0.03)', 'rgba(2,8,20,0.64)']} style={styles.cameraOverlay}>
                    <View style={styles.cameraStatus}><View style={[styles.statusDot, busy && styles.statusDotBusy]} /><AppText variant="caption" style={styles.statusText}>{busy ? 'Se validează codul…' : 'Scanare activă'}</AppText></View>
                    <View style={[styles.guide, { width: mobile ? '74%' : '56%' }]}>
                      <Corner position="tl" /><Corner position="tr" /><Corner position="bl" /><Corner position="br" />
                      <View style={styles.guideCenter}><Ionicons name="qr-code-outline" size={30} color="rgba(255,255,255,0.48)" /></View>
                      {!scanned ? <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanTranslate }] }]}><View style={styles.scanLineGlow} /></Animated.View> : null}
                    </View>
                    <View style={styles.cameraLabel}><Ionicons name={busy ? 'sync-outline' : 'scan-outline'} size={20} color="#fff" /><View><AppText variant="label" style={styles.cameraLabelTitle}>{busy ? 'Verificăm codul' : 'Ține telefonul nemișcat'}</AppText><AppText variant="caption" style={styles.cameraLabelCaption}>{busy ? 'Durează doar o clipă' : 'Detectarea este automată'}</AppText></View></View>
                  </LinearGradient>
                </CameraView>
              </View>
            </View>

            <View style={[styles.tip, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.tipIcon, { backgroundColor: isDark ? '#123A2C' : palette.successSoft }]}><Ionicons name="shield-checkmark-outline" size={22} color={palette.success} /></View><View style={styles.tipCopy}><AppText variant="label">Scanare sigură</AppText><AppText variant="caption" muted>Codul este validat online și pregătește fișa clientului asociat.</AppText></View></View>
            {scanned && !busy ? <Button variant="outline" label="Scanează din nou" icon="refresh" onPress={() => setScanned(false)} style={styles.retryButton} /> : null}
          </View>
        </View>
      </ScrollView>
      {scanTarget && activeProperty?.id ? <ScanServiceSheetModal
        visible
        propertyId={activeProperty.id}
        clientId={scanTarget.clientId}
        clientName={scanTarget.clientName}
        existingSheet={scanTarget.existingSheet}
        onCancel={() => { setScanTarget(null); setScanned(false); }}
        onCompleted={(sheet) => { setScanTarget(null); router.replace(`/service/service-sheets/${sheet.id}`); }}
      /> : null}
    </View>
  </Screen>;
}

function Corner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const rotation = { tl: '0deg', tr: '90deg', br: '180deg', bl: '270deg' }[position];
  const vertical = position.startsWith('t') ? { top: 0 } : { bottom: 0 };
  const horizontal = position.endsWith('l') ? { left: 0 } : { right: 0 };
  return <View style={[styles.corner, vertical, horizontal, { transform: [{ rotate: rotation }] }]} />;
}

const styles = StyleSheet.create({
  screenContent: { flex: 1, padding: 0, paddingBottom: 0 },
  root: { flex: 1, overflow: 'hidden' },
  heroLayer: { position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  heroLayerMobile: { top: spacing.md, left: spacing.md, right: spacing.md },
  scroll: { flex: 1, zIndex: 1 },
  scrollContent: { flexGrow: 1 },
  sheet: { minHeight: 720, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 112, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  sheetMobile: { paddingHorizontal: spacing.md },
  sheetHandle: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginBottom: spacing.lg },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.lg },
  hero: { width: '100%', maxWidth: 720, minHeight: 132, borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroMobile: { minHeight: 124, padding: spacing.lg },
  heroGlowLarge: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -62, top: -116, backgroundColor: '#FFFFFF12' },
  heroGlowSmall: { position: 'absolute', width: 92, height: 92, borderRadius: 46, right: 58, bottom: -54, backgroundColor: '#FFFFFF0C' },
  heroIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#FFFFFF1C', borderWidth: 1, borderColor: '#FFFFFF24', alignItems: 'center', justifyContent: 'center' },
  heroCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#67F49B', shadowColor: '#67F49B', shadowOpacity: 0.9, shadowRadius: 6 },
  eyebrowText: { color: '#DDEAFF', fontWeight: '900', letterSpacing: 0.9 },
  heroTitle: { color: '#fff' },
  heroSubtitle: { color: '#E3EDFF', lineHeight: 19, maxWidth: 520 },
  cameraShell: { width: '100%', padding: 5, borderWidth: 1, borderRadius: 29, shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 7 },
  cameraWrap: { width: '100%', borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#020711' },
  cameraOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraStatus: { position: 'absolute', top: spacing.lg, left: spacing.lg, minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: 'rgba(4,12,26,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#44E47B' },
  statusDotBusy: { backgroundColor: '#68A4FF' },
  statusText: { color: '#fff', fontWeight: '800' },
  guide: { aspectRatio: 1, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  guideCenter: { width: 62, height: 62, borderRadius: 22, backgroundColor: 'rgba(4,12,26,0.25)', alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 52, height: 52, borderLeftWidth: 5, borderTopWidth: 5, borderColor: '#fff', borderTopLeftRadius: 14, shadowColor: '#075CFF', shadowOpacity: 0.8, shadowRadius: 7 },
  scanLine: { position: 'absolute', top: 0, left: 13, right: 13, height: 3, borderRadius: 2, backgroundColor: '#3E8BFF', shadowColor: '#2F79FF', shadowOpacity: 1, shadowRadius: 12, elevation: 5 },
  scanLineGlow: { position: 'absolute', left: '15%', right: '15%', top: -2, height: 7, borderRadius: 4, backgroundColor: 'rgba(87,157,255,0.48)' },
  cameraLabel: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, minHeight: 58, backgroundColor: 'rgba(4,12,26,0.78)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  cameraLabelTitle: { color: '#fff' },
  cameraLabelCaption: { color: '#C9D5E8' },
  tip: { minHeight: 76, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tipIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tipCopy: { minWidth: 0, flex: 1, gap: 2 },
  retryButton: { width: '100%' },
  stateWrap: { width: '100%', maxWidth: 620, alignSelf: 'center', minHeight: 520, justifyContent: 'center' },
  permission: { minHeight: 350, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xxl },
  permissionIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  permissionCopy: { alignItems: 'center', gap: spacing.sm },
  permissionButton: { minWidth: 220 },
  center: { textAlign: 'center', maxWidth: 420 },
});
