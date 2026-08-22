import { SalesDocumentEditorModal } from '@/components/sales/SalesDocumentEditorModal';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { salesSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { GenerateSalesDocumentInput, SalesDocument, SalesDocumentType, SalesSheet } from '@/types';
import { formatDate, normalizePhoneForWhatsApp } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';

type Props = { sheet: SalesSheet; onGenerated?: () => void | Promise<void> };
const DOCUMENTS: { type: SalesDocumentType; step: number; label: string; description: string; tooltip: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { type: 'FINAL_ESTIMATE', step: 1, label: 'Deviz final', description: 'Desfășurător piese și servicii', tooltip: 'Detaliezi fiecare produs, piesă sau serviciu. Totalurile se calculează automat, iar costurile interne nu apar clientului.', icon: 'receipt-outline', color: palette.electric },
  { type: 'WARRANTY', step: 2, label: 'Certificat de garanție', description: 'Perioadă și condiții de garanție', tooltip: 'Devine disponibil după deviz. Preia automat produsul, seria, clientul, semnătura, ștampila și situația financiară.', icon: 'shield-checkmark-outline', color: palette.success },
];

export function SalesDocumentsPanel({ sheet, onGenerated }: Props) {
  const { colors, isDark } = useAppTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [editorType, setEditorType] = useState<SalesDocumentType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canViewFinancials = hasPermission('financials.view');
  const canGenerate = canViewFinancials && (hasPermission('sales_sheets.update') || hasPermission('sales_sheets.create'));
  const canDelete = hasPermission('sales_sheets.update');
  const state = useAsyncData(() => salesSheetRepository.listDocuments(sheet.id), [sheet.id, sheet.signedAt, sheet.updatedAt]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  const slots = DOCUMENTS.map((definition) => ({ definition, document: state.data?.find((item) => item.type === definition.type) }));
  const ready = slots.filter((slot) => slot.document?.available && slot.document.url);
  const missing = state.data ? slots.filter((slot) => !slot.document?.available || !slot.document.url) : [];
  const normalizedPhone = normalizePhoneForWhatsApp(sheet.customerPhone);
  const phone = /^\d{10,15}$/.test(normalizedPhone) ? normalizedPhone : '';
  const selectedDocument = editorType ? state.data?.find((item) => item.type === editorType) : undefined;

  const openEditor = (type: SalesDocumentType) => {
    if (!canGenerate) return showToast('Ai nevoie de acces la valorile financiare și de permisiunea de modificare.', 'info');
    if (type === 'WARRANTY' && !state.data?.some((item) => item.type === 'FINAL_ESTIMATE' && item.available)) return showToast('Creează mai întâi devizul final.', 'info');
    setEditorType(type);
  };
  const generate = async (type: SalesDocumentType, input: GenerateSalesDocumentInput) => {
    const generated = await salesSheetRepository.generateDocument(sheet.id, type, input);
    await state.reload(true); await onGenerated?.();
    showToast(`${generated.label} a fost generat.`, 'success');
    if (generated.url) try { await Linking.openURL(generated.url); } catch { showToast('PDF-ul a fost generat, dar nu a putut fi deschis automat.', 'error'); }
  };
  const openDocument = async (document: SalesDocument) => {
    if (!document.url) return;
    try { await Linking.openURL(document.url); } catch { showToast('PDF-ul nu a putut fi deschis.', 'error'); }
  };
  const sendOne = async (document: SalesDocument) => {
    if (!phone || !document.url) return showToast('Clientul nu are un număr WhatsApp valid.', 'error');
    const message = `Bună ziua! Vă trimitem ${document.label.toLocaleLowerCase('ro-RO')} pentru ${sheet.number}: ${document.url}`;
    try { await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`); } catch { showToast('WhatsApp nu a putut fi deschis.', 'error'); }
  };
  const sendAll = async () => {
    if (missing.length) return showToast(`Dosarul nu este complet. Lipsește: ${missing.map((item) => item.definition.label).join(', ')}.`, 'info');
    if (!phone) return showToast('Clientul nu are un număr WhatsApp valid.', 'error');
    const lines = ready.map(({ definition, document }) => `• ${document?.label || definition.label}: ${document?.url}`);
    try { await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(`Bună ziua! Vă trimitem dosarul G-Shop pentru ${sheet.number}:\n\n${lines.join('\n')}`)}`); } catch { showToast('WhatsApp nu a putut fi deschis.', 'error'); }
  };
  const removeDocument = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try { await salesSheetRepository.removeDocument(sheet.id, deleteTarget.type); await state.reload(true); setDeleteTarget(null); showToast('Documentul a fost șters. Fișa de vânzare a rămas neschimbată.', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Documentul nu a putut fi șters.', 'error'); }
    finally { setDeleting(false); }
  };

  return <>
    <Card style={styles.panel} elevated>
      <View style={styles.header}>
        <View style={[styles.folder, { backgroundColor: colors.primarySoft }]}><Ionicons name="folder-open-outline" size={22} color={colors.primary} /></View>
        <View style={styles.headerCopy}><View style={styles.headerTitle}><AppText variant="heading">DOSAR</AppText><View style={[styles.stepsBadge, { backgroundColor: colors.surfaceMuted }]}><AppText variant="caption" muted>2 pași</AppText></View></View><AppText variant="caption" muted>Deviz și garanție, în ordinea corectă</AppText></View>
        <InfoTooltip title="Dosarul G-Shop" description="Pasul 1 creează devizul final. După aceea poți emite certificatul de garanție. Fiecare PDF se poate deschide, actualiza sau trimite separat pe WhatsApp." />
        <Pressable accessibilityRole="button" accessibilityLabel="Reîncarcă dosarul" disabled={state.loading || state.refreshing} onPress={() => void state.reload(true)} style={[styles.refresh, { backgroundColor: colors.surfaceMuted }]}>{state.loading || state.refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh-outline" size={18} color={colors.primary} />}</Pressable>
      </View>

      {state.error ? <View style={[styles.notice, { backgroundColor: `${palette.danger}10`, borderColor: `${palette.danger}35` }]}><Ionicons name="cloud-offline-outline" size={19} color={palette.danger} /><View style={styles.noticeCopy}><AppText variant="label" style={{ color: palette.danger }}>Dosarul nu s-a încărcat</AppText><AppText variant="caption" muted>{state.error.message}</AppText></View><Button compact variant="outline" label="Reîncearcă" onPress={() => void state.reload()} /></View> : null}
      {state.loading && !state.data ? <View style={[styles.loading, { backgroundColor: colors.surfaceMuted }]}><ActivityIndicator color={colors.primary} /><AppText variant="caption" muted>Se încarcă documentele…</AppText></View> : null}

      {state.data ? <>
        <View style={styles.timeline}>{slots.map(({ definition, document }, index) => {
          const available = Boolean(document?.available && document.url);
          const blocked = definition.type === 'WARRANTY' && !slots[0].document?.available;
          const accent = available ? palette.success : blocked ? colors.textMuted : definition.color;
          return <View key={definition.type} style={styles.stepWrap}>
            <View style={styles.rail}><View style={[styles.stepCircle, { backgroundColor: available ? palette.success : blocked ? colors.surfaceMuted : colors.primarySoft, borderColor: available ? palette.success : blocked ? colors.border : colors.primary }]}>{available ? <Ionicons name="checkmark" size={17} color="#FFFFFF" /> : <AppText variant="caption" style={{ color: accent, fontWeight: '900' }}>{definition.step}</AppText>}</View>{index < slots.length - 1 ? <View style={[styles.line, { backgroundColor: available ? palette.success : colors.border }]} /> : null}</View>
            <View style={[styles.document, { backgroundColor: available ? (isDark ? `${palette.success}0F` : '#F7FCF8') : colors.surfaceMuted, borderColor: available ? `${palette.success}42` : colors.border }]}>
              <View style={[styles.documentIcon, { backgroundColor: `${accent}16` }]}><Ionicons name={definition.icon} size={20} color={accent} /></View>
              <View style={styles.documentCopy}><View style={styles.documentTitle}><AppText variant="label" numberOfLines={1}>{definition.label}</AppText><InfoTooltip title={definition.label} description={definition.tooltip} size={16} /></View><AppText variant="caption" muted numberOfLines={1}>{available ? `${document?.number || 'PDF emis'} · ${document?.generatedAt ? formatDate(document.generatedAt, true) : 'gata'}` : blocked ? 'Disponibil după devizul final' : definition.description}</AppText></View>
              <View style={[styles.status, { backgroundColor: available ? `${palette.success}16` : `${palette.warning}14` }]}><View style={[styles.statusDot, { backgroundColor: available ? palette.success : palette.warning }]} /><AppText variant="caption" style={{ color: available ? palette.success : palette.warning, fontWeight: '900' }}>{available ? 'EMIS' : blocked ? 'BLOCAT' : 'DE CREAT'}</AppText></View>
              <View style={styles.documentActions}>{available && document ? <><Button compact label="Deschide" icon="open-outline" onPress={() => void openDocument(document)} style={styles.primaryAction} /><Pressable accessibilityRole="button" accessibilityLabel={`Trimite ${definition.label} pe WhatsApp`} onPress={() => void sendOne(document)} style={[styles.iconAction, { backgroundColor: `${palette.success}12`, borderColor: `${palette.success}38` }]}><Ionicons name="logo-whatsapp" size={18} color={palette.success} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Actualizează ${definition.label}`} disabled={!canGenerate} onPress={() => openEditor(definition.type)} style={[styles.iconAction, { backgroundColor: colors.surface, borderColor: colors.border, opacity: canGenerate ? 1 : .4 }]}><Ionicons name="create-outline" size={18} color={colors.primary} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Șterge ${definition.label}`} disabled={!canDelete} onPress={() => setDeleteTarget(document)} style={[styles.iconAction, { backgroundColor: `${palette.danger}0D`, borderColor: `${palette.danger}30`, opacity: canDelete ? 1 : .4 }]}><Ionicons name="trash-outline" size={17} color={palette.danger} /></Pressable></> : <Button compact variant="outline" label={blocked ? 'Așteaptă pasul 1' : 'Creează PDF'} icon={blocked ? 'lock-closed-outline' : 'add-circle-outline'} disabled={blocked || !canGenerate} onPress={() => openEditor(definition.type)} style={styles.createAction} />}</View>
            </View>
          </View>;
        })}</View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}><View style={styles.footerCopy}><View style={[styles.whatsappIcon, { backgroundColor: `${palette.success}16` }]}><Ionicons name="logo-whatsapp" size={19} color={palette.success} /></View><View style={styles.noticeCopy}><AppText variant="label">Trimite dosarul</AppText><AppText variant="caption" muted>{missing.length ? `${ready.length}/2 documente pregătite` : 'Ambele documente sunt pregătite'}</AppText></View></View><Button compact label="Trimite ambele" icon="logo-whatsapp" disabled={!phone || missing.length > 0} onPress={() => void sendAll()} style={styles.sendAll} /></View>
      </> : null}
    </Card>

    <SalesDocumentEditorModal visible={editorType !== null} type={editorType ?? 'FINAL_ESTIMATE'} sheet={sheet} document={selectedDocument} onClose={() => setEditorType(null)} onGenerate={(input) => generate(editorType ?? 'FINAL_ESTIMATE', input)} />
    <Modal visible={deleteTarget !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!deleting) setDeleteTarget(null); }}><ModalSafeBottom style={[styles.deleteOverlay, { backgroundColor: colors.overlay }]}><Pressable accessibilityRole="button" accessibilityLabel="Închide confirmarea" disabled={deleting} style={StyleSheet.absoluteFill} onPress={() => setDeleteTarget(null)} />{deleteTarget ? <View style={[styles.deleteCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}><View style={[styles.deleteIcon, { backgroundColor: `${palette.danger}14` }]}><Ionicons name="trash-outline" size={27} color={palette.danger} /></View><AppText variant="title">Ștergi {deleteTarget.label.toLocaleLowerCase('ro-RO')}?</AppText><AppText muted style={styles.deleteCopy}>Se elimină numai acest PDF din DOSAR. Fișa de vânzare și celelalte date rămân intacte.</AppText><View style={styles.deleteActions}><Button compact variant="outline" label="Păstrează" disabled={deleting} onPress={() => setDeleteTarget(null)} style={styles.deleteButton} /><Button compact variant="danger" label="Șterge PDF" icon="trash-outline" loading={deleting} onPress={() => void removeDocument()} style={styles.deleteButton} /></View></View> : null}</ModalSafeBottom></Modal>
  </>;
}

