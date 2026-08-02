import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { serviceSheetRepository } from '@/repositories/api-repositories';
import { radius, spacing } from '@/theme/tokens';
import { ServiceSheet } from '@/types';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';

export function SignatureModal({ sheet, visible, onClose, onSaved }: { sheet: ServiceSheet; visible: boolean; onClose: () => void; onSaved: (sheet: ServiceSheet) => void }) {
  const { colors } = useAppTheme(); const { showToast } = useToast(); const ref = useRef<SignatureViewRef>(null); const [saving, setSaving] = useState(false);
  const save = async (signature: string) => { setSaving(true); try { const updated = await serviceSheetRepository.saveSignature(sheet.id, signature); onSaved(updated); showToast('Semnătura clientului a fost salvată.', 'success'); onClose(); } catch (error) { showToast(error instanceof Error ? error.message : 'Semnătura nu a putut fi salvată.', 'error'); } finally { setSaving(false); } };
  const webStyle = '.m-signature-pad { box-shadow: none; border: none; background: #FFFFFF; } .m-signature-pad--body { border: none; background: #FFFFFF; } .m-signature-pad--footer { display: none; } body,html { background: transparent; }';
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={[styles.overlay, { backgroundColor: colors.overlay }]}><View style={[styles.sheet, { backgroundColor: colors.surface }]}><AppText variant="title">Semnătura clientului</AppText><AppText muted>Clientul semnează în câmpul de mai jos pentru fișa {sheet.number}. Data, fișa și operatorul sunt asociate automat.</AppText><View style={[styles.canvas, { borderColor: colors.border, backgroundColor: '#FFFFFF' }]}><SignatureScreen ref={ref} onOK={(signature) => void save(signature)} onEmpty={() => showToast('Câmpul de semnătură este gol.', 'error')} autoClear={false} descriptionText="" clearText="Șterge" confirmText="Salvează" webStyle={webStyle} backgroundColor="transparent" penColor="#07152D" /></View><View style={styles.actions}><Button variant="outline" label="Șterge" icon="trash-outline" onPress={() => ref.current?.clearSignature()} style={{ flex: 1 }} /><Button label="Salvează semnătura" icon="checkmark" loading={saving} onPress={() => ref.current?.readSignature()} style={{ flex: 1 }} /></View><Pressable onPress={onClose}><AppText variant="label" muted style={{ textAlign: 'center' }}>Anulează</AppText></Pressable></View></View></Modal>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, justifyContent: 'flex-end' }, sheet: { width: '100%', maxWidth: 760, alignSelf: 'center', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, gap: spacing.md }, canvas: { height: 330, borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' }, actions: { flexDirection: 'row', gap: spacing.md } });
