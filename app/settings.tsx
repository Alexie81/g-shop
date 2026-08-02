import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useBackToAdministration } from '@/hooks/useBackToAdministration';
import { propertyRepository } from '@/repositories/api-repositories';
import { API_URL } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

export default function SettingsScreen() {
  useBackToAdministration();
  const { user, changePassword } = useAuth();
  const { activeProperty, reload: reloadProperties } = useProperty();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const { showToast } = useToast();
  const [propertyName, setPropertyName] = useState(activeProperty?.name ?? '');
  const [propertyLoading, setPropertyLoading] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => setPropertyName(activeProperty?.name ?? ''), [activeProperty?.id, activeProperty?.name]);

  const savePropertyName = async () => {
    const name = propertyName.trim();
    if (!activeProperty || name.length < 2) return showToast('Numele proprietății trebuie să aibă minimum 2 caractere.', 'error');
    setPropertyLoading(true);
    try {
      await propertyRepository.updateName(activeProperty.id, name);
      await reloadProperties();
      showToast('Numele proprietății a fost actualizat.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Numele proprietății nu a putut fi salvat.', 'error');
    } finally { setPropertyLoading(false); }
  };

  const submitPassword = async () => {
    if (next.length < 8 || next !== confirm) return showToast('Parola nouă trebuie să aibă minimum 8 caractere, iar confirmarea să coincidă.', 'error');
    setLoading(true);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      showToast('Parola contului a fost schimbată.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Parola nu a putut fi schimbată.', 'error');
    } finally { setLoading(false); }
  };

  return <Screen header={<AppHeader title="Setări" back onBack={() => router.replace('/service/more')} />}><View style={styles.settingsStack}>
    {user?.role === 'ADMIN' && activeProperty ? <Card style={[styles.section, styles.identityCard]} elevated>
      <View style={styles.sectionHeader}>
        <View style={[styles.propertyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="business-outline" size={23} color={colors.primary} /></View>
        <View style={styles.sectionCopy}><View style={styles.identityTitleRow}><AppText variant="heading">Identitatea proprietății</AppText><View style={[styles.activeBadge, { backgroundColor: colors.primarySoft }]}><View style={[styles.activeDot, { backgroundColor: colors.primary }]} /><AppText variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>ACTIVĂ</AppText></View></View><AppText variant="caption" muted>Controlează numele afișat în întreaga aplicație.</AppText></View>
      </View>
      <View style={[styles.identityFields, compact && styles.identityFieldsCompact]}>
        <View style={styles.nameField}><Input label="Numele afișat" icon="create-outline" value={propertyName} onChangeText={setPropertyName} maxLength={120} autoCapitalize="words" placeholder="Ex: Reparații Calculatoare București" /></View>
        <View style={[styles.domainBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><View style={[styles.domainIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="globe-outline" size={18} color={colors.primary} /></View><View style={styles.domainCopy}><AppText variant="caption" muted>Domeniu asociat</AppText><AppText variant="label" numberOfLines={1}>{activeProperty.domain}</AppText></View><Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} /></View>
      </View>
      <View style={[styles.identityFooter, compact && styles.identityFooterCompact]}><View style={styles.footerInfo}><Ionicons name="information-circle-outline" size={18} color={colors.textMuted} /><AppText variant="caption" muted style={styles.footerText}>Domeniul rămâne protejat; se modifică doar numele vizibil.</AppText></View><Button compact label="Salvează numele" icon="checkmark-circle-outline" loading={propertyLoading} disabled={propertyName.trim().length < 2} onPress={() => void savePropertyName()} style={styles.propertyButton} /></View>
    </Card> : null}

    <Card style={styles.section} elevated><View style={styles.sectionHeader}><View style={[styles.propertyIcon, { backgroundColor: `${palette.purple}16` }]}><Ionicons name="color-palette-outline" size={23} color={palette.purple} /></View><View style={styles.sectionCopy}><AppText variant="heading">Aspectul aplicației</AppText><AppText variant="caption" muted>Preferința este păstrată automat pe acest dispozitiv.</AppText></View></View><View style={[styles.themePanel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><ThemeToggle /></View></Card>

    <Card style={styles.section} elevated><View style={styles.sectionHeader}><View style={[styles.propertyIcon, { backgroundColor: `${palette.warning}16` }]}><Ionicons name="shield-checkmark-outline" size={23} color={palette.warning} /></View><View style={styles.sectionCopy}><AppText variant="heading">Securitatea contului</AppText><AppText variant="caption" muted>Schimbă parola utilizatorului conectat.</AppText></View></View><View style={[styles.passwordFields, compact && styles.passwordFieldsCompact]}><View style={styles.passwordField}><Input label="Parola curentă" secureTextEntry value={current} onChangeText={setCurrent} /></View><View style={styles.passwordField}><Input label="Parola nouă" secureTextEntry value={next} onChangeText={setNext} /></View><View style={styles.passwordField}><Input label="Confirmă parola" secureTextEntry value={confirm} onChangeText={setConfirm} /></View></View><View style={[styles.passwordFooter, compact && styles.identityFooterCompact]}><View style={styles.footerInfo}><Ionicons name="lock-closed-outline" size={17} color={colors.textMuted} /><AppText variant="caption" muted style={styles.footerText}>Folosește minimum 8 caractere și o parolă unică.</AppText></View><Button compact label="Actualizează parola" icon="key-outline" loading={loading} disabled={!current || !next || !confirm} onPress={() => void submitPassword()} style={styles.propertyButton} /></View></Card>

    <Card style={styles.section} elevated><View style={styles.sectionHeader}><View style={[styles.propertyIcon, { backgroundColor: `${palette.success}16` }]}><Ionicons name="cloud-done-outline" size={24} color={palette.success} /></View><View style={styles.sectionCopy}><View style={styles.identityTitleRow}><AppText variant="heading">Conexiune online</AppText><View style={[styles.onlineBadge, { backgroundColor: `${palette.success}16` }]}><View style={styles.onlineDot} /><AppText variant="caption" style={styles.onlineText}>ACTIVĂ</AppText></View></View><AppText variant="caption" muted>Baza MySQL online este accesată exclusiv prin conexiunea securizată.</AppText></View></View><View style={[styles.apiBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><View style={[styles.domainIcon, { backgroundColor: `${palette.success}16` }]}><Ionicons name="link-outline" size={19} color={palette.success} /></View><View style={styles.domainCopy}><AppText variant="caption" muted>Endpoint API</AppText><AppText variant="label" numberOfLines={2}>{API_URL}</AppText></View><Ionicons name="shield-checkmark" size={20} color={palette.success} /></View></Card>
  </View></Screen>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.lg },
  settingsStack: { width: '100%', maxWidth: 860, alignSelf: 'center', gap: spacing.lg }, identityCard: { gap: spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  propertyIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { minWidth: 0, flex: 1, gap: 2 },
  identityTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }, activeBadge: { height: 25, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 }, activeDot: { width: 6, height: 6, borderRadius: 3 },
  identityFields: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }, identityFieldsCompact: { flexDirection: 'column', alignItems: 'stretch' }, nameField: { minWidth: 260, flex: 1.45 },
  domainBox: { minWidth: 260, minHeight: 54, flex: 1, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, domainIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  domainCopy: { minWidth: 0, flex: 1, gap: 2 },
  identityFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, identityFooterCompact: { alignItems: 'stretch', flexDirection: 'column' }, footerInfo: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, footerText: { flex: 1 }, propertyButton: { minWidth: 190 },
  themePanel: { minHeight: 64, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: 'flex-start', justifyContent: 'center' }, passwordFields: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, passwordFieldsCompact: { flexDirection: 'column', alignItems: 'stretch' }, passwordField: { minWidth: 210, flex: 1 }, passwordFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, onlineBadge: { height: 25, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 }, onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.success }, onlineText: { color: palette.success, fontWeight: '800' }, apiBox: { minHeight: 64, padding: spacing.sm, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
