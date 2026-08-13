import { AppHeader } from '@/components/layout/AppHeader';
import { QuickSignatureModal } from '@/components/service-sheets/ScanServiceSheetModal';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { salesSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { SalesSheet } from '@/types';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, useWindowDimensions, View } from 'react-native';

const paymentLabels = { CASH: 'Numerar', BANK_TRANSFER: 'Transfer bancar', CARD: 'Plată cu cardul' } as const;
const deliveryLabels = { DELIVERY: 'Cu livrare', PICKUP: 'Fără livrare' } as const;
const money = (value: number, currency: string) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function SalesSheetDetailsScreen() {
  const { salesSheetId } = useLocalSearchParams<{ salesSheetId: string }>();
  const { hasPermission } = useAuth();
  const { colors } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const compact = width < 650;
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const state = useAsyncData<SalesSheet>(() => salesSheetRepository.get(salesSheetId), [salesSheetId]);
  if (!hasPermission('sales_sheets.view')) return <Redirect href="/shop/home" />;
  const sheet = state.data;

  const saveSignature = async (signature: string) => {
    if (!sheet) return;
    setSigning(true);
    try {
      const updated = await salesSheetRepository.saveSignature(sheet.id, signature);
      state.setData(updated);setSignatureOpen(false);
      showToast('Semnătura a fost salvată, iar PDF-ul a fost actualizat.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Semnătura nu a putut fi salvată.', 'error'); }
    finally { setSigning(false); }
  };

  return <>
    <Screen header={<AppHeader title={sheet?.number ?? 'Fișă de vânzare'} back onBack={() => router.replace('/shop/sales-sheets' as never)} />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
      <View style={styles.stack}>
        {state.loading ? <LoadingState rows={6} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : sheet ? <>
          <Card style={styles.hero} elevated>
            <View style={[styles.heroIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={29} color={colors.primary} /></View>
            <View style={styles.copy}><View style={styles.titleRow}><AppText variant="title">{sheet.number}</AppText><View style={[styles.status, { backgroundColor: `${palette.success}16` }]}><Ionicons name="checkmark-circle" size={15} color={palette.success} /><AppText variant="caption" style={{ color: palette.success, fontWeight: '900' }}>DOCUMENT EMIS</AppText></View></View><AppText muted>{sheet.customerName} · {sheet.productName}</AppText><AppText variant="caption" muted>{formatDate(sheet.documentAt, true)}{sheet.companyName ? ` · ${sheet.companyName}` : ''}</AppText></View>
            <Button label="Deschide PDF" icon="open-outline" disabled={!sheet.pdfUrl} onPress={() => sheet.pdfUrl && void Linking.openURL(sheet.pdfUrl)} style={compact ? styles.full : undefined} />
          </Card>

          <View style={[styles.metrics, compact && styles.metricsCompact]}>
            <Metric label="Total" value={money(sheet.totalPrice, sheet.currencyCode)} color={colors.primary} />
            <Metric label="Avans" value={money(sheet.advancePaid, sheet.currencyCode)} color={palette.success} />
            <Metric label="Rest de plată" value={money(sheet.remainingDue, sheet.currencyCode)} color={sheet.remainingDue > 0 ? palette.warning : palette.success} />
          </View>

          <Card style={styles.section} elevated><SectionTitle icon="person-outline" title="Client și livrare" /><View style={styles.dataGrid}><Data label="Client" value={sheet.customerName} /><Data label="Telefon" value={sheet.customerPhone} /><Data label="E-mail" value={sheet.customerEmail} /><Data label="Adresă de livrare" value={sheet.deliveryAddress} wide /><Data label="Observații client" value={sheet.customerNotes} wide /></View></Card>
          <Card style={styles.section} elevated><SectionTitle icon="cube-outline" title="Produs" /><View style={styles.dataGrid}><Data label="Produs / model" value={sheet.productName} wide /><Data label="Cod produs" value={sheet.productCode} /><Data label="Serie / IMEI" value={sheet.serialNumber} /><Data label="Cantitate" value={String(sheet.quantity)} /><Data label="Garanție" value={sheet.warranty} /></View></Card>
          <Card style={styles.section} elevated><SectionTitle icon="card-outline" title="Plată și valori" /><View style={styles.dataGrid}><Data label="Plată" value={paymentLabels[sheet.paymentMethod]} /><Data label="Livrare" value={deliveryLabels[sheet.deliveryMode]} /><Data label="Preț unitar" value={money(sheet.productUnitPrice, sheet.currencyCode)} /><Data label="Preț produse" value={money(sheet.productPrice, sheet.currencyCode)} /><Data label="Preț livrare" value={money(sheet.deliveryPrice, sheet.currencyCode)} /><Data label="Scadență" value={sheet.dueAt ? formatDate(sheet.dueAt, true) : 'Fără scadență'} /></View></Card>

          <Card style={styles.section} elevated>
            <SectionTitle icon="pencil-outline" title="Semnătura clientului" />
            <View style={[styles.signature, { backgroundColor: colors.surfaceMuted, borderColor: sheet.signatureUrl ? palette.success : colors.border }]}><View style={[styles.signatureIcon, { backgroundColor: sheet.signatureUrl ? `${palette.success}18` : `${palette.purple}16` }]}><Ionicons name={sheet.signatureUrl ? 'checkmark-circle' : 'pencil-outline'} size={24} color={sheet.signatureUrl ? palette.success : palette.purple} /></View><View style={styles.copy}><AppText variant="label">{sheet.signatureUrl ? 'Fișa este semnată electronic' : 'Fișa nu este încă semnată'}</AppText><AppText variant="caption" muted>{sheet.signedAt ? `Semnat la ${formatDate(sheet.signedAt, true)}. PDF-ul conține semnătura.` : 'Clientul poate semna acum, iar PDF-ul se actualizează automat.'}</AppText></View>{hasPermission('sales_sheets.update') ? <Button compact label={sheet.signatureUrl ? 'Resemnează' : 'Semnează'} icon="pencil-outline" onPress={() => setSignatureOpen(true)} /> : null}</View>
          </Card>

          {sheet.notes ? <Card style={styles.section}><SectionTitle icon="document-text-outline" title="Observații" /><AppText>{sheet.notes}</AppText></Card> : null}
        </> : null}
      </View>
    </Screen>
    {sheet ? <QuickSignatureModal visible={signatureOpen} clientName={sheet.customerName} saving={signing} onClose={() => !signing && setSignatureOpen(false)} onConfirm={(value) => void saveSignature(value)} /> : null}
  </>;
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) { const { colors } = useAppTheme(); return <View style={styles.sectionTitle}><View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name={icon} size={20} color={colors.primary} /></View><AppText variant="heading">{title}</AppText></View>; }
function Data({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) { return <View style={[styles.data, wide && styles.dataWide]}><AppText variant="caption" muted>{label.toLocaleUpperCase('ro-RO')}</AppText><AppText variant="label">{value || '—'}</AppText></View>; }
function Metric({ label, value, color }: { label: string; value: string; color: string }) { return <Card style={styles.metric}><AppText variant="caption" muted>{label}</AppText><AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{ color }}>{value}</AppText></Card>; }

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 920, alignSelf: 'center', gap: spacing.lg }, hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, copy: { minWidth: 0, flex: 1, gap: 3 }, titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, status: { minHeight: 26, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 }, full: { width: '100%' },
  metrics: { flexDirection: 'row', gap: spacing.md }, metricsCompact: { flexDirection: 'column' }, metric: { minWidth: 170, flex: 1, gap: spacing.xs }, section: { gap: spacing.lg }, sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, sectionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, dataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, data: { minWidth: 180, flexGrow: 1, flexBasis: '30%', gap: 4 }, dataWide: { flexBasis: '64%' },
  signature: { padding: spacing.md, borderWidth: 1.5, borderRadius: radius.lg, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, signatureIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
