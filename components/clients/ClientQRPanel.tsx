import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { clientRepository } from '@/repositories/api-repositories';
import { radius, spacing } from '@/theme/tokens';
import { Client } from '@/types';
import { formatDate, normalizePhoneForWhatsApp } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { useRef } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';

const messageFor = (link: string) => `Bună ziua! Puteți urmări statusul reparației dumneavoastră în G-Shop accesând acest link privat: ${link}`;
export function ClientQRPanel({ client }: { client: Client }) {
  const { colors } = useAppTheme(); const { hasPermission } = useAuth(); const { showToast } = useToast(); const qrRef = useRef<View>(null); const qr = client.qr; const link = qr?.publicUrl ?? '';
  const record = async (method: string) => { try { await clientRepository.recordQrShare(client.id, method); } catch { /* Share action is still useful if analytics fail. */ } };
  const openWhatsApp = async () => { if (!link) return; const phone = normalizePhoneForWhatsApp(client.phone); if (!phone) return showToast('Clientul nu are un număr de telefon valid.', 'error'); const url = `https://wa.me/${phone}?text=${encodeURIComponent(messageFor(link))}`; const supported = await Linking.canOpenURL(url); if (!supported) return showToast('WhatsApp nu este disponibil pe acest dispozitiv.', 'error'); await Linking.openURL(url); await record('WHATSAPP'); };
  const save = async () => { if (!qrRef.current) return; const permission = await MediaLibrary.requestPermissionsAsync(); if (!permission.granted) return showToast('Permite accesul la galerie pentru a salva QR-ul.', 'error'); try { const uri = await captureRef(qrRef, { format: 'png', quality: 1 }); await MediaLibrary.saveToLibraryAsync(uri); showToast('Codul QR a fost salvat în galerie.', 'success'); } catch { showToast('Imaginea QR nu a putut fi salvată.', 'error'); } };
  const shareQrImage = async () => { if (!qrRef.current) return; try { if (!(await Sharing.isAvailableAsync())) return showToast('Partajarea imaginilor nu este disponibilă pe acest dispozitiv.', 'error'); const uri = await captureRef(qrRef, { format: 'png', quality: 1 }); await Sharing.shareAsync(uri, { dialogTitle: 'Trimite codul QR G-Shop', mimeType: 'image/png', UTI: 'public.png' }); await record('NATIVE'); } catch { showToast('Imaginea QR nu a putut fi partajată.', 'error'); } };
  if (!qr || qr.status === 'NOT_GENERATED') return <Card style={styles.empty}><View style={[styles.bigIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="qr-code-outline" size={42} color={colors.textMuted} /></View><AppText variant="heading">Cod QR indisponibil</AppText><AppText muted style={styles.center}>Această înregistrare provine din versiunea anterioară. Clienții noi primesc automat codul QR la adăugare.</AppText></Card>;
  if (!hasPermission('qr.share')) return <Card style={styles.empty}><View style={[styles.bigIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} /></View><AppText variant="heading">Cod QR protejat</AppText><AppText muted style={styles.center}>Contul tău poate vedea clientul, dar afișarea, salvarea și trimiterea codului necesită permisiunea „Trimite QR”.</AppText>{hasPermission('qr.scan') ? <Button label="Scanează un cod QR" icon="scan-outline" variant="secondary" onPress={() => router.push('/service/qr-scanner')} /> : null}</Card>;
  const qrValue = link || qr.token;
  if (!qrValue) return <Card style={styles.empty}><View style={[styles.bigIcon, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} /></View><AppText variant="heading">Date QR indisponibile</AppText><AppText muted style={styles.center}>Datele securizate ale codului nu au putut fi încărcate. Reîncarcă pagina și încearcă din nou.</AppText></Card>;
  const displayStatus = qr.status === 'REGENERATED' ? 'GENERATED' : qr.status;
  return <Card style={styles.panel}><View style={styles.top}><View><AppText variant="heading">Cod QR client</AppText><AppText variant="caption" muted>Generat {formatDate(qr.generatedAt, true)}</AppText></View><StatusBadge status={displayStatus} /></View><View ref={qrRef} collapsable={false} style={styles.qrBox}><QRCode value={qrValue} size={220} color="#07152D" backgroundColor="#FFFFFF" ecl="H" quietZone={8} logo={require('@/logo/app-icon.png')} logoSize={50} logoMargin={4} logoBackgroundColor="#FFFFFF" logoBorderRadius={12} /></View><AppText variant="caption" muted style={styles.center}>Link privat pentru urmărirea reparației</AppText><Button label="Trimite linkul de status pe WhatsApp" icon="logo-whatsapp" onPress={() => void openWhatsApp()} /><View style={styles.buttons}><Button label="Trimite codul QR" icon="send-outline" onPress={() => void shareQrImage()} style={{ flex: 1 }} /><Button label="Salvează" icon="download-outline" variant="outline" onPress={() => void save()} /></View></Card>;
}
const styles = StyleSheet.create({ empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl }, bigIcon: { width: 78, height: 78, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, center: { textAlign: 'center' }, panel: { gap: spacing.lg }, top: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'center' }, qrBox: { padding: spacing.lg, backgroundColor: '#fff', borderRadius: radius.lg, alignSelf: 'center' }, buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md } });
