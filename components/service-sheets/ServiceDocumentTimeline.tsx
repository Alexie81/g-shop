import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

const steps = [
  { number: 1, title: 'Fișa de intrare', description: 'Client, echipament, problemă și estimare', icon: 'enter-outline' as const, color: palette.electric },
  { number: 2, title: 'Deviz final', description: 'Diagnostic, piese, manoperă și acord final', icon: 'receipt-outline' as const, color: palette.purple },
  { number: 3, title: 'Fișa de ieșire', description: 'Finalizare, stare produs și predare', icon: 'exit-outline' as const, color: palette.success },
];

export function ServiceDocumentTimeline({ activeStep = 1 }: { activeStep?: 1 | 2 | 3 }) {
  const { colors } = useAppTheme();
  return <View style={[styles.timeline, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.titleRow}><Ionicons name="git-commit-outline" size={20} color={colors.primary} /><View style={styles.copy}><AppText variant="heading">Parcursul documentelor</AppText><AppText variant="caption" muted>Fiecare câmp este grupat după documentul în care va apărea.</AppText></View></View>
    <View style={styles.steps}>
      {steps.map((step, index) => {
        const active = step.number === activeStep;
        const available = step.number <= activeStep;
        return <View key={step.number} style={styles.stepWrap}>
          <View style={[styles.step, { borderColor: active ? step.color : colors.border, backgroundColor: active ? `${step.color}10` : colors.surfaceMuted, opacity: available || active ? 1 : 0.72 }]}>
            <View style={[styles.stepIcon, { backgroundColor: active ? step.color : colors.surface }]}><Ionicons name={step.icon} size={20} color={active ? '#FFFFFF' : step.color} /></View>
            <View style={styles.copy}><AppText variant="caption" style={{ color: step.color, fontWeight: '900' }}>ETAPA {step.number}{active ? ' · COMPLETEZI ACUM' : ''}</AppText><AppText variant="label">{step.title}</AppText><AppText variant="caption" muted>{step.description}</AppText></View>
          </View>
          {index < steps.length - 1 ? <View style={[styles.connector, { backgroundColor: colors.border }]} /> : null}
        </View>;
      })}
    </View>
  </View>;
}

export function DocumentStageHeader({ step, title, description }: { step: 1 | 2 | 3; title: string; description: string }) {
  const { colors } = useAppTheme();
  const definition = steps[step - 1];
  return <View style={styles.titleRow}>
    <View style={[styles.stageNumber, { backgroundColor: definition.color }]}><AppText variant="label" style={styles.stageNumberText}>{step}</AppText></View>
    <View style={styles.copy}><View style={styles.stageTitleLine}><AppText variant="heading">{title}</AppText><View style={[styles.documentBadge, { backgroundColor: `${definition.color}14` }]}><AppText variant="caption" style={{ color: definition.color, fontWeight: '900' }}>{definition.title}</AppText></View></View><AppText variant="caption" muted>{description}</AppText></View>
    <Ionicons name={definition.icon} size={21} color={definition.color || colors.primary} />
  </View>;
}

const styles = StyleSheet.create({
  timeline: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  steps: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: spacing.sm },
  stepWrap: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexBasis: 260 },
  step: { minHeight: 92, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  connector: { width: 18, height: 2, marginHorizontal: spacing.xs },
  stepIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  stageNumber: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stageNumberText: { color: '#FFFFFF', fontWeight: '900' },
  stageTitleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  documentBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
});
