import { FinanceNumberField } from '@/components/clients/finance/FinanceNumberField';
import { AccessoriesField, hasNoAccessories, NO_ACCESSORIES_VALUE } from '@/components/service-sheets/AccessoriesField';
import { TechnicianField } from '@/components/service-sheets/TechnicianField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Input } from '@/components/ui/Input';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { clientRepository, serviceSheetRepository } from '@/repositories/api-repositories';
import { ApiError } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { ServiceSheet, UUID } from '@/types';
import { calculateClientFinance, ClientFinanceValue, formatFinanceMoney } from '@/utils/client-finance';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';

type QuickSheetForm = {
  equipment: string;
  brand: string;
  model: string;
  serialNumber: string;
  accessories: string;
  reportedIssue: string;
  technicalAssessment: string;
  technicianId: string;
  technicianName: string;
  diagnosticFee: number;
  partsCost: number;
  laborCost: number;
  advancePaid: number;
  discountPercent: number;
  currencyCode: string;
  estimatedRepairDays: string;
  intakeAgreementAt: string;
  approveDiagnostics: boolean;
  approveRepair: boolean;
  repairRefused: boolean;
  productDelivered: boolean;
};

type Props = {
  visible: boolean;
  propertyId: UUID;
  clientId: UUID;
  clientName: string;
  existingSheet?: ServiceSheet | null;
  onCancel: () => void;
  onCompleted: (sheet: ServiceSheet) => void;
};

const emptyForm: QuickSheetForm = {
  equipment: '',
  brand: '',
  model: '',
  serialNumber: '',
  accessories: '',
  reportedIssue: '',
  technicalAssessment: '',
  technicianId: '',
  technicianName: '',
  diagnosticFee: 0,
  partsCost: 0,
  laborCost: 0,
  advancePaid: 0,
  discountPercent: 0,
  currencyCode: 'RON',
  estimatedRepairDays: '2',
  intakeAgreementAt: '',
  approveDiagnostics: false,
  approveRepair: false,
  repairRefused: false,
  productDelivered: false,
};

function formFromSheet(sheet?: ServiceSheet | null): QuickSheetForm {
  if (!sheet) return { ...emptyForm };
  const repairRefused = sheet.repairRefused ?? false;
  return {
    equipment: sheet.equipment ?? '',
    brand: sheet.brand ?? '',
    model: sheet.model ?? '',
    serialNumber: sheet.serialNumber ?? '',
    accessories: sheet.accessories ?? '',
    reportedIssue: sheet.reportedIssue ?? '',
    technicalAssessment: sheet.technicalAssessment ?? '',
    technicianId: sheet.technicianId ?? '',
    technicianName: sheet.technicianName ?? '',
    diagnosticFee: 0,
    partsCost: sheet.partsCost ?? 0,
    laborCost: sheet.laborCost ?? 0,
    advancePaid: 0,
    discountPercent: 0,
    currencyCode: sheet.currencyCode ?? 'RON',
    estimatedRepairDays: sheet.estimatedRepairDays ? String(sheet.estimatedRepairDays) : '',
    intakeAgreementAt: sheet.signedAt ?? '',
    approveDiagnostics: sheet.approveDiagnostics ?? false,
    approveRepair: repairRefused ? false : sheet.approveRepair ?? false,
    repairRefused,
    productDelivered: sheet.productDelivered ?? false,
  };
}

