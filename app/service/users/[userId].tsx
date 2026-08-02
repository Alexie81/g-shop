import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { ALL_PERMISSIONS, ROLE_LABELS } from '@/constants/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { userRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { Permission } from '@/types';
import { initials } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

const permissionLabels: Record<Permission, string> = {
  'dashboard.view': 'Vezi dashboard',
  'clients.view': 'Vezi clienți',
  'clients.create': 'Adaugă clienți',
  'clients.update': 'Editează clienți',
  'clients.delete': 'Dezactivează clienți',
  'qr.generate': 'Generează QR',
  'qr.scan': 'Scanează QR',
  'qr.share': 'Trimite QR',
  'service_sheets.view': 'Vezi fișe service',
  'service_sheets.create': 'Creează fișe',
  'service_sheets.update': 'Modifică fișe',
  'service_sheets.sign': 'Înregistrează semnături',
  'collaborators.view': 'Vezi colaboratori',
  'collaborators.manage': 'Gestionează colaboratori',
  'users.view': 'Vezi utilizatori',
  'users.manage': 'Gestionează utilizatori',
  'roles.manage': 'Configurează roluri',
  'reports.view': 'Vezi rapoarte',
  'financials.view': 'Vezi date financiare',
  'audit.view': 'Vezi jurnal audit',
  'settings.manage': 'Gestionează setări',
};

