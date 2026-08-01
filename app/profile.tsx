import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { ROLE_LABELS } from '@/constants/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { radius, spacing } from '@/theme/tokens';
import { initials } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ');

export default function ProfileScreen() {
  const { user, logout, updateProfile } = useAuth();
  const { properties, activeProperty } = useProperty();
  const { colors } = useAppTheme();
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [saving, setSaving] = useState(false);
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

  return <Screen header={<AppHeader title="Profil" back />}>
    <Card style={styles.profile}>
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <AppText variant="display" style={{ color: '#fff' }}>{initials(user.firstName, user.lastName)}</AppText>
      </View>
      <AppText variant="title">{user.firstName} {user.lastName}</AppText>
      <AppText muted>@{user.username} · {ROLE_LABELS[user.role]}</AppText>
      <AppText variant="caption" muted>{user.email}</AppText>
    </Card>

    <Card style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="person-outline" size={21} color={colors.primary} />
        </View>
        <View style={styles.sectionCopy}>
          <AppText variant="heading">Numele afișat</AppText>
          <AppText variant="caption" muted>Modifică numele contului tău fără să schimbi utilizatorul de autentificare.</AppText>
        </View>
      </View>
      <View style={styles.formRow}>
        <View style={styles.field}>
          <Input
            label="Prenume"
            icon="person-outline"
            value={firstName}
            onChangeText={(value) => { setFirstName(value); setErrors((current) => ({ ...current, firstName: undefined })); }}
            error={errors.firstName}
            autoCapitalize="words"
            maxLength={60}
          />
        </View>
        <View style={styles.field}>
          <Input
            label="Nume"
            icon="person-outline"
            value={lastName}
            onChangeText={(value) => { setLastName(value); setErrors((current) => ({ ...current, lastName: undefined })); }}
            error={errors.lastName}
            autoCapitalize="words"
            maxLength={60}
          />
        </View>
      </View>
      <View style={[styles.dashboardHint, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
        <AppText variant="caption" style={[styles.hintText, { color: colors.primary }]}>Prenumele apare imediat în salutul din dashboard.</AppText>
      </View>
      <Button
        label="Salvează numele"
        icon="checkmark-circle-outline"
        loading={saving}
        disabled={!changed}
        onPress={() => void saveName()}
      />
    </Card>

    <Card style={styles.section}>
      <AppText variant="heading">Proprietăți disponibile</AppText>
      {properties.map((property) => <View key={property.id} style={[styles.property, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <AppText variant="label">{property.name}</AppText>
          <AppText variant="caption" muted>{property.domain}</AppText>
        </View>
        {property.id === activeProperty?.id ? <AppText variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>ACTIVĂ</AppText> : null}
      </View>)}
      <Button variant="outline" label="Schimbă proprietatea" icon="swap-horizontal-outline" onPress={() => router.push('/select-property')} />
    </Card>

    <Card style={styles.section}>
      <AppText variant="heading">Acces</AppText>
      <AppText muted>{user.permissions.length} permisiuni active. Administratorul poate personaliza accesul din modulul Utilizatori.</AppText>
      <Button variant="outline" label="Setări și securitate" icon="settings-outline" onPress={() => router.push('/settings')} />
    </Card>

    <Button variant="danger" label="Deconectare" icon="log-out-outline" onPress={async () => { await logout(); router.replace('/(auth)/login'); }} />
  </Screen>;
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  section: { gap: spacing.lg },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { minWidth: 0, flex: 1, gap: 2 },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { minWidth: 220, flex: 1 },
  dashboardHint: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hintText: { flex: 1, fontWeight: '700' },
  property: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