const styles = StyleSheet.create({
  panel: { padding: spacing.md, gap: spacing.md }, header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, folder: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, headerCopy: { minWidth: 0, flex: 1, gap: 1 }, headerTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, stepsBadge: { minHeight: 22, borderRadius: radius.pill, paddingHorizontal: spacing.sm, justifyContent: 'center' }, refresh: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  notice: { minHeight: 58, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, noticeCopy: { minWidth: 0, flex: 1, gap: 1 }, loading: { minHeight: 74, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  timeline: { gap: 0 }, stepWrap: { minWidth: 0, flexDirection: 'row', gap: spacing.sm }, rail: { width: 30, alignItems: 'center' }, stepCircle: { width: 30, height: 30, flexShrink: 0, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }, line: { width: 2, flex: 1, minHeight: 58 },
  document: { minWidth: 0, flex: 1, minHeight: 68, marginBottom: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }, documentIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, documentCopy: { minWidth: 160, flex: 1, gap: 2 }, documentTitle: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, status: { minHeight: 25, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 5 }, statusDot: { width: 6, height: 6, borderRadius: radius.pill }, documentActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, primaryAction: { minWidth: 105 }, createAction: { minWidth: 150 }, iconAction: { width: 38, height: 38, borderWidth: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: 1, paddingTop: spacing.md, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }, footerCopy: { minWidth: 180, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, whatsappIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, sendAll: { minWidth: 150 },
  deleteOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }, deleteCard: { width: '100%', maxWidth: 430, borderWidth: 1, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', gap: spacing.md }, deleteIcon: { width: 54, height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' }, deleteCopy: { textAlign: 'center', lineHeight: 21 }, deleteActions: { width: '100%', flexDirection: 'row', gap: spacing.sm }, deleteButton: { minWidth: 130, flex: 1 },
});
