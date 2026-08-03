import { ServiceDocumentEditorModal } from '@/components/service-sheets/ServiceDocumentEditorModal';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { clientRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { GenerateServiceDocumentInput, ServiceDocument, ServiceDocumentType, ServiceSheet } from '@/types';
import { formatDate, normalizePhoneForWhatsApp } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Props = { sheet: ServiceSheet; style?: StyleProp<ViewStyle> };

const DOCUMENTS: { type: ServiceDocumentType; label: string; description: string; icon: IconName; color: string }[] = [
  { type: 'INTAKE', label: 'Fișă de intrare', description: 'Primire, cost estimativ și acord inițial', icon: 'enter-outline', color: palette.electric },
  { type: 'FINAL_ESTIMATE', label: 'Deviz final', description: 'Diagnostic, piese, manoperă și acord final', icon: 'receipt-outline', color: palette.purple },
  { type: 'EXIT', label: 'Fișă de ieșire', description: 'Starea produsului și confirmarea predării', icon: 'exit-outline', color: palette.success },
];

export function ServiceDocumentsPanel({ sheet, style }: Props) {
  const { colors, isDark } = useAppTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [editorType, setEditorType] = useState<ServiceDocumentType | null>(null);
  const canGenerate = hasPermission('service_sheets.update') || hasPermission('service_sheets.create');
  const state = useAsyncData(() => serviceSheetRepository.listDocuments(sheet.id), [sheet.id]);
  const financialState = useAsyncData(() => clientRepository.getFinancials(sheet.clientId), [sheet.clientId]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  const slots = DOCUMENTS.map((definition) => ({ definition, document: state.data?.find((item) => item.type === definition.type) }));
  const available = slots.filter((slot) => slot.document?.available && slot.document.url);
  const missing = state.data ? slots.filter((slot) => !slot.document?.available || !slot.document.url) : [];
  const normalizedPhone = normalizePhoneForWhatsApp(sheet.client?.phone ?? '');
  const phone = /^\d{10,15}$/.test(normalizedPhone) ? normalizedPhone : '';
  const allReady = state.data !== null && missing.length === 0;
  const selectedDocument = editorType ? state.data?.find((item) => item.type === editorType) : undefined;
  const openEditor = (type: ServiceDocumentType, document?: ServiceDocument) => {
    if (type === 'FINAL_ESTIMATE' && !document?.available && !financialState.data) {
      showToast(financialState.loading ? 'Se încarcă costurile interne ale pieselor. Încearcă din nou imediat.' : 'Costurile interne nu au putut fi încărcate. Reîncarcă dosarul înainte de deviz.', 'error');
      return;
    }
    setEditorType(type);
  };

  const openDocument = async (document: ServiceDocument) => {
    if (!document.available || !document.url) return;
    try { await Linking.openURL(document.url); }
    catch { showToast('Documentul nu a putut fi deschis.', 'error'); }
  };

  const generate = async (type: ServiceDocumentType, input: GenerateServiceDocumentInput) => {
    const generated = await serviceSheetRepository.generateDocument(sheet.id, type, input);
    await state.reload(true);
    showToast(`Documentul „${generated.label}” a fost generat.`, 'success');
    if (!generated.url) {
      showToast('Documentul a fost generat, dar linkul nu este încă disponibil.', 'error');
      return;
    }
    try { await Linking.openURL(generated.url); }
    catch { showToast('Documentul a fost generat, dar nu a putut fi deschis automat.', 'error'); }
  };

  const sendOne = async (document: ServiceDocument) => {
    if (!phone || !document.available || !document.url) return;
    const message = `Bună ziua! Vă trimitem ${document.label.toLocaleLowerCase('ro-RO')} pentru reparația ${sheet.number}: ${document.url}`;
    try { await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`); }
    catch { showToast('WhatsApp nu a putut fi deschis.', 'error'); }
  };

  const sendAll = async () => {
    if (!allReady) {
      showToast(`Lipsesc: ${missing.map(({ definition }) => definition.label).join(', ')}. Generează-le direct din această secțiune.`, 'info');
      return;
    }
    if (!phone) return;
    const lines = available.map(({ definition, document }) => `• ${document?.label || definition.label}: ${document?.url}`);
    const message = `Bună ziua! Vă trimitem dosarul complet al reparației ${sheet.number}:\n\n${lines.join('\n')}`;
    try { await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`); }
    catch { showToast('WhatsApp nu a putut fi deschis.', 'error'); }
  };

  return <>
    <Card style={[styles.panel, style]} elevated>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: isDark ? `${colors.primary}25` : colors.primarySoft }]}><Ionicons name="folder-open-outline" size={23} color={colors.primary} /></View>
        <View style={styles.headerCopy}><AppText variant="heading">Documentele reparației</AppText><AppText variant="caption" muted>Dosarul clientului conține exact trei documente.</AppText></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Reîncarcă documentele" disabled={state.loading || state.refreshing} onPress={() => void state.reload(true)} style={[styles.refresh, { backgroundColor: colors.surfaceMuted }]}>{state.loading || state.refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh-outline" size={20} color={colors.primary} />}</Pressable>
      </View>

      {state.error ? <View style={[styles.notice, { backgroundColor: `${palette.danger}12`, borderColor: `${palette.danger}30` }]}><Ionicons name="cloud-offline-outline" size={20} color={palette.danger} /><View style={styles.noticeCopy}><AppText variant="label" style={{ color: palette.danger }}>Documentele nu au putut fi încărcate</AppText><AppText variant="caption" muted>{state.error.message}</AppText></View><Button compact variant="outline" label="Reîncearcă" onPress={() => void state.reload()} /></View> : null}

      {state.loading && !state.data ? <View style={[styles.loading, { backgroundColor: colors.surfaceMuted }]}><ActivityIndicator color={colors.primary} /><AppText variant="caption" muted>Se încarcă dosarul reparației…</AppText></View> : null}

      {state.data ? <><View style={styles.documentList}>{slots.map(({ definition, document }) => {
        const ready = Boolean(document?.available && document.url);
        return <View key={definition.type} style={[styles.document, { backgroundColor: ready ? (isDark ? `${definition.color}12` : `${definition.color}08`) : colors.surfaceMuted, borderColor: ready ? `${definition.color}45` : colors.border }]}>
          <View style={[styles.documentIcon, { backgroundColor: ready ? `${definition.color}18` : colors.surface }]}><Ionicons name={definition.icon} size={22} color={ready ? definition.color : colors.textMuted} /></View>
          <View style={styles.documentCopy}>
            <View style={styles.documentTitleRow}><AppText variant="label" numberOfLines={1} style={styles.documentTitle}>{document?.label || definition.label}</AppText><View style={[styles.status, { backgroundColor: ready ? `${palette.success}16` : `${palette.warning}16` }]}><Ionicons name={ready ? 'checkmark-circle' : 'time-outline'} size={14} color={ready ? palette.success : palette.warning} /><AppText variant="caption" style={{ color: ready ? palette.success : palette.warning, fontWeight: '900' }}>{ready ? 'Disponibil' : 'Lipsește'}</AppText></View></View>
            <AppText variant="caption" muted>{ready ? `${document?.number ? `${document.number} · ` : ''}${document?.generatedAt ? `generat ${formatDate(document.generatedAt, true)}` : 'PDF generat'}` : definition.description}</AppText>
          </View>
          <View style={styles.documentActions}>
            {ready && document ? <Button compact label="Deschide" icon="open-outline" onPress={() => void openDocument(document)} style={styles.rowAction} /> : <Button compact label="Creează din fișă" icon="add-circle-outline" disabled={!canGenerate || state.loading} onPress={() => openEditor(definition.type, document)} style={styles.rowAction} />}
            {ready && document ? <Pressable accessibilityRole="button" accessibilityLabel={`Actualizează ${document.label}`} disabled={!canGenerate} onPress={() => openEditor(definition.type, document)} style={[styles.editAction, { backgroundColor: colors.surface, borderColor: colors.border, opacity: canGenerate ? 1 : 0.4 }]}><Ionicons name="create-outline" size={18} color={colors.primary} /></Pressable> : null}
          </View>
        </View>;
      })}</View>

      {missing.length ? <View style={[styles.missingNotice, { backgroundColor: `${palette.warning}10`, borderColor: `${palette.warning}35` }]}>
        <View style={styles.missingHeader}><Ionicons name="alert-circle-outline" size={21} color={palette.warning} /><View style={styles.noticeCopy}><AppText variant="label">Dosarul nu este complet</AppText><AppText variant="caption" muted>Lipsesc: {missing.map(({ definition }) => definition.label).join(', ')}. Generează-le înainte de trimiterea completă.</AppText></View></View>
        {canGenerate ? <View style={styles.missingActions}>{missing.map(({ definition, document }) => <Button key={definition.type} compact variant="outline" label={`Creează ${definition.label.toLocaleLowerCase('ro-RO')}`} icon="add" onPress={() => openEditor(definition.type, document)} style={styles.missingAction} />)}</View> : <AppText variant="caption" muted>Ai nevoie de permisiunea de modificare a fișelor pentru a genera documentele lipsă.</AppText>}
      </View> : null}

      <View style={[styles.whatsapp, { borderTopColor: colors.border }]}>
        <View style={styles.whatsappHeader}><View style={[styles.whatsappIcon, { backgroundColor: `${palette.success}16` }]}><Ionicons name="logo-whatsapp" size={22} color={palette.success} /></View><View style={styles.headerCopy}><AppText variant="heading">Trimitere WhatsApp</AppText><AppText variant="caption" muted>{phone ? `Către ${sheet.client?.phone}` : 'Clientul nu are un număr WhatsApp valid.'}</AppText></View></View>
        <View style={styles.whatsappActions}>{slots.map(({ definition, document }) => {
          const ready = Boolean(document?.available && document.url);
          return <Button
            key={definition.type}
            compact
            variant="outline"
            label={ready ? definition.label : `Generează ${definition.label.toLocaleLowerCase('ro-RO')}`}
            icon={ready ? 'logo-whatsapp' : 'add-circle-outline'}
            disabled={ready ? !phone : !canGenerate}
            onPress={() => ready && document ? void sendOne(document) : openEditor(definition.type, document)}
            style={styles.whatsappAction}
          />;
        })}</View>
        <Button label="Trimite toate cele 3 documente" icon="logo-whatsapp" disabled={!phone || !state.data} onPress={() => void sendAll()} />
        {!allReady ? <AppText variant="caption" muted style={styles.whatsappHint}>„Trimite toate” devine disponibil numai după generarea tuturor celor trei documente. Niciun document lipsă nu va fi prezentat ca trimis.</AppText> : null}
      </View>
      </> : null}
    </Card>

    <ServiceDocumentEditorModal
      visible={editorType !== null}
      type={editorType ?? 'INTAKE'}
      sheet={sheet}
      document={selectedDocument}
      financialOverview={financialState.data ?? undefined}
      onClose={() => setEditorType(null)}
      onGenerate={(input) => generate(editorType ?? 'INTAKE', input)}
    />
  </>;
}

