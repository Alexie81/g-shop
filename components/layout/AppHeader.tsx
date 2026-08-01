import { AppText } from '@/components/ui/AppText';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useProperty } from '@/contexts/PropertyContext';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

export function AppHeader({ title, showProperty = true, back = false }: { title?: string; showProperty?: boolean; back?: boolean }) {
  const { colors, isDark } = useAppTheme();
  const { properties, activeProperty, selectProperty } = useProperty();
  const [open, setOpen] = useState(false);
  const switchTo = async (id: string) => {
    const next = properties.find((item) => item.id === id);
    if (!next) return;
    await selectProperty(next);
    setOpen(false);
    router.replace(next.type === 'SERVICE' ? '/service/dashboard' : '/shop/home');
  };
  return <>
    <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.brandRow}>
        {back ? <Pressable hitSlop={10} onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={23} color={colors.text} /></Pressable> : null}
        <Pressable
          accessibilityRole={showProperty && activeProperty ? 'button' : undefined}
          accessibilityLabel={showProperty && activeProperty ? 'Schimbă proprietatea' : undefined}
          disabled={!showProperty || !activeProperty}
          hitSlop={6}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.brandButton, pressed && styles.brandPressed]}
        >
          {!back ? <LinearGradient colors={isDark ? ['#F5F9FF', '#CFE0FF'] : ['#FFFFFF', '#E7F0FF']} style={[styles.logoFrame, { borderColor: isDark ? 'rgba(255,255,255,0.62)' : 'rgba(7,92,255,0.16)', shadowColor: isDark ? '#2F79FF' : colors.shadow }]}><View style={styles.logoCrop}><Image source={require('@/logo/logo.png')} resizeMode="cover" style={styles.logo} /></View></LinearGradient> : null}
          <View style={styles.titleWrap}>
            <AppText variant="heading" numberOfLines={1}>{title ?? 'G-Shop'}</AppText>
            {showProperty && activeProperty ? <View style={styles.property}><AppText variant="caption" muted numberOfLines={1}>{activeProperty.name}</AppText><Ionicons name="chevron-down" size={14} color={colors.textMuted} /></View> : null}
          </View>
        </Pressable>
      </View>
      <ThemeToggle compact />
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <AppText variant="title">Schimbă proprietatea</AppText>
          <AppText muted>Alege workspace-ul în care vrei să lucrezi.</AppText>
          <View style={styles.list}>{properties.map((property) => <Pressable key={property.id} onPress={() => void switchTo(property.id)} style={[styles.propertyCard, { borderColor: property.id === activeProperty?.id ? colors.primary : colors.border, backgroundColor: property.id === activeProperty?.id ? colors.primarySoft : colors.surfaceMuted }]}><View style={[styles.propertyIcon, { backgroundColor: colors.primary }]}><Ionicons name={property.type === 'SERVICE' ? 'construct-outline' : 'storefront-outline'} size={20} color="#fff" /></View><View style={styles.propertyInfo}><AppText variant="label">{property.name}</AppText><AppText variant="caption" muted>{property.domain}</AppText></View>{property.id === activeProperty?.id ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}</Pressable>)}</View>
        </View>
      </Pressable>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  header: { minHeight: 68, paddingHorizontal: spacing.lg, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backButton: { width: 34, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  brandButton: { minWidth: 0, flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.md },
  brandPressed: { opacity: 0.68 },
  logoFrame: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowOpacity: 0.24, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  logoCrop: { width: 38, height: 38, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 38, height: 38, transform: [{ scale: 2.02 }] },
  titleWrap: { minWidth: 0, flex: 1 },
  property: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 250 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }, sheet: { width: '100%', maxWidth: 500, borderRadius: radius.xl, padding: spacing.xxl, gap: spacing.sm }, list: { gap: spacing.md, marginTop: spacing.lg },
  propertyCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, propertyIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, propertyInfo: { flex: 1 },
});
