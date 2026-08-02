import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

type Props = { visible: boolean; onClose: () => void; onSelect: (showCompanyDetails: boolean) => void };

export function ServiceSheetTypeModal({ visible, onClose, onSelect }: Props) {
  const { colors, isDark } = useAppTheme();
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={[styles.overlay, { backgroundColor: colors.overlay }]}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={styles.handle} />
        <View style={styles.header}><LinearGradient colors={['#0B56E8', '#087BFF']} style={styles.headerIcon}><Ionicons name="document-text-outline" size={25} color="#FFFFFF" /></LinearGradient><View style={styles.copy}><AppText variant="title">Selectează tipul fișei</AppText><AppText variant="caption" muted>Alegerea poate fi schimbată ulterior din editarea fișei.</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Închide" onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable></View>
        <View style={styles.options}>
          <TypeOption title="Cu datele firmei" description="Include date juridice, contact și ștampilă în document." icon="business-outline" badge="Recomandat" accent={colors.primary} background={isDark ? '#0A2450' : '#EFF6FF'} border={isDark ? '#1859B6' : '#B8D5FF'} onPress={() => onSelect(true)} />
          <TypeOption title="Fără datele firmei" description="Generează o fișă simplă, fără identitatea juridică a firmei." icon="document-outline" accent={palette.purple} background={isDark ? '#231640' : '#F7F2FF'} border={isDark ? '#53328B' : '#DDCBFF'} onPress={() => onSelect(false)} />
        </View>
      </View>
    </View>
  </Modal>;
}

function TypeOption({ title, description, icon, badge, accent, background, border, onPress }: { title: string; description: string; icon: keyof typeof Ionicons.glyphMap; badge?: string; accent: string; background: string; border: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, { backgroundColor: background, borderColor: border, opacity: pressed ? 0.74 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}><View style={[styles.optionIcon, { backgroundColor: accent }]}><Ionicons name={icon} size={24} color="#FFFFFF" /></View><View style={styles.copy}><View style={styles.optionTitle}>{badge ? <View style={[styles.badge, { backgroundColor: `${accent}18` }]}><AppText variant="caption" style={{ color: accent, fontWeight: '900' }}>{badge}</AppText></View> : null}<AppText variant="heading">{title}</AppText></View><AppText variant="caption" muted>{description}</AppText></View><View style={[styles.arrow, { backgroundColor: accent }]}><Ionicons name="arrow-forward" size={18} color="#FFFFFF" /></View></Pressable>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 660, alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  handle: { width: 46, height: 5, borderRadius: 3, backgroundColor: '#AAB7CB', opacity: 0.48, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  copy: { minWidth: 0, flex: 1, gap: 4 },
  close: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  options: { gap: spacing.md },
  option: { minHeight: 104, borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  optionIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  badge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, minHeight: 24, alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
