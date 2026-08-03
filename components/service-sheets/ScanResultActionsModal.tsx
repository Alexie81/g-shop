import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];
type MissingStep = 'INTAKE' | 'FINAL_ESTIMATE' | null;

type Props = {
  visible: boolean;
  clientName: string;
  hasSheet: boolean;
  hasIntake: boolean;
  hasFinalEstimate: boolean;
  hasExit: boolean;
  hasSignature: boolean;
  canSign: boolean;
  onClient: () => void;
  onIntake: () => void;
  onFinalEstimate: () => void;
  onExit: () => void;
  onSignature: () => void;
  onCancel: () => void;
};

export function ScanResultActionsModal({
  visible,
  clientName,
  hasSheet,
  hasIntake,
  hasFinalEstimate,
  hasExit,
  hasSignature,
  canSign,
  onClient,
  onIntake,
  onFinalEstimate,
  onExit,
  onSignature,
  onCancel,
}: Props) {
  const { colors } = useAppTheme();
  const [missingStep, setMissingStep] = useState<MissingStep>(null);

  useEffect(() => { if (visible) setMissingStep(null); }, [clientName, visible]);

  const chooseFinalEstimate = () => {
    if (!hasSheet || !hasIntake) return setMissingStep('INTAKE');
    onFinalEstimate();
  };
  const chooseExit = () => {
    if (!hasSheet || !hasIntake) return setMissingStep('INTAKE');
    if (!hasFinalEstimate) return setMissingStep('FINAL_ESTIMATE');
    onExit();
  };
  const close = () => { setMissingStep(null); onCancel(); };
  const continueMissingStep = () => {
    if (missingStep === 'INTAKE') onIntake();
    else if (missingStep === 'FINAL_ESTIMATE') onFinalEstimate();
  };

  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
    <ModalSafeBottom style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Închide acțiunile scanării" style={StyleSheet.absoluteFill} onPress={close} />
      <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        {missingStep ? <>
          <View style={styles.blockerHeader}>
            <View style={[styles.blockerIcon, { backgroundColor: `${palette.warning}16` }]}><Ionicons name="git-compare-outline" size={26} color={palette.warning} /></View>
            <View style={styles.headerCopy}>
              <AppText variant="title">{missingStep === 'INTAKE' ? 'Mai întâi, fișa de intrare' : 'Mai întâi, devizul final'}</AppText>
              <AppText variant="caption" muted>{clientName}</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Înapoi la acțiuni" onPress={() => setMissingStep(null)} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="arrow-back" size={21} color={colors.text} /></Pressable>
          </View>
          <View style={[styles.blockerNotice, { backgroundColor: `${palette.warning}0D`, borderColor: `${palette.warning}35` }]}>
            <Ionicons name="alert-circle-outline" size={22} color={palette.warning} />
            <AppText style={styles.blockerCopy}>{missingStep === 'INTAKE'
              ? 'Devizul final și fișa de ieșire se bazează pe datele din fișa de intrare. Creeaz-o înainte de a continua.'
              : 'Fișa de ieșire se bazează pe devizul final. Creează devizul înainte de predarea produsului.'}</AppText>
          </View>
          <Button label={missingStep === 'INTAKE' ? 'Creează fișa de intrare' : 'Creează devizul final'} icon="add-circle-outline" onPress={continueMissingStep} />
          <Button variant="ghost" label="Înapoi la cele 4 opțiuni" onPress={() => setMissingStep(null)} />
        </> : <>
          <View style={styles.header}>
            <View style={[styles.scanIcon, { backgroundColor: `${palette.success}16` }]}><Ionicons name="checkmark-circle-outline" size={27} color={palette.success} /></View>
            <View style={styles.headerCopy}><AppText variant="title">Ce vrei să deschizi?</AppText><AppText variant="caption" muted numberOfLines={1}>{clientName}</AppText></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Închide" onPress={close} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable>
          </View>
          <View style={styles.grid}>
            <ActionTile label="Arată clientul" status="Profil" icon="person-outline" color={colors.primary} ready onPress={onClient} />
            <ActionTile label="Fișă de intrare" status={hasIntake ? 'Creată' : 'De creat'} icon="enter-outline" color={palette.cyan} ready={hasIntake} onPress={onIntake} />
            <ActionTile label="Deviz final" status={hasFinalEstimate ? 'Creat' : 'De creat'} icon="receipt-outline" color={palette.purple} ready={hasFinalEstimate} onPress={chooseFinalEstimate} />
            <ActionTile label="Fișă de ieșire" status={hasExit ? 'Creată' : 'De creat'} icon="exit-outline" color={palette.success} ready={hasExit} onPress={chooseExit} />
            {canSign ? <ActionTile label="Semnează clientul" status={hasSignature ? 'Semnat' : 'De semnat'} icon="pencil-outline" color={palette.purple} ready={hasSignature} onPress={onSignature} /> : null}
          </View>
          <Button variant="ghost" label="Scanează alt cod" icon="scan-outline" onPress={close} />
        </>}
      </View>
    </ModalSafeBottom>
  </Modal>;
}

function ActionTile({ label, status, icon, color, ready, onPress }: { label: string; status: string; icon: IconName; color: string; ready: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${status}`} onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderColor: ready ? `${color}55` : colors.border, opacity: pressed ? 0.76 : 1 }]}>
    <View style={[styles.actionIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={23} color={color} /></View>
    <AppText variant="label" numberOfLines={2} style={styles.actionLabel}>{label}</AppText>
    <View style={[styles.status, { backgroundColor: ready ? `${palette.success}13` : colors.surfaceMuted }]}><View style={[styles.statusDot, { backgroundColor: ready ? palette.success : colors.textMuted }]} /><AppText variant="caption" numberOfLines={1} style={{ color: ready ? palette.success : colors.textMuted, fontWeight: '800' }}>{status}</AppText></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  handle: { width: 46, height: 5, borderRadius: radius.pill, alignSelf: 'center' },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  blockerHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scanIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  blockerIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { minWidth: 0, flex: 1, gap: 2 },
  close: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { minWidth: 145, minHeight: 118, flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  actionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { minHeight: 36 },
  status: { minHeight: 25, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  blockerNotice: { minHeight: 92, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  blockerCopy: { minWidth: 0, flex: 1, lineHeight: 20 },
});
