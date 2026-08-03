import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
import { Screen } from '@/components/ui/Screen';
import { ROLE_LABELS } from '@/constants/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useBackToAdministration } from '@/hooks/useBackToAdministration';
import { palette, radius, spacing } from '@/theme/tokens';
import { initials } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ');

export default function ProfileScreen() {
  useBackToAdministration();
  const { user, logout, updateProfile } = useAuth();
  const { properties, activeProperty } = useProperty();
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [saving, setSaving] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string }>({});

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName);
    setLastName(user.lastName);
  }, [user]);

  const normalizedFirstName = normalizeName(firstName);
  const normalizedLastName = normalizeName(lastName);
  const changed = useMemo(
    () => Boolean(user) && (normalizedFirstName !== user?.firstName || normalizedLastName !== user?.lastName),
    [normalizedFirstName, normalizedLastName, user],
  );

  if (!user) return null;

  const saveName = async () => {
    const nextErrors = {
      firstName: normalizedFirstName ? undefined : 'Introdu prenumele afișat.',
      lastName: normalizedLastName ? undefined : 'Introdu numele afișat.',
    };
    setErrors(nextErrors);
    if (nextErrors.firstName || nextErrors.lastName) {
      showToast('Completează prenumele și numele.', 'error');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile(normalizedFirstName, normalizedLastName);
      setFirstName(updated.firstName);
      setLastName(updated.lastName);
      showToast('Numele afișat a fost actualizat.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Numele nu a putut fi actualizat.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = async () => {
    setLogoutLoading(true);
    try {
      await logout();
      setLogoutOpen(false);
      router.replace('/(auth)/login');
    } finally {
      setLogoutLoading(false);
    }
  };

  return <>
    <Screen header={<AppHeader title="Profil" back onBack={() => router.replace('/service/more')} />}>
      <View style={styles.stack}>
        <LinearGradient colors={isDark ? ['#092668', '#075CFF'] : ['#123DAB', '#0875FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View pointerEvents="none" style={styles.heroOrbLarge} />
          <View pointerEvents="none" style={styles.heroOrbSmall} />
          <View style={[styles.heroContent, compact && styles.heroContentCompact]}>
            <View style={styles.avatarShell}>
              <AppText variant="display" style={styles.avatarText}>{initials(user.firstName, user.lastName)}</AppText>
              <View style={styles.onlineIndicator} />
            </View>
            <View style={styles.heroCopy}>
              <View style={styles.heroTitleRow}>
                <AppText variant="title" style={styles.heroTitle}>{user.firstName} {user.lastName}</AppText>
                <View style={styles.roleBadge}><Ionicons name="shield-checkmark" size={14} color="#FFFFFF" /><AppText variant="caption" style={styles.roleText}>{ROLE_LABELS[user.role]}</AppText></View>
              </View>
              <AppText style={styles.heroUsername}>@{user.username}</AppText>
              <AppText variant="caption" style={styles.heroEmail}>{user.email || 'Cont G-Shop securizat'}</AppText>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}><Ionicons name="business-outline" size={18} color="#FFFFFF" /><View><AppText variant="label" style={styles.heroStatValue}>{properties.length}</AppText><AppText variant="caption" style={styles.heroStatLabel}>proprietăți</AppText></View></View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}><Ionicons name="key-outline" size={18} color="#FFFFFF" /><View><AppText variant="label" style={styles.heroStatValue}>{user.permissions.length}</AppText><AppText variant="caption" style={styles.heroStatLabel}>permisiuni</AppText></View></View>
          </View>
        </LinearGradient>

        <Card style={styles.section} elevated>
          <SectionHeader icon="person-outline" color={colors.primary} background={colors.primarySoft} title="Identitatea contului" subtitle="Acest nume apare în dashboard și în istoricul activității." />
          <View style={[styles.formRow, compact && styles.formRowCompact]}>
            <View style={styles.field}><Input label="Prenume" icon="person-outline" value={firstName} onChangeText={(value) => { setFirstName(value); setErrors((current) => ({ ...current, firstName: undefined })); }} error={errors.firstName} autoCapitalize="words" maxLength={60} /></View>
            <View style={styles.field}><Input label="Nume" icon="person-outline" value={lastName} onChangeText={(value) => { setLastName(value); setErrors((current) => ({ ...current, lastName: undefined })); }} error={errors.lastName} autoCapitalize="words" maxLength={60} /></View>
          </View>
          <View style={[styles.sectionFooter, compact && styles.sectionFooterCompact]}>
            <View style={styles.infoLine}><Ionicons name="sparkles-outline" size={18} color={colors.primary} /><AppText variant="caption" muted style={styles.infoCopy}>Modificarea este vizibilă imediat în aplicație.</AppText></View>
            <Button compact label="Salvează numele" icon="checkmark-circle-outline" loading={saving} disabled={!changed} onPress={() => void saveName()} style={styles.actionButton} />
          </View>
        </Card>

        <Card style={styles.section} elevated>
          <SectionHeader icon="business-outline" color={palette.purple} background={`${palette.purple}16`} title="Proprietăți disponibile" subtitle="Spațiile de lucru la care are acces contul tău." />
          <View style={styles.propertyList}>{properties.map((property) => {
            const active = property.id === activeProperty?.id;
            return <View key={property.id} style={[styles.property, { backgroundColor: active ? colors.primarySoft : colors.surfaceMuted, borderColor: active ? `${colors.primary}55` : colors.border }]}>
              <View style={[styles.propertyIcon, { backgroundColor: active ? colors.primary : colors.surface }]}><Ionicons name={property.domain.includes('calculatoareprofesionale') ? 'storefront-outline' : 'construct-outline'} size={20} color={active ? '#FFFFFF' : colors.primary} /></View>
              <View style={styles.propertyCopy}><AppText variant="label" numberOfLines={1}>{property.name}</AppText><AppText variant="caption" muted numberOfLines={1}>{property.domain}</AppText></View>
              {active ? <View style={[styles.activeBadge, { backgroundColor: colors.surface }]}><View style={[styles.activeDot, { backgroundColor: palette.success }]} /><AppText variant="caption" style={{ color: palette.success, fontWeight: '800' }}>ACTIVĂ</AppText></View> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
            </View>;
          })}</View>
          <Button variant="outline" label="Schimbă proprietatea" icon="swap-horizontal-outline" onPress={() => router.push('/select-property?manual=1')} />
        </Card>

        <Card style={styles.section} elevated>
          <SectionHeader icon="shield-checkmark-outline" color={palette.success} background={`${palette.success}16`} title="Acces și securitate" subtitle="Rezumatul drepturilor active pentru acest cont." />
          <View style={[styles.accessBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <View style={[styles.accessIcon, { backgroundColor: `${palette.success}16` }]}><Ionicons name="checkmark-done-outline" size={21} color={palette.success} /></View>
            <View style={styles.accessCopy}><AppText variant="label">{user.permissions.length} permisiuni active</AppText><AppText variant="caption" muted>Administratorul gestionează accesul din modulul Utilizatori.</AppText></View>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          </View>
          <Button variant="outline" label="Setări și securitate" icon="settings-outline" onPress={() => router.push('/settings')} />
        </Card>

        <Pressable accessibilityRole="button" accessibilityLabel="Deconectare" onPress={() => setLogoutOpen(true)} style={({ pressed }) => [styles.logoutCard, { backgroundColor: isDark ? '#25111A' : '#FFF5F6', borderColor: `${palette.danger}36`, opacity: pressed ? 0.76 : 1 }]}>
          <View style={[styles.logoutIcon, { backgroundColor: isDark ? '#401722' : palette.dangerSoft }]}><Ionicons name="log-out-outline" size={22} color={palette.danger} /></View>
          <View style={styles.logoutCopy}><AppText variant="label" style={{ color: palette.danger }}>Deconectare</AppText><AppText variant="caption" muted>Închide în siguranță sesiunea de pe acest dispozitiv.</AppText></View>
          <Ionicons name="chevron-forward" size={20} color={palette.danger} />
        </Pressable>
      </View>
    </Screen>

    <Modal visible={logoutOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !logoutLoading && setLogoutOpen(false)}>
      <ModalSafeBottom style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => !logoutLoading && setLogoutOpen(false)} />
        <View style={[styles.logoutModal, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={[styles.modalIcon, { backgroundColor: isDark ? '#401722' : palette.dangerSoft }]}><Ionicons name="log-out-outline" size={30} color={palette.danger} /></View>
          <View style={styles.modalCopy}><AppText variant="title" style={styles.modalTitle}>Te deconectezi?</AppText><AppText muted style={styles.modalMessage}>Sesiunea curentă va fi închisă. Datele tale rămân salvate și te poți autentifica din nou oricând.</AppText></View>
          <View style={[styles.modalActions, compact && styles.modalActionsCompact]}>
            <Button variant="outline" label="Rămân conectat" disabled={logoutLoading} onPress={() => setLogoutOpen(false)} style={styles.modalButton} />
            <Button variant="danger" label="Deconectare" icon="log-out-outline" loading={logoutLoading} onPress={() => void confirmLogout()} style={styles.modalButton} />
          </View>
        </View>
      </ModalSafeBottom>
    </Modal>
  </>;
}

function SectionHeader({ icon, color, background, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; color: string; background: string; title: string; subtitle: string }) {
  return <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: background }]}><Ionicons name={icon} size={22} color={color} /></View><View style={styles.sectionCopy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>{subtitle}</AppText></View></View>;
}

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 860, alignSelf: 'center', gap: spacing.lg },
  hero: { borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden', gap: spacing.xl, shadowColor: '#075CFF', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 5 },
  heroOrbLarge: { position: 'absolute', width: 190, height: 190, borderRadius: 95, right: -52, top: -82, backgroundColor: 'rgba(255,255,255,0.09)' },
  heroOrbSmall: { position: 'absolute', width: 82, height: 82, borderRadius: 41, right: 104, bottom: -46, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg }, heroContentCompact: { alignItems: 'flex-start' },
  avatarShell: { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 25 }, onlineIndicator: { position: 'absolute', width: 15, height: 15, borderRadius: 8, right: -3, bottom: -2, backgroundColor: '#33D26F', borderWidth: 3, borderColor: '#075CFF' },
  heroCopy: { minWidth: 0, flex: 1, gap: 3 }, heroTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }, heroTitle: { color: '#FFFFFF', flexShrink: 1 },
  roleBadge: { minHeight: 27, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)' }, roleText: { color: '#FFFFFF', fontWeight: '800' }, heroUsername: { color: '#D9E7FF', fontWeight: '700' }, heroEmail: { color: '#C3D8FF' },
  heroStats: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, paddingHorizontal: spacing.lg, backgroundColor: 'rgba(3,20,64,0.20)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }, heroStat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, heroDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.18)' }, heroStatValue: { color: '#FFFFFF' }, heroStatLabel: { color: '#C7DBFF' },
  section: { gap: spacing.lg }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, sectionIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, sectionCopy: { minWidth: 0, flex: 1, gap: 2 },
  formRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, formRowCompact: { flexDirection: 'column' }, field: { minWidth: 220, flex: 1, width: '100%' }, sectionFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, sectionFooterCompact: { flexDirection: 'column', alignItems: 'stretch' }, infoLine: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, infoCopy: { flex: 1 }, actionButton: { minWidth: 184 },
  propertyList: { gap: spacing.sm }, property: { minHeight: 68, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, propertyIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, propertyCopy: { minWidth: 0, flex: 1, gap: 2 }, activeBadge: { minHeight: 27, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 }, activeDot: { width: 6, height: 6, borderRadius: 3 },
  accessBox: { minHeight: 68, padding: spacing.sm, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, accessIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, accessCopy: { minWidth: 0, flex: 1, gap: 2 },
  logoutCard: { minHeight: 76, padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, logoutIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, logoutCopy: { minWidth: 0, flex: 1, gap: 2 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }, logoutModal: { width: '100%', maxWidth: 440, padding: spacing.xxl, borderRadius: radius.xl, borderWidth: 1, alignItems: 'center', gap: spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.24, shadowRadius: 32, elevation: 16 }, modalIcon: { width: 66, height: 66, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, modalCopy: { alignItems: 'center', gap: spacing.sm }, modalTitle: { textAlign: 'center' }, modalMessage: { textAlign: 'center', lineHeight: 22 }, modalActions: { width: '100%', flexDirection: 'row', gap: spacing.md }, modalActionsCompact: { flexDirection: 'column-reverse' }, modalButton: { minWidth: 150, flex: 1 },
});