export default function UserDetails() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { activeProperty, properties } = useProperty();
  const { user: currentUser } = useAuth();
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const state = useAsyncData(
    async () => (await userRepository.list(activeProperty?.id ?? '')).find((item) => item.id === userId) ?? Promise.reject(new Error('Utilizatorul nu există.')),
    [userId, activeProperty?.id],
  );
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState<'access' | 'permissions' | 'password' | ''>('');

  useEffect(() => {
    if (!state.data) return;
    setPermissions(state.data.permissions);
    setPropertyIds(state.data.propertyIds);
  }, [state.data]);

  const returnToUsers = () => router.replace('/service/users');
  if (state.loading) return <Screen header={<AppHeader title="Utilizator" back onBack={returnToUsers} />}><LoadingState /></Screen>;
  if (state.error || !state.data) return <Screen header={<AppHeader title="Utilizator" back onBack={returnToUsers} />}><ErrorState message={state.error?.message ?? 'Utilizator inexistent.'} /></Screen>;

  const target = state.data;
  const globalAccess = target.role === 'ADMIN';
  const togglePermission = (permission: Permission) => {
    if (globalAccess) return;
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  };
  const toggleProperty = (propertyId: string) => {
    if (globalAccess) return;
    setPropertyIds((current) => current.includes(propertyId) ? current.filter((id) => id !== propertyId) : [...current, propertyId]);
  };
  const saveAccess = async (source: 'access' | 'permissions') => {
    setSaving(source);
    try {
      const updated = await userRepository.updatePermissions(target.id, permissions, globalAccess ? target.propertyIds : propertyIds);
      state.setData(updated);
      showToast(source === 'access' ? 'Accesul la proprietăți a fost actualizat.' : 'Permisiunile au fost actualizate.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Salvarea a eșuat.', 'error');
    } finally { setSaving(''); }
  };
  const resetPassword = async () => {
    if (password.length < 8) return showToast('Parola trebuie să aibă minimum 8 caractere.', 'error');
    setSaving('password');
    try {
      await userRepository.resetPassword(target.id, password);
      setPassword('');
      showToast('Parola a fost schimbată.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Parola nu a putut fi schimbată.', 'error');
    } finally { setSaving(''); }
  };
  const remove = () => Alert.alert(
    'Ștergi utilizatorul?',
    'Contul va fi dezactivat și nu se va mai putea autentifica. Istoricul lui rămâne păstrat.',
    [
      { text: 'Anulează', style: 'cancel' },
      { text: 'Dezactivează', style: 'destructive', onPress: async () => {
        try {
          await userRepository.remove(target.id);
          showToast('Utilizatorul a fost dezactivat.', 'success');
          router.replace('/service/users');
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'Acțiunea a eșuat.', 'error');
        }
      } },
    ],
  );

  const selectedPropertyCount = globalAccess ? properties.length : propertyIds.length;
  return <Screen header={<AppHeader title="Utilizator" back onBack={returnToUsers} />}>
    <Card style={styles.profile}>
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}><AppText variant="title" style={{ color: '#fff' }}>{initials(target.firstName, target.lastName)}</AppText></View>
      <View style={styles.profileCopy}><AppText variant="title">{target.firstName} {target.lastName}</AppText><AppText muted>@{target.username} · {ROLE_LABELS[target.role]}</AppText><AppText variant="caption" muted>{selectedPropertyCount} {selectedPropertyCount === 1 ? 'proprietate permisă' : 'proprietăți permise'}</AppText></View>
      <View style={[styles.active, { backgroundColor: target.isActive ? (isDark ? '#0B3520' : palette.successSoft) : (isDark ? '#351722' : palette.dangerSoft) }]}><AppText variant="label" style={{ color: target.isActive ? palette.success : palette.danger }}>{target.isActive ? 'Activ' : 'Inactiv'}</AppText></View>
    </Card>

    <Card style={styles.section}>
      <View style={styles.sectionHeading}><View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="business-outline" size={22} color={colors.primary} /></View><View style={styles.sectionCopy}><AppText variant="heading">Acces la proprietăți</AppText><AppText variant="caption" muted>Alege exact spațiile de lucru și datele pe care le poate vedea utilizatorul.</AppText></View></View>
      {globalAccess ? <View style={[styles.adminNotice, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="shield-checkmark-outline" size={21} color={colors.primary} /><AppText variant="caption" style={styles.noticeCopy}>Rolul Administrator are acces global la toate proprietățile. Pentru acces limitat, folosește un alt rol.</AppText></View> : null}
      <View style={styles.propertyGrid}>
        {properties.map((property) => {
          const enabled = globalAccess || propertyIds.includes(property.id);
          return <Pressable
            key={property.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: enabled, disabled: globalAccess }}
            disabled={globalAccess}
            onPress={() => toggleProperty(property.id)}
            style={({ pressed }) => [styles.propertyAccess, { borderColor: enabled ? colors.primary : colors.border, backgroundColor: enabled ? colors.primarySoft : colors.surface, opacity: pressed ? 0.78 : 1 }]}
          >
            <View style={[styles.propertyIcon, { backgroundColor: enabled ? colors.primary : colors.surfaceMuted }]}><Ionicons name={property.type === 'SERVICE' ? 'construct-outline' : 'storefront-outline'} size={20} color={enabled ? '#fff' : colors.textMuted} /></View>
            <View style={styles.propertyCopy}><AppText variant="label" numberOfLines={2}>{property.name}</AppText><AppText variant="caption" muted>{property.type === 'SERVICE' ? 'Service' : 'Magazin'} · {enabled ? 'Are acces' : 'Fără acces'}</AppText></View>
            <Switch pointerEvents="none" value={enabled} disabled={globalAccess} trackColor={{ false: colors.border, true: colors.primary }} />
          </Pressable>;
        })}
      </View>
      {!globalAccess && !propertyIds.length ? <View style={[styles.warning, { backgroundColor: isDark ? '#39270C' : palette.warningSoft }]}><Ionicons name="warning-outline" size={19} color={palette.warning} /><AppText variant="caption" style={styles.noticeCopy}>Fără nicio proprietate selectată, utilizatorul se poate autentifica, dar nu poate deschide datele aplicației.</AppText></View> : null}
      <Button label="Salvează accesul" icon="business-outline" loading={saving === 'access'} disabled={globalAccess || Boolean(saving && saving !== 'access')} onPress={() => void saveAccess('access')} />
    </Card>

    <Card style={styles.section}>
      <View style={styles.sectionHeading}><View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="options-outline" size={22} color={colors.primary} /></View><View style={styles.sectionCopy}><AppText variant="heading">Permisiuni personalizate</AppText><AppText variant="caption" muted>Acțiunile permise se aplică în toate proprietățile bifate mai sus.</AppText></View></View>
      <View style={styles.permissionGrid}>{ALL_PERMISSIONS.map((permission) => {
        const enabled = globalAccess || permissions.includes(permission);
        return <Pressable key={permission} disabled={globalAccess} onPress={() => togglePermission(permission)} style={[styles.permission, { borderColor: enabled ? colors.primary : colors.border, backgroundColor: enabled ? colors.primarySoft : colors.surface }]}>
          <View style={styles.permissionCopy}><AppText variant="label">{permissionLabels[permission]}</AppText><AppText variant="caption" muted>{permission}</AppText></View>
          <Switch pointerEvents="none" value={enabled} disabled={globalAccess} trackColor={{ false: colors.border, true: colors.primary }} />
        </Pressable>;
      })}</View>
      <Button label="Salvează permisiunile" icon="shield-checkmark-outline" loading={saving === 'permissions'} disabled={globalAccess || Boolean(saving && saving !== 'permissions')} onPress={() => void saveAccess('permissions')} />
    </Card>

    <Card style={styles.section}>
      <AppText variant="heading">Schimbă parola utilizatorului</AppText>
      <Input label="Parolă nouă" secureTextEntry value={password} onChangeText={setPassword} />
      <Button variant="outline" label="Actualizează parola" icon="key-outline" loading={saving === 'password'} disabled={Boolean(saving && saving !== 'password')} onPress={() => void resetPassword()} />
    </Card>
    {target.id !== currentUser?.id ? <Button variant="danger" label="Dezactivează utilizatorul" icon="person-remove-outline" onPress={remove} /> : <AppText variant="caption" muted style={styles.selfNote}>Nu îți poți dezactiva propriul cont.</AppText>}
  </Screen>;
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  avatar: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  profileCopy: { minWidth: 180, flex: 1 },
  active: { borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.md },
  section: { gap: spacing.lg },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { minWidth: 0, flex: 1 },
  propertyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  propertyAccess: { minWidth: 260, minHeight: 76, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md },
  propertyIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  propertyCopy: { minWidth: 0, flex: 1 },
  adminNotice: { minHeight: 56, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warning: { minHeight: 52, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noticeCopy: { minWidth: 0, flex: 1 },
  permissionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  permission: { minWidth: 260, minHeight: 68, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  permissionCopy: { minWidth: 0, flex: 1 },
  selfNote: { textAlign: 'center' },
});
