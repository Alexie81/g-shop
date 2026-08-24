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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

type Props = { sheet: SalesSheet; onGenerated?: () => void | Promise<void> };
type DocumentDefinition = {
  type: SalesDocumentType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const DOCUMENTS: DocumentDefinition[] = [
  { type: 'FINAL_ESTIMATE', label: 'Deviz final', icon: 'receipt-outline', color: palette.electric },
  { type: 'WARRANTY', label: 'Certificat de garanție', icon: 'shield-checkmark-outline', color: palette.success },
];

const fileNameFromUrl = (url: string, fallback: string) => {
  const encodedName = url.split('?')[0].split('/').pop();
  if (!encodedName) return fallback;
  try { return decodeURIComponent(encodedName); } catch { return encodedName; }
};

async function downloadPdfOnWeb(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('PDF-ul nu a putut fi descărcat.');
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function SalesDocumentsPanel({ sheet, onGenerated }: Props) {
  const { colors, isDark } = useAppTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const narrow = width < 720;
  const [editorType, setEditorType] = useState<SalesDocumentType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingType, setDownloadingType] = useState<SalesDocumentType | null>(null);
  const [sendingDossier, setSendingDossier] = useState(false);
  const canViewFinancials = hasPermission('financials.view');
  const canGenerate = canViewFinancials && (hasPermission('sales_sheets.update') || hasPermission('sales_sheets.create'));
  const canDelete = hasPermission('sales_sheets.update');
  const state = useAsyncData(() => salesSheetRepository.listDocuments(sheet.id), [sheet.id, sheet.signedAt, sheet.updatedAt]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  const slots = DOCUMENTS.map((definition) => ({
    definition,
    document: state.data?.find((item) => item.type === definition.type),
  }));
  const salesSheetReady = Boolean(sheet.pdfUrl);
  const estimateReady = Boolean(slots[0].document?.available && slots[0].document.url);
  const warrantyReady = estimateReady && Boolean(slots[1].document?.available && slots[1].document.url);
  const readyCount = salesSheetReady ? 1 + (estimateReady ? 1 : 0) + (warrantyReady ? 1 : 0) : 0;
  const dossierReady = Boolean(state.data && salesSheetReady);
  const dossierTitle = readyCount >= 3
    ? 'Trimite toate documentele'
    : readyCount === 2 ? 'Trimite fișa și devizul' : readyCount === 1 ? 'Trimite fișa de vânzare' : 'Trimite documentele';
  const dossierButtonLabel = readyCount >= 3 ? 'Trimite toate' : readyCount === 2 ? 'Trimite 2' : 'Trimite fișa';
  const normalizedPhone = normalizePhoneForWhatsApp(sheet.customerPhone);
  const phone = /^\d{10,15}$/.test(normalizedPhone) ? normalizedPhone : '';
  const selectedDocument = editorType ? state.data?.find((item) => item.type === editorType) : undefined;

  const openEditor = (type: SalesDocumentType) => {
    if (!canGenerate) return showToast('Ai nevoie de acces la valorile financiare și de permisiunea de modificare.', 'info');
    if (type === 'WARRANTY' && !state.data?.some((item) => item.type === 'FINAL_ESTIMATE' && item.available)) {
      return showToast('Generează mai întâi devizul final.', 'info');
    }
    setEditorType(type);
  };

  const generate = async (type: SalesDocumentType, input: GenerateSalesDocumentInput) => {
    const generated = await salesSheetRepository.generateDocument(sheet.id, type, input);
    await state.reload(true);
    await onGenerated?.();
    showToast(`${generated.label} a fost generat.`, 'success');
  };

  const openDocument = async (document: SalesDocument) => {
    if (!document.url) return;
    try { await Linking.openURL(document.url); } catch { showToast('PDF-ul nu a putut fi deschis.', 'error'); }
  };

  const sendOne = async (document: SalesDocument) => {
    if (!phone || !document.url) return showToast('Clientul nu are un număr WhatsApp valid.', 'error');
    const message = `Bună ziua! Vă trimitem ${document.label.toLocaleLowerCase('ro-RO')} pentru ${sheet.number}: ${document.url}`;
    try { await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`); }
    catch { showToast('WhatsApp nu a putut fi deschis.', 'error'); }
  };

  const downloadOne = async (document: SalesDocument) => {
    if (!document.url || downloadingType) return;
    setDownloadingType(document.type);
    const fallbackName = `${document.type === 'FINAL_ESTIMATE' ? 'DEVIZ-FINAL' : 'CERTIFICAT-GARANTIE'}-${sheet.number}.pdf`;
    const fileName = fileNameFromUrl(document.url, fallbackName);
    try {
      if (Platform.OS === 'web') {
        await downloadPdfOnWeb(document.url, fileName);
        showToast(`PDF descărcat: ${fileName}`, 'success');
        return;
      }
      if (!FileSystem.cacheDirectory) throw new Error('Spațiul temporar nu este disponibil.');
      const localUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      const download = await FileSystem.downloadAsync(document.url, localUri);
      if (download.status < 200 || download.status >= 300) throw new Error('PDF-ul nu a putut fi descărcat.');
      if (!await Sharing.isAvailableAsync()) throw new Error('Salvarea PDF-ului nu este disponibilă pe acest dispozitiv.');
      await Sharing.shareAsync(download.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `Salvează ${fileName}`,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'PDF-ul nu a putut fi descărcat.', 'error');
    } finally {
      setDownloadingType(null);
    }
  };

  const sendDossier = async () => {
    if (sendingDossier) return;
    if (!dossierReady) return showToast('Generează mai întâi PDF-ul fișei de vânzare.', 'info');
    if (!phone) return showToast('Clientul nu are un număr WhatsApp valid.', 'error');
    setSendingDossier(true);
    try {
      const dossier = await salesSheetRepository.generateDossier(sheet.id);
      const contentLabel = dossier.documentCount >= 3
        ? 'dosarul complet G-Shop'
        : dossier.documentCount === 2 ? 'fișa de vânzare și devizul final' : 'fișa de vânzare';
      const documentLines = [`Fișa de vânzare: ${sheet.number}`];
      if (dossier.documentCount >= 2) documentLines.push(`Deviz: ${slots[0].document?.number || 'emis'}`);
      if (dossier.documentCount >= 3) documentLines.push(`Certificat de garanție: ${slots[1].document?.number || 'emis'}`);
      const message = `Bună ziua! Vă trimitem ${contentLabel}:\n\n${documentLines.join('\n')}\n\nPDF: ${dossier.url}`;
      await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Dosarul nu a putut fi pregătit.', 'error');
    } finally {
      setSendingDossier(false);
    }
  };

  const removeDocument = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await salesSheetRepository.removeDocument(sheet.id, deleteTarget.type);
      await state.reload(true);
      setDeleteTarget(null);
      showToast('Documentul a fost șters. Fișa de vânzare a rămas neschimbată.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Documentul nu a putut fi șters.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return <>
    <Card style={styles.panel} elevated>
      <View style={styles.header}>
        <View style={[styles.folder, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="folder-open-outline" size={19} color={colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <View style={styles.headerTitle}>
            <AppText variant="heading">DOSAR</AppText>
            <View style={[styles.countBadge, { backgroundColor: colors.surfaceMuted }]}>
              <AppText variant="caption" muted>3 documente</AppText>
            </View>
          </View>
          <AppText variant="caption" muted numberOfLines={1}>Fișă de vânzare · deviz · garanție</AppText>
        </View>
        <InfoTooltip title="Dosarul G-Shop" description="Trimite într-un singur PDF documentele emise până acum: fișa, apoi devizul și certificatul, pe măsură ce devin disponibile. Acțiunile mici permit editarea, vizualizarea, descărcarea sau ștergerea fiecărui document." size={16} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reîncarcă dosarul"
          accessibilityState={{ disabled: state.loading || state.refreshing, busy: state.loading || state.refreshing }}
          hitSlop={6}
          disabled={state.loading || state.refreshing}
          onPress={() => void state.reload(true)}
          style={[styles.refresh, { backgroundColor: colors.surfaceMuted }]}
        >
          {state.loading || state.refreshing
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Ionicons name="refresh-outline" size={17} color={colors.primary} />}
        </Pressable>
      </View>

      <View style={[
        styles.dossier,
        narrow && styles.dossierNarrow,
        { backgroundColor: isDark ? `${palette.success}12` : palette.successSoft, borderColor: `${palette.success}35` },
      ]}>
        <View style={[styles.dossierIcon, { backgroundColor: `${palette.success}18` }]}>
          <Ionicons name="logo-whatsapp" size={20} color={palette.success} />
        </View>
        <View style={styles.dossierCopy}>
          <AppText variant="label">{dossierTitle}</AppText>
          <View style={styles.readyLine}>
            <Ionicons name={dossierReady ? 'checkmark-circle' : 'documents-outline'} size={14} color={dossierReady ? palette.success : colors.textMuted} />
            <AppText variant="caption" muted>{readyCount}/3 documente pregătite</AppText>
          </View>
        </View>
        <Button
          compact
          label={sendingDossier ? 'Se pregătește…' : dossierButtonLabel}
          icon="logo-whatsapp"
          loading={sendingDossier}
          disabled={!dossierReady}
          onPress={() => void sendDossier()}
          style={[styles.sendAll, narrow && styles.sendAllNarrow]}
        />
      </View>

      {state.error ? <View style={[styles.notice, { backgroundColor: `${palette.danger}10`, borderColor: `${palette.danger}35` }]}>
        <Ionicons name="cloud-offline-outline" size={19} color={palette.danger} />
        <View style={styles.noticeCopy}><AppText variant="label" style={{ color: palette.danger }}>Dosarul nu s-a încărcat</AppText><AppText variant="caption" muted>{state.error.message}</AppText></View>
        <Button compact variant="outline" label="Reîncearcă" onPress={() => void state.reload()} />
      </View> : null}

      {state.loading && !state.data ? <View style={[styles.loading, { backgroundColor: colors.surfaceMuted }]}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="caption" muted>Se încarcă documentele…</AppText>
      </View> : null}

      {state.data ? <View style={styles.documentList}>{slots.map(({ definition, document }) => {
        const available = Boolean(document?.available && document.url);
        const blocked = definition.type === 'WARRANTY' && !slots[0].document?.available;
        const metadata = available
          ? `${document?.number || 'PDF emis'} · ${document?.generatedAt ? formatDate(document.generatedAt, true) : 'gata'}`
          : blocked ? 'Generează mai întâi devizul final' : 'Pregătit pentru generare';
        return <View
          key={definition.type}
          style={[
            styles.document,
            narrow && styles.documentNarrow,
            { backgroundColor: available && !isDark ? '#FBFDFC' : colors.surfaceMuted, borderColor: available ? `${palette.success}36` : colors.border },
          ]}
        >
          <View style={styles.documentMain}>
            <View style={[styles.documentIcon, { backgroundColor: `${definition.color}16` }]}>
              <Ionicons name={definition.icon} size={18} color={definition.color} />
            </View>
            <View style={styles.documentCopy}>
              <View style={styles.documentTitle}>
                <AppText variant="label" numberOfLines={1} style={styles.documentLabel}>{definition.label}</AppText>
                {available ? <View style={styles.emitted}>
                  <Ionicons name="checkmark-circle" size={14} color={palette.success} />
                  <AppText variant="caption" style={styles.emittedText}>Emis</AppText>
                </View> : null}
                {available && definition.type === 'FINAL_ESTIMATE' ? <View style={[styles.paymentBadge, { backgroundColor: `${sheet.paymentStatus === 'PAID' ? palette.success : palette.warning}16` }]}>
                  <Ionicons name={sheet.paymentStatus === 'PAID' ? 'checkmark-circle' : 'time'} size={12} color={sheet.paymentStatus === 'PAID' ? palette.success : palette.warning} />
                  <AppText variant="caption" style={{ color: sheet.paymentStatus === 'PAID' ? palette.success : palette.warning, fontWeight: '800' }}>{sheet.paymentStatus === 'PAID' ? 'Achitat' : 'Neachitat'}</AppText>
                </View> : null}
              </View>
              <AppText variant="caption" muted numberOfLines={1}>{metadata}</AppText>
            </View>
          </View>

          <View style={[styles.documentActions, narrow && styles.documentActionsNarrow]}>
            {available && document ? <>
              <Button
                compact
                label="Trimite"
                icon="logo-whatsapp"
                onPress={() => void sendOne(document)}
                style={styles.sendOne}
              />
              <DocumentIconAction
                label={`Editează ${definition.label}`}
                hint="Deschide datele documentului pentru actualizare"
                icon="create-outline"
                color={colors.primary}
                backgroundColor={colors.surface}
                borderColor={colors.border}
                disabled={!canGenerate}
                onPress={() => openEditor(definition.type)}
              />
              <DocumentIconAction
                label={`Vezi ${definition.label}`}
                hint="Deschide PDF-ul"
                icon="eye-outline"
                color={colors.text}
                backgroundColor={colors.surface}
                borderColor={colors.border}
                onPress={() => void openDocument(document)}
              />
              <DocumentIconAction
                label={`Descarcă ${definition.label}`}
                hint="Salvează PDF-ul pe dispozitiv"
                icon="download-outline"
                color={palette.cyan}
                backgroundColor={colors.surface}
                borderColor={colors.border}
                loading={downloadingType === definition.type}
                disabled={downloadingType !== null && downloadingType !== definition.type}
                onPress={() => void downloadOne(document)}
              />
              <DocumentIconAction
                label={`Șterge ${definition.label}`}
                hint="Șterge numai acest PDF"
                icon="trash-outline"
                color={palette.danger}
                backgroundColor={`${palette.danger}0D`}
                borderColor={`${palette.danger}30`}
                disabled={!canDelete}
                onPress={() => setDeleteTarget(document)}
              />
            </> : <Button
              compact
              variant="outline"
              label="Generează PDF"
              icon={blocked ? 'lock-closed-outline' : 'document-text-outline'}
              disabled={blocked || !canGenerate}
              onPress={() => openEditor(definition.type)}
              style={styles.generateAction}
            />}
          </View>
        </View>;
      })}</View> : null}
    </Card>

    <SalesDocumentEditorModal
      visible={editorType !== null}
      type={editorType ?? 'FINAL_ESTIMATE'}
      sheet={sheet}
      document={selectedDocument}
      onClose={() => setEditorType(null)}
      onGenerate={(input) => generate(editorType ?? 'FINAL_ESTIMATE', input)}
    />

    <Modal visible={deleteTarget !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!deleting) setDeleteTarget(null); }}>
      <ModalSafeBottom style={[styles.deleteOverlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Închide confirmarea" disabled={deleting} style={StyleSheet.absoluteFill} onPress={() => setDeleteTarget(null)} />
        {deleteTarget ? <View style={[styles.deleteCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={[styles.deleteIcon, { backgroundColor: `${palette.danger}14` }]}><Ionicons name="trash-outline" size={27} color={palette.danger} /></View>
          <AppText variant="title">Ștergi {deleteTarget.label.toLocaleLowerCase('ro-RO')}?</AppText>
          <AppText muted style={styles.deleteCopy}>Se elimină numai acest PDF din DOSAR. Fișa de vânzare și celelalte date rămân intacte.</AppText>
          <View style={styles.deleteActions}>
            <Button compact variant="outline" label="Păstrează" disabled={deleting} onPress={() => setDeleteTarget(null)} style={styles.deleteButton} />
            <Button compact variant="danger" label="Șterge PDF" icon="trash-outline" loading={deleting} onPress={() => void removeDocument()} style={styles.deleteButton} />
          </View>
        </View> : null}
      </ModalSafeBottom>
    </Modal>
  </>;
}

function DocumentIconAction({ label, hint, icon, color, backgroundColor, borderColor, disabled = false, loading = false, onPress }: {
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  backgroundColor: string;
  borderColor: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityHint={hint}
    accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading}
    onPress={onPress}
    style={({ pressed }) => [
      styles.iconHitArea,
      { opacity: disabled ? .38 : pressed ? .68 : 1 },
    ]}
  >
    <View style={[styles.iconAction, { backgroundColor, borderColor }]}>
      {loading ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={17} color={color} />}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  panel: { padding: spacing.md, gap: spacing.sm },
  header: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  folder: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { minWidth: 0, flex: 1, gap: 1 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countBadge: { minHeight: 20, borderRadius: radius.pill, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  refresh: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dossier: { minHeight: 58, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dossierNarrow: { flexWrap: 'wrap' },
  dossierIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dossierCopy: { minWidth: 150, flex: 1, gap: 2 },
  readyLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sendAll: { minWidth: 132, minHeight: 44, backgroundColor: palette.success, borderColor: palette.success, paddingHorizontal: spacing.md },
  sendAllNarrow: { minWidth: 0, flexGrow: 1 },
  notice: { minHeight: 54, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noticeCopy: { minWidth: 0, flex: 1, gap: 1 },
  loading: { minHeight: 62, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  documentList: { gap: spacing.sm },
  document: { minWidth: 0, minHeight: 60, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  documentNarrow: { alignItems: 'stretch', flexDirection: 'column', gap: 6 },
  documentMain: { minWidth: 180, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  documentIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  documentCopy: { minWidth: 0, flex: 1, gap: 1 },
  documentTitle: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  documentLabel: { minWidth: 0, flexShrink: 1 },
  emitted: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  emittedText: { color: palette.success, fontWeight: '800' },
  paymentBadge: { minHeight: 20, borderRadius: radius.pill, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 3 },
  documentActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  documentActionsNarrow: { width: '100%', paddingLeft: 42, flexWrap: 'wrap' },
  sendOne: { minWidth: 92, minHeight: 44, backgroundColor: palette.success, borderColor: palette.success, paddingHorizontal: spacing.sm },
  generateAction: { minWidth: 144, minHeight: 44, paddingHorizontal: spacing.md },
  iconHitArea: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconAction: { width: 34, height: 34, borderWidth: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  deleteOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  deleteCard: { width: '100%', maxWidth: 430, borderWidth: 1, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  deleteIcon: { width: 54, height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  deleteCopy: { textAlign: 'center', lineHeight: 21 },
  deleteActions: { width: '100%', flexDirection: 'row', gap: spacing.sm },
  deleteButton: { minWidth: 130, flex: 1 },
});
