import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { ClientFinancialCollaborator } from '@/types';
import { formatFinanceMoney } from '@/utils/client-finance';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

type Props = {
  collaborator: ClientFinancialCollaborator | null;
  currencyCode: string;
  hasServiceSheet: boolean;
  canEditAssignment: boolean;
  canManagePayment: boolean;
  onEditAssignment: () => void;
  onRemoveAssignment: () => Promise<void> | void;
  onSetPaid: (paid: boolean) => Promise<void> | void;
};

export function ClientCollaboratorFinanceCard({
  collaborator,
  currencyCode,
  hasServiceSheet,
  canEditAssignment,
  canManagePayment,
  onEditAssignment,
  onRemoveAssignment,
  onSetPaid,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy, setBusy] = useState<'payment' | 'remove' | ''>('');
  const [error, setError] = useState('');

  const changePayment = async () => {
    if (!collaborator || (!collaborator.hasCommission && !hasServiceSheet)) return;
    setBusy('payment');
    setError('');
    try {
      await onSetPaid(collaborator.status !== 'PAID');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Starea comisionului nu a putut fi actualizată.');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setBusy('remove');
    setError('');
    try {
      await onRemoveAssignment();
      setRemoveOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Atribuirea nu a putut fi eliminată.');
    } finally {
      setBusy('');
    }
  };

  const rule = collaborator ? commissionRule(collaborator, currencyCode) : '';
  const paid = collaborator?.status === 'PAID';
  const tone = paid ? palette.success : palette.warning;

  return <>
    <Card style={styles.card} elevated>
      <View style={styles.titleRow}>
        <View style={[styles.titleIcon, { backgroundColor: `${palette.cyan}18` }]}><Ionicons name="people-outline" size={22} color={palette.cyan} /></View>
        <View style={styles.copy}><AppText variant="heading">Colaborator și comision</AppText><AppText variant="caption" muted>Atribuirea și plata asociate acestui client</AppText></View>
        {collaborator ? <View style={[styles.status, { backgroundColor: isDark ? `${tone}25` : `${tone}12` }]}><View style={[styles.dot, { backgroundColor: tone }]} /><AppText variant="caption" style={{ color: tone, fontWeight: '800' }}>{paid ? 'Achitat' : 'Neachitat'}</AppText></View> : null}
      </View>

      {collaborator ? <>
        <View style={[styles.identity, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: `${palette.cyan}20` }]}><Ionicons name="person-outline" size={23} color={palette.cyan} /></View>
          <View style={styles.copy}><AppText variant="heading">{collaborator.name}</AppText><AppText variant="caption" muted>{collaborator.role || 'Colaborator'} · {rule}</AppText></View>
        </View>

        <View style={styles.metrics}>
          <Metric label="Comision" value={formatFinanceMoney(collaborator.amount, currencyCode)} color={palette.cyan} />
          <Metric label="Achitat" value={formatFinanceMoney(collaborator.paid, currencyCode)} color={palette.success} />
          <Metric label="De achitat" value={formatFinanceMoney(collaborator.due, currencyCode)} color={palette.warning} />
        </View>

        {!collaborator.hasCommission ? <View style={[styles.notice, { backgroundColor: colors.primarySoft }]}><Ionicons name="information-circle-outline" size={19} color={colors.primary} /><AppText variant="caption" style={styles.noticeCopy}>{hasServiceSheet ? 'Comisionul este estimat și va fi sincronizat automat când îi schimbi starea plății.' : 'Comisionul este estimat. Plata devine disponibilă după crearea fișei de service.'}</AppText></View> : null}
        {error ? <View style={[styles.notice, { backgroundColor: `${palette.danger}12` }]}><Ionicons name="alert-circle-outline" size={19} color={palette.danger} /><AppText variant="caption" style={[styles.noticeCopy, { color: palette.danger }]}>{error}</AppText></View> : null}

        <View style={styles.actions}>
          {canEditAssignment ? <Button compact variant="outline" icon="create-outline" label="Editează atribuirea" onPress={onEditAssignment} style={styles.action} /> : null}
          {canManagePayment ? <Button compact variant={paid ? 'outline' : 'primary'} icon={paid ? 'arrow-undo-outline' : 'checkmark-circle-outline'} label={paid ? 'Marchează neachitat' : 'Marchează achitat'} loading={busy === 'payment'} disabled={!collaborator.hasCommission && !hasServiceSheet} onPress={() => void changePayment()} style={styles.action} /> : null}
          {canEditAssignment ? <Button compact variant="danger" icon="person-remove-outline" label="Elimină atribuirea" disabled={busy !== ''} onPress={() => setRemoveOpen(true)} style={styles.action} /> : null}
        </View>
      </> : <View style={[styles.empty, { backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="person-add-outline" size={27} color={colors.primary} /></View>
        <View style={styles.copy}><AppText variant="label">Niciun colaborator atribuit</AppText><AppText variant="caption" muted>Poți alege un colaborator și regula lui de comision din editarea clientului.</AppText></View>
        {canEditAssignment ? <Button compact icon="person-add-outline" label="Atribuie" onPress={onEditAssignment} /> : null}
      </View>}
    </Card>

    <Modal visible={removeOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setRemoveOpen(false)}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityLabel="Închide confirmarea" style={StyleSheet.absoluteFill} onPress={() => setRemoveOpen(false)} />
        <Card style={styles.modal} elevated>
          <View style={[styles.modalIcon, { backgroundColor: `${palette.danger}14` }]}><Ionicons name="person-remove-outline" size={30} color={palette.danger} /></View>
          <View style={styles.modalCopy}><AppText variant="title">Elimini colaboratorul?</AppText><AppText muted>{collaborator ? `${collaborator.name} nu va mai fi atribuit acestui client. Colaboratorul rămâne disponibil în echipă.` : ''}</AppText></View>
          {collaborator?.status === 'PAID' ? <View style={[styles.notice, { backgroundColor: `${palette.warning}14` }]}><Ionicons name="alert-circle-outline" size={19} color={palette.warning} /><AppText variant="caption" style={styles.noticeCopy}>Un comision achitat trebuie marcat mai întâi Neachitat pentru a putea elimina atribuirea.</AppText></View> : null}
          <View style={styles.modalActions}><Button variant="outline" label="Păstrează" disabled={busy === 'remove'} onPress={() => setRemoveOpen(false)} style={styles.modalButton} /><Button variant="danger" icon="person-remove-outline" label="Elimină atribuirea" loading={busy === 'remove'} onPress={() => void remove()} style={styles.modalButton} /></View>
        </Card>
      </View>
    </Modal>
  </>;
}

function commissionRule(collaborator: ClientFinancialCollaborator, currencyCode: string) {
  const value = collaborator.commissionValue ?? 0;
  if (collaborator.commissionType === 'FIXED') return `${formatFinanceMoney(value, currencyCode)} sumă fixă`;
  if (collaborator.commissionType === 'PERCENT_TOTAL') return `${value}% din total`;
  if (collaborator.commissionType === 'PERCENT_NET') return `${value}% din net`;
  return 'Regulă nespecificată';
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors } = useAppTheme();
  return <View style={[styles.metric, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><AppText variant="caption" muted>{label}</AppText><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color, fontWeight: '900' }}>{value}</AppText></View>;
}

const styles = StyleSheet.create({
  card: { width: '100%', gap: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  titleIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  status: { minHeight: 32, borderRadius: radius.pill, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  identity: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { minWidth: 0, flexGrow: 1, flexBasis: '30%', borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs },
  notice: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noticeCopy: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 170 },
  empty: { borderRadius: radius.md, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  emptyIcon: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modal: { width: '100%', maxWidth: 500, padding: spacing.xxl, gap: spacing.lg },
  modalIcon: { width: 62, height: 62, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  modalCopy: { gap: spacing.sm },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modalButton: { flexGrow: 1, flexBasis: 180 },
});