export function ScanServiceSheetModal({ visible, propertyId, clientId, clientName, existingSheet, onCancel, onCompleted }: Props) {
  const { colors } = useAppTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState<QuickSheetForm>(() => formFromSheet(existingSheet));
  const [saving, setSaving] = useState(false);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(false);
  const savingRef = useRef(false);
  const translateY = useRef(new Animated.Value(640)).current;
  const canSign = hasPermission('service_sheets.sign');
  const canSave = existingSheet ? hasPermission('service_sheets.update') : hasPermission('service_sheets.create');
  const canViewFinancials = hasPermission('financials.view');
  const canEditFinancials = canViewFinancials && hasPermission('clients.update');
  const estimate = useMemo(() => calculateClientFinance({
    currencyCode: form.currencyCode || 'RON',
    exchangeRateToRon: 1,
    workPrice: form.partsCost + form.laborCost,
    diagnosticFee: form.diagnosticFee,
    advancePaid: form.advancePaid,
    discountPercent: form.discountPercent,
    actualPartsCost: 0,
    displayedPartsCost: form.partsCost,
    displayedLaborCost: form.laborCost,
    paymentStatus: 'UNPAID',
  } satisfies ClientFinanceValue, []), [form.advancePaid, form.currencyCode, form.diagnosticFee, form.discountPercent, form.laborCost, form.partsCost]);

  useEffect(() => {
    if (!visible) return;
    const nextForm = formFromSheet(existingSheet);
    setForm({ ...nextForm, intakeAgreementAt: nextForm.intakeAgreementAt || new Date().toISOString() });
    setSignatureOpen(false);
    setPendingSignature(null);
    setSignatureSaving(false);
    setSignatureSaved(false);
    savingRef.current = false;
    setSaving(false);
    translateY.setValue(640);
    Animated.spring(translateY, { toValue: 0, damping: 24, stiffness: 230, mass: 0.9, useNativeDriver: true }).start();
  }, [clientId, existingSheet, translateY, visible]);

  useEffect(() => {
    if (!visible || !canViewFinancials) {
      setFinanceLoading(false);
      return;
    }
    let cancelled = false;
    setFinanceLoading(true);
    clientRepository.getFinancials(clientId).then((overview) => {
      if (cancelled) return;
      const financials = overview.financials;
      setForm((current) => ({
        ...current,
        diagnosticFee: financials.diagnosticFee ?? 0,
        partsCost: financials.displayedPartsCost ?? current.partsCost,
        laborCost: financials.displayedLaborCost ?? current.laborCost,
        advancePaid: financials.advancePaid ?? 0,
        discountPercent: financials.discountPercent ?? 0,
        currencyCode: financials.currencyCode || current.currencyCode || 'RON',
      }));
    }).catch((error) => {
      if (!cancelled) showToast(error instanceof Error ? error.message : 'Costurile clientului nu au putut fi încărcate.', 'error');
    }).finally(() => {
      if (!cancelled) setFinanceLoading(false);
    });
    return () => { cancelled = true; };
  }, [canViewFinancials, clientId, showToast, visible]);

  const dismiss = useCallback(() => {
    if (savingRef.current) return;
    Keyboard.dismiss();
    Animated.timing(translateY, { toValue: 720, duration: 210, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onCancel();
    });
  }, [onCancel, translateY]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !savingRef.current,
    onStartShouldSetPanResponderCapture: () => !savingRef.current,
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 7 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => gesture.dy > 7 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => translateY.stopAnimation(),
    onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 76 || gesture.vy > 0.68) dismiss();
      else Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 250, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 250, useNativeDriver: true }).start(),
    onPanResponderTerminationRequest: () => false,
  }), [dismiss, translateY]);

  const update = <K extends keyof QuickSheetForm>(key: K, value: QuickSheetForm[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'approveRepair' && value === true) next.repairRefused = false;
      if (key === 'repairRefused' && value === true) next.approveRepair = false;
      return next;
    });
  };

  const persist = useCallback(async (signature: string | null) => {
    if (savingRef.current) return;
    if (form.reportedIssue.trim().length < 3) {
      showToast('Completează problema reclamată de client.', 'error');
      return;
    }
    if (form.discountPercent > 100) {
      showToast('Reducerea nu poate depăși 100%.', 'error');
      return;
    }
    if (!/^[A-Z]{3}$/.test(form.currencyCode.trim().toUpperCase())) {
      showToast('Moneda trebuie completată cu un cod din 3 litere, de exemplu RON.', 'error');
      return;
    }
    if (!canSave) {
      showToast(existingSheet ? 'Nu ai permisiunea de a actualiza fișa de intrare.' : 'Nu ai permisiunea de a crea fișa de intrare.', 'error');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    const editableFields = {
      equipment: form.equipment.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      serialNumber: form.serialNumber.trim(),
      accessories: hasNoAccessories(form.accessories) ? NO_ACCESSORIES_VALUE : form.accessories.trim(),
      reportedIssue: form.reportedIssue.trim(),
      technicalAssessment: form.technicalAssessment.trim(),
      technicianId: form.technicianId || undefined,
      technicianName: form.technicianName.trim(),
      partsCost: form.partsCost,
      laborCost: form.laborCost,
      totalCost: estimate.totalDue,
      currencyCode: form.currencyCode.trim().toUpperCase(),
      approveDiagnostics: form.approveDiagnostics,
      approveRepair: form.approveRepair,
      repairRefused: form.repairRefused,
      productDelivered: form.productDelivered,
    };

    try {
      if (canEditFinancials) {
        await clientRepository.updateFinancials(clientId, {
          currencyCode: form.currencyCode.trim().toUpperCase(),
          workPrice: form.partsCost + form.laborCost,
          diagnosticFee: form.diagnosticFee,
          advancePaid: form.advancePaid,
          discountPercent: form.discountPercent,
          displayedPartsCost: form.partsCost,
          displayedLaborCost: form.laborCost,
        });
      }

      let saved: ServiceSheet;
      let updatedExisting = Boolean(existingSheet);
      try {
        saved = existingSheet
          ? await serviceSheetRepository.update(existingSheet.id, editableFields)
          : await serviceSheetRepository.create({
            ...editableFields,
            propertyId,
            clientId,
            status: 'NEW',
            receivedAt: new Date().toISOString(),
          });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        const details = error.details as { code?: unknown; serviceSheetId?: unknown } | undefined;
        if (details?.code !== 'SERVICE_SHEET_ALREADY_EXISTS' || typeof details.serviceSheetId !== 'string') throw error;
        updatedExisting = true;
        const current = await serviceSheetRepository.get(details.serviceSheetId);
        saved = hasPermission('service_sheets.update')
          ? await serviceSheetRepository.update(current.id, editableFields)
          : current;
      }

      if (signature && canSign) saved = await serviceSheetRepository.saveSignature(saved.id, signature);
      await serviceSheetRepository.generateDocument(saved.id, 'INTAKE', {
        agreementAt: form.intakeAgreementAt,
        agreementStatus: form.repairRefused ? 'REFUSED' : 'ACCEPTED',
        estimatedRepairDays: form.estimatedRepairDays.trim() ? Number(form.estimatedRepairDays) : undefined,
        estimatedCosts: {
          diagnosticFee: form.diagnosticFee,
          partsCost: form.partsCost,
          laborCost: form.laborCost,
          advancePaid: form.advancePaid,
          discountPercent: form.discountPercent,
          currencyCode: form.currencyCode.trim().toUpperCase(),
          subtotal: estimate.subtotal,
          discountAmount: estimate.discountAmount,
          totalDue: estimate.totalDue,
          receivedAmount: estimate.receivedAmount,
          remainingDue: estimate.remainingDue,
        },
      });
      showToast(updatedExisting ? 'Fișa de intrare a fost actualizată.' : 'Fișa de intrare a fost creată.', 'success');
      onCompleted(saved);
    } catch (error) {
      savingRef.current = false;
      setSaving(false);
      showToast(error instanceof Error ? error.message : 'Fișa de intrare nu a putut fi salvată.', 'error');
    }
  }, [canEditFinancials, canSave, canSign, clientId, estimate.discountAmount, estimate.receivedAmount, estimate.remainingDue, estimate.subtotal, estimate.totalDue, existingSheet, form, hasPermission, onCompleted, propertyId, showToast]);

  const submit = () => {
    if (savingRef.current) return;
    Keyboard.dismiss();
    void persist(pendingSignature);
  };

  const confirmSignature = async (signature: string) => {
    if (!existingSheet) {
      setPendingSignature(signature);
      setSignatureSaved(false);
      setSignatureOpen(false);
      showToast('Semnătura clientului este pregătită.', 'success');
      return;
    }

    if (signatureSaving) return;
    setSignatureSaving(true);
    try {
      await serviceSheetRepository.saveSignature(existingSheet.id, signature);
      setPendingSignature(null);
      setSignatureSaved(true);
      setSignatureOpen(false);
      showToast('Semnătura a fost actualizată în toate documentele deja generate.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Semnătura nu a putut fi actualizată.', 'error');
    } finally {
      setSignatureSaving(false);
    }
  };

  return <><Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
    <ModalSafeBottom style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <Pressable accessibilityLabel="Anulează fișa de intrare" style={StyleSheet.absoluteFill} onPress={dismiss} />
      <KeyboardAvoidingView style={styles.positioner} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.View style={[styles.sheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, transform: [{ translateY }] }]}>
          <View style={styles.dragHeader}>
            <View style={styles.dragSurface} {...panResponder.panHandlers}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              <View style={styles.headerRow}>
                <View style={[styles.headerIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={25} color={colors.primary} /></View>
                <View style={styles.headerCopy}>
                  <AppText variant="title">Fișă de intrare</AppText>
                  <AppText variant="caption" muted>{clientName} · recepție, cost estimativ și acord</AppText>
                </View>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Anulează și închide" onPress={dismiss} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={23} color={colors.text} /></Pressable>
          </View>

          <ScrollView
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {existingSheet ? <View style={[styles.notice, { backgroundColor: colors.primarySoft }]}><Ionicons name="sync-outline" size={20} color={colors.primary} /><AppText variant="caption" style={[styles.noticeCopy, { color: colors.primary }]}>Clientul are deja fișa {existingSheet.number}. Datele completate aici o actualizează, fără a crea un duplicat.</AppText></View> : null}

            <View style={styles.sectionTitle}><Ionicons name="construct-outline" size={20} color={colors.primary} /><AppText variant="heading">Date esențiale</AppText></View>
            <View style={styles.row}>
              <View style={styles.field}><Input label="Tip echipament" value={form.equipment} onChangeText={(value) => update('equipment', value)} placeholder="Laptop, telefon, consolă…" /></View>
              <View style={styles.field}><Input label="Marcă" value={form.brand} onChangeText={(value) => update('brand', value)} /></View>
            </View>
            <View style={styles.row}>
              <View style={styles.field}><Input label="Model" value={form.model} onChangeText={(value) => update('model', value)} /></View>
              <View style={styles.field}><Input label="Serie" value={form.serialNumber} onChangeText={(value) => update('serialNumber', value)} /></View>
            </View>
            <AccessoriesField value={form.accessories} onChange={(value) => update('accessories', value)} />
            <Input label="Problema reclamată *" value={form.reportedIssue} onChangeText={(value) => update('reportedIssue', value)} multiline numberOfLines={4} style={styles.multiline} placeholder="Descrie pe scurt problema semnalată de client" />
            <Input label="Constatare inițială" value={form.technicalAssessment} onChangeText={(value) => update('technicalAssessment', value)} multiline numberOfLines={3} style={styles.multiline} />
            <TechnicianField propertyId={propertyId} technicianId={form.technicianId || undefined} technicianName={form.technicianName} onChange={({ id, name }) => setForm((current) => ({ ...current, technicianId: id, technicianName: name }))} />

            <View style={styles.sectionTitle}><Ionicons name={canViewFinancials ? 'calculator-outline' : 'calendar-outline'} size={20} color={palette.cyan} /><AppText variant="heading">{canViewFinancials ? 'Cost estimativ' : 'Termen și acord'}</AppText></View>
            {canViewFinancials ? <>
              <AppText variant="caption" muted>Valorile sunt salvate în finanțele clientului și apar în fișa de intrare.</AppText>
              {financeLoading ? <View style={[styles.financeNotice, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="sync-outline" size={18} color={colors.primary} /><AppText variant="caption" muted>Se încarcă valorile financiare existente…</AppText></View> : null}
              <View style={styles.estimateGrid}>
              <FinanceNumberField label="Diagnostic" value={form.diagnosticFee} onChange={(value) => update('diagnosticFee', value)} disabled={financeLoading} style={styles.estimateField} />
              <FinanceNumberField label="Piese estimate" value={form.partsCost} onChange={(value) => update('partsCost', value)} disabled={financeLoading} style={styles.estimateField} />
              <FinanceNumberField label="Manoperă estimată" value={form.laborCost} onChange={(value) => update('laborCost', value)} disabled={financeLoading} style={styles.estimateField} />
              <FinanceNumberField label="Avans încasat" value={form.advancePaid} onChange={(value) => update('advancePaid', value)} disabled={financeLoading} style={styles.estimateField} />
              <FinanceNumberField label="Reducere" value={form.discountPercent} onChange={(value) => update('discountPercent', value)} disabled={financeLoading} percentage style={styles.estimateField} />
              </View>
              <View style={styles.row}><View style={styles.field}><Input label="Monedă" value={form.currencyCode} editable={!financeLoading} autoCapitalize="characters" maxLength={3} onChangeText={(value) => update('currencyCode', value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} placeholder="RON" /></View></View>
              <View style={[styles.estimateSummary, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <EstimateMetric label="TOTAL ESTIMAT" value={formatFinanceMoney(estimate.totalDue, form.currencyCode || 'RON')} color={colors.primary} />
                <EstimateMetric label="AVANS" value={formatFinanceMoney(Math.min(form.advancePaid, estimate.totalDue), form.currencyCode || 'RON')} color={palette.purple} />
                <EstimateMetric label="REST ESTIMAT" value={formatFinanceMoney(estimate.remainingDue, form.currencyCode || 'RON')} color={estimate.remainingDue > 0 ? palette.warning : palette.success} />
              </View>
            </> : null}
            <View style={styles.row}>
              <View style={styles.field}><Input label="Termen estimat (zile lucrătoare)" value={form.estimatedRepairDays} keyboardType="number-pad" inputMode="numeric" onChangeText={(value) => update('estimatedRepairDays', value.replace(/\D/g, '').slice(0, 3))} placeholder="ex. 3" /></View>
            </View>
            <DateTimeField label="Data acordului pentru costul estimativ" value={form.intakeAgreementAt} onChange={(value) => update('intakeAgreementAt', value)} allowClear showNow />

            <View style={styles.sectionTitle}><Ionicons name="shield-checkmark-outline" size={20} color={palette.purple} /><AppText variant="heading">Acordul clientului</AppText></View>
            <AppText variant="caption" muted>Bifele sunt salvate în fișă împreună cu semnătura clientului.</AppText>
            <View style={styles.consentGrid}>
              <ConsentOption label="Aprobă diagnosticarea" icon="search-outline" active={form.approveDiagnostics} onPress={() => update('approveDiagnostics', !form.approveDiagnostics)} />
              <ConsentOption label="Aprobă reparația" icon="construct-outline" active={form.approveRepair} onPress={() => update('approveRepair', !form.approveRepair)} />
              <ConsentOption label="Refuză reparația" icon="close-circle-outline" active={form.repairRefused} danger onPress={() => update('repairRefused', !form.repairRefused)} />
              <ConsentOption label="Produs predat" icon="checkmark-done-outline" active={form.productDelivered} onPress={() => update('productDelivered', !form.productDelivered)} />
            </View>

            {canSign ? <View style={[styles.signaturePrompt, { borderColor: pendingSignature || signatureSaved ? palette.success : colors.border, backgroundColor: pendingSignature || signatureSaved ? `${palette.success}10` : colors.surfaceMuted }]}>
              <View style={[styles.signaturePromptIcon, { backgroundColor: pendingSignature || signatureSaved ? `${palette.success}18` : `${palette.purple}16` }]}><Ionicons name={pendingSignature || signatureSaved ? 'checkmark-circle-outline' : 'pencil-outline'} size={24} color={pendingSignature || signatureSaved ? palette.success : palette.purple} /></View>
              <View style={styles.signaturePromptCopy}><AppText variant="label">{signatureSaved ? 'Semnătura a fost actualizată' : pendingSignature ? 'Semnătura este pregătită' : existingSheet?.signatureUrl ? 'Fișa are deja o semnătură' : 'Semnătura clientului'}</AppText><AppText variant="caption" muted>{signatureSaved ? 'Este salvată online și a actualizat toate documentele deja generate.' : pendingSignature ? 'Va fi salvată împreună cu fișa de intrare.' : 'Deschide cadrul dedicat pentru ca persoana să poată semna fără conflict cu scrollul.'}</AppText></View>
              <Button compact label="Semnează clientul" icon="pencil-outline" disabled={signatureSaving} onPress={() => setSignatureOpen(true)} style={styles.signaturePromptButton} />
            </View> : null}

            <Button
              label={existingSheet ? 'Actualizează fișa de intrare' : 'Creează fișa de intrare'}
              icon="checkmark-circle-outline"
              loading={saving}
              disabled={!canSave || financeLoading}
              onPress={submit}
              style={styles.submit}
            />
            <Button variant="ghost" label="Anulează" onPress={dismiss} />
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </ModalSafeBottom>
  </Modal>
    <QuickSignatureModal
      visible={visible && signatureOpen}
      clientName={clientName}
      saving={signatureSaving}
      onClose={() => setSignatureOpen(false)}
      onConfirm={(signature) => void confirmSignature(signature)}
    />
  </>;
}

export function QuickSignatureModal({ visible, clientName, saving, onClose, onConfirm }: { visible: boolean; clientName: string; saving: boolean; onClose: () => void; onConfirm: (signature: string) => void }) {
  const { colors } = useAppTheme();
  const signatureRef = useRef<SignatureViewRef>(null);
  const [hasStroke, setHasStroke] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setHasStroke(false);
    setError('');
    signatureRef.current?.clearSignature();
  }, [visible]);

  const finish = () => {
    if (saving) return;
    if (!hasStroke) {
      setError('Clientul trebuie să semneze în cadrul alb înainte să apeși Gata.');
      return;
    }
    setError('');
    signatureRef.current?.readSignature();
  };

  const clear = () => {
    signatureRef.current?.clearSignature();
    setHasStroke(false);
    setError('');
  };

  const signatureWebStyle = '.m-signature-pad { box-shadow: none; border: none; background: #fff; } .m-signature-pad--body { border: none; background: #fff; } .m-signature-pad--footer { display: none; } body,html { background: transparent; }';

  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !saving && onClose()}>
    <ModalSafeBottom style={[styles.signatureOverlay, { backgroundColor: colors.overlay }]}>
      <Pressable accessibilityLabel="Închide semnătura" disabled={saving} style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.signatureModal, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={styles.signatureModalHeader}>
          <View style={[styles.signatureModalIcon, { backgroundColor: `${palette.purple}16` }]}><Ionicons name="pencil-outline" size={26} color={palette.purple} /></View>
          <View style={styles.signatureModalCopy}><AppText variant="title">Semnează clientul</AppText><AppText variant="caption" muted>{clientName} · semnează în cadrul de mai jos</AppText></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Închide" disabled={saving} onPress={onClose} style={[styles.signatureModalClose, { backgroundColor: colors.surfaceMuted, opacity: saving ? 0.45 : 1 }]}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
        </View>

        <View style={[styles.signatureCanvas, { borderColor: hasStroke ? colors.primary : colors.border }]}>
          <SignatureScreen
            ref={signatureRef}
            onBegin={() => { setHasStroke(true); setError(''); }}
            onOK={onConfirm}
            onEmpty={() => setError('Clientul trebuie să semneze înainte să apeși Gata.')}
            autoClear={false}
            scrollable={false}
            descriptionText=""
            clearText="Șterge"
            confirmText="Gata"
            webStyle={signatureWebStyle}
            backgroundColor="transparent"
            penColor="#07152D"
          />
        </View>

        {error ? <View style={[styles.signatureError, { backgroundColor: `${palette.danger}12`, borderColor: `${palette.danger}35` }]}><Ionicons name="alert-circle-outline" size={19} color={palette.danger} /><AppText variant="caption" style={{ color: palette.danger, flex: 1 }}>{error}</AppText></View> : <View style={[styles.signatureHint, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="hand-left-outline" size={18} color={colors.primary} /><AppText variant="caption" muted style={{ flex: 1 }}>Acest popup nu se derulează. Toate gesturile din cadrul alb sunt folosite numai pentru semnătură.</AppText></View>}

        <View style={styles.signatureModalActions}>
          <Button variant="outline" label="Șterge" icon="trash-outline" disabled={saving} onPress={clear} style={styles.signatureModalAction} />
          <Button label="Gata" icon="checkmark-circle-outline" loading={saving} onPress={finish} style={styles.signatureModalAction} />
        </View>
      </View>
    </ModalSafeBottom>
  </Modal>;
}

function ConsentOption({ label, icon, active, danger = false, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; danger?: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const accent = danger ? palette.danger : colors.primary;
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: active }} onPress={onPress} style={({ pressed }) => [styles.consentOption, { borderColor: active ? accent : colors.border, backgroundColor: active ? `${accent}12` : colors.surfaceMuted, opacity: pressed ? 0.74 : 1 }]}>
    <View style={[styles.consentIcon, { backgroundColor: active ? accent : colors.surface }]}><Ionicons name={active ? 'checkmark' : icon} size={18} color={active ? '#FFFFFF' : colors.textMuted} /></View>
    <AppText variant="caption" style={{ minWidth: 0, flex: 1, fontWeight: '800', color: active ? accent : colors.text }}>{label}</AppText>
  </Pressable>;
}

function EstimateMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={styles.estimateMetric}>
    <AppText variant="caption" muted style={styles.estimateMetricLabel}>{label}</AppText>
    <AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color }}>{value}</AppText>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  positioner: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 760, maxHeight: '94%', alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
  dragHeader: { position: 'relative', minHeight: 100 },
  dragSurface: { minHeight: 100, paddingTop: spacing.sm, paddingLeft: spacing.lg, paddingRight: 82, paddingBottom: spacing.md },
  handle: { width: 48, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginBottom: spacing.md },
  headerRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { minWidth: 0, flex: 1, gap: 3 },
  close: { position: 'absolute', zIndex: 5, elevation: 5, top: 34, right: spacing.lg, width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  notice: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  noticeCopy: { minWidth: 0, flex: 1, fontWeight: '700' },
  sectionTitle: { paddingTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { minWidth: 210, flex: 1 },
  multiline: { minHeight: 82, textAlignVertical: 'top' },
  financeNotice: { minHeight: 42, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  estimateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  estimateField: { minWidth: 210, flexBasis: '45%', flexGrow: 1 },
  estimateSummary: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: spacing.sm },
  estimateMetric: { minWidth: 126, minHeight: 58, flexBasis: 140, flexGrow: 1, flexShrink: 1, justifyContent: 'center', gap: 3, paddingHorizontal: spacing.sm },
  estimateMetricLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.45 },
  consentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  consentOption: { minHeight: 54, minWidth: 205, flexBasis: '46%', flexGrow: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  consentIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  signaturePrompt: { minHeight: 82, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  signaturePromptIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  signaturePromptCopy: { minWidth: 170, flex: 1, gap: 2 },
  signaturePromptButton: { minWidth: 170 },
  signatureOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  signatureModal: { width: '100%', maxWidth: 720, maxHeight: '94%', borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 28, elevation: 18 },
  signatureModalHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  signatureModalIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  signatureModalCopy: { minWidth: 0, flex: 1, gap: 3 },
  signatureModalClose: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  signatureCanvas: { width: '100%', height: 310, borderWidth: 2, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  signatureHint: { minHeight: 48, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  signatureError: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  signatureModalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  signatureModalAction: { flex: 1, minWidth: 150 },
  submit: { marginTop: spacing.sm },
});