const styles = StyleSheet.create({
  panel: { minWidth: 0, gap: spacing.lg },
  header: { minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIcon: { width: 46, height: 46, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { minWidth: 0, flex: 1, gap: 2 },
  refresh: { width: 42, height: 42, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  notice: { minHeight: 66, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  noticeCopy: { minWidth: 170, flex: 1, gap: 2 },
  loading: { minHeight: 110, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  documentList: { gap: spacing.sm },
  document: { minWidth: 0, minHeight: 82, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  documentIcon: { width: 44, height: 44, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  documentCopy: { minWidth: 190, flex: 1, gap: 4 },
  documentTitleRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  documentTitle: { minWidth: 105, flex: 1 },
  status: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: spacing.sm },
  documentActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  rowAction: { minWidth: 142 },
  editAction: { width: 44, height: 44, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  missingNotice: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  missingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  missingActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  missingAction: { minWidth: 190, flexGrow: 1 },
  whatsapp: { borderTopWidth: 1, paddingTop: spacing.lg, gap: spacing.md },
  whatsappHeader: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  whatsappIcon: { width: 44, height: 44, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  whatsappActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  whatsappAction: { minWidth: 170, flex: 1 },
  whatsappHint: { textAlign: 'center', lineHeight: 17 },
});
