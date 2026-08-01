import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

const actions = [{ value: 'OPEN_PROFILE', label: 'Deschide profil' }, { value: 'CHECK_IN', label: 'Check-in' }, { value: 'DROP_OFF', label: 'Predare' }, { value: 'PICK_UP', label: 'Ridicare' }] as const;
export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions(); const [scanned, setScanned] = useState(false); const [busy, setBusy] = useState(false); const [action, setAction] = useState<(typeof actions)[number]['value']>('OPEN_PROFILE'); const { colors } = useAppTheme(); const { activeProperty } = useProperty(); const { showToast } = useToast();
  useFocusEffect(useCallback(() => {
    setScanned(false);
    setBusy(false);
  }, []));
  const handleScan = async ({ data }: BarcodeScanningResult) => {
    if (scanned || busy) return; setScanned(true); setBusy(true);
    try { const result = await apiRequest<{ clientId: string; clientName: string }>('/qr/resolve', { method: 'POST', body: JSON.stringify({ data, action, propertyId: activeProperty?.id, device: `${Platform.OS} ${Platform.Version}` }) }); showToast(`${result.clientName}: cod QR valid.`, 'success'); router.push(`/service/clients/${result.clientId}`); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Codul nu este valid.', 'error'); setTimeout(() => setScanned(false), 1200); }
    finally { setBusy(false); }
  };
  if (!permission) return <Screen header={<AppHeader title="Scanare QR" />}><Card style={styles.permission}><AppText>Se verifică permisiunea camerei…</AppText></Card></Screen>;
  if (!permission.granted) return <Screen header={<AppHeader title="Scanare QR" />}><Card style={styles.permission}><View style={[styles.permissionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="camera-outline" size={38} color={colors.primary} /></View><AppText variant="title" style={styles.center}>Permite accesul la cameră</AppText><AppText muted style={styles.center}>Camera este folosită numai pentru citirea codurilor QR G-Shop.</AppText><Button label="Permite camera" icon="camera-outline" onPress={() => void requestPermission()} /></Card></Screen>;
  return <Screen header={<AppHeader title="Scanare QR" />}><Card style={styles.card}><View><AppText variant="heading">Acțiunea scanării</AppText><AppText variant="caption" muted>Alege ce vrei să înregistrezi în jurnal.</AppText></View><View style={styles.actions}>{actions.map((item) => <Pressable key={item.value} onPress={() => setAction(item.value)} style={[styles.action, { backgroundColor: action === item.value ? colors.primary : colors.surfaceMuted }]}><AppText variant="caption" style={{ color: action === item.value ? '#fff' : colors.textMuted, fontWeight: '800' }}>{item.label}</AppText></Pressable>)}</View></Card><View style={styles.cameraWrap}><CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned ? undefined : (result) => void handleScan(result)}><View style={styles.cameraOverlay}><View style={styles.guide}><Corner position="tl" /><Corner position="tr" /><Corner position="bl" /><Corner position="br" /><View style={styles.scanLine} /></View><View style={styles.cameraLabel}><Ionicons name="scan" size={20} color="#fff" /><AppText variant="label" style={{ color: '#fff' }}>{busy ? 'Se validează…' : 'Încadrează codul QR'}</AppText></View></View></CameraView></View><Card style={styles.tip}><Ionicons name="shield-checkmark-outline" size={22} color={palette.success} /><AppText variant="caption" muted style={{ flex: 1 }}>Validarea se face online. Fiecare scanare este asociată utilizatorului, proprietății și dispozitivului.</AppText></Card>{scanned && !busy ? <Button variant="outline" label="Scanează din nou" icon="refresh" onPress={() => setScanned(false)} /> : null}</Screen>;
}
function Corner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) { return <View style={[styles.corner, position.includes('t') ? { top: 0 } : { bottom: 0 }, position.includes('l') ? { left: 0 } : { right: 0 }, position === 'tr' || position === 'bl' ? { transform: [{ rotate: '90deg' }] } : undefined]} />; }
const styles = StyleSheet.create({ permission: { minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }, permissionIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, center: { textAlign: 'center', maxWidth: 420 }, card: { gap: spacing.md }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, action: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 }, cameraWrap: { width: '100%', maxWidth: 620, alignSelf: 'center', aspectRatio: 0.82, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000' }, cameraOverlay: { flex: 1, backgroundColor: '#0004', alignItems: 'center', justifyContent: 'center', gap: spacing.xxl }, guide: { width: '70%', aspectRatio: 1, position: 'relative' }, corner: { position: 'absolute', width: 48, height: 48, borderLeftWidth: 5, borderTopWidth: 5, borderColor: '#fff', borderTopLeftRadius: 12 }, scanLine: { position: 'absolute', top: '50%', left: 10, right: 10, height: 2, backgroundColor: palette.electric, shadowColor: palette.electric, shadowOpacity: 1, shadowRadius: 9 }, cameraLabel: { flexDirection: 'row', backgroundColor: '#061226CC', borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: spacing.lg, alignItems: 'center', gap: spacing.sm }, tip: { flexDirection: 'row', alignItems: 'center', gap: spacing.md } });
