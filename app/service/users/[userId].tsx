import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ModalSafeBottom } from '@/components/ui/ModalSafeBottom';
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
import { Permission, UserRole } from '@/types';
import { formatDate, initials } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';

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
const roles = Object.keys(ROLE_LABELS) as UserRole[];

export default function UserDetails() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { activeProperty, properties } = useProperty();
  const { user: currentUser } = useAuth();
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const state = useAsyncData(
    async () => (await userRepository.list(activeProperty?.id ?? '')).find((item) => item.id === userId) ?? Promise.reject(new Error('Utilizatorul nu există.')),
    [userId, activeProperty?.id],
  );
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [role, setRole] = useState<UserRole>('OPERATOR');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState<'role' | 'access' | 'permissions' | 'password' | ''>('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!state.data) return;
    setRole(state.data.role);
    setPermissions(state.data.permissions);
    setPropertyIds(state.data.propertyIds);
  }, [state.data]);

  const returnToUsers = () => router.replace('/service/users');
  if (state.loading) return <Screen header={<AppHeader title="Utilizator" back onBack={returnToUsers} />}><LoadingState /></Screen>;
  if (state.error || !state.data) return <Screen header={<AppHeader title="Utilizator" back onBack={returnToUsers} />}><ErrorState message={state.error?.message ?? 'Utilizator inexistent.'} /></Screen>;

  const target = state.data;
  const primaryAdmin = Boolean(target.isPrimaryAdmin);
  const protectedFromCurrent = primaryAdmin && target.id !== currentUser?.id;
  const globalAccess = primaryAdmin;
  const selectedPropertyCount = globalAccess ? properties.length : propertyIds.length;
  const selectedPermissionCount = globalAccess ? ALL_PERMISSIONS.length : permissions.length;
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
  const saveRole = async () => {
    if (role === target.role || primaryAdmin) return;
    setSaving('role');
    try {
      const updated = await userRepository.update(target.id, { role });
      state.setData(updated);
      showToast('Rolul utilizatorului a fost actualizat.', 'success');
    } catch (error) {
      setRole(target.role);
      showToast(error instanceof Error ? error.message : 'Rolul nu a putut fi actualizat.', 'error');
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
  const deleteUser = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await userRepository.remove(target.id);
      setDeleteOpen(false);
      showToast('Utilizatorul a fost șters.', 'success');
      router.replace('/service/users');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Utilizatorul nu a putut fi șters.', 'error');
    } finally { setDeleting(false); }
  };
  const changeAccountStatus = async () => {
    if (statusSaving) return;
    setStatusSaving(true);
    try {
      const updated = await userRepository.setActive(target.id, !target.isActive);
      state.setData(updated);
      setStatusOpen(false);
      showToast(updated.isActive ? 'Utilizatorul a fost reactivat.' : 'Utilizatorul a fost dezactivat.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Starea utilizatorului nu a putut fi schimbată.', 'error');
    } finally { setStatusSaving(false); }
  };

  return <>
    <Screen header={<AppHeader title="Editare utilizator" back onBack={returnToUsers} />} style={styles.page}>
      <LinearGradient colors={isDark ? ['#162B67', '#075CFF', '#5B31D4'] : ['#0A48CA', '#1478FF', '#7047E8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.profileHero}>
        <View pointerEvents="none" style={styles.heroGlow} />
        <View pointerEvents="none" style={styles.heroGlowSmall} />
        <View style={[styles.profileTop, compact && styles.profileTopCompact]}>
          <View style={styles.avatarRing}><View style={styles.avatar}><AppText variant="title" style={styles.avatarText}>{initials(target.firstName, target.lastName)}</AppText></View></View>
          <View style={styles.profileCopy}>
            <View style={styles.roleRow}><Ionicons name={globalAccess ? 'shield-checkmark' : 'person'} size={14} color="#DCE8FF" /><AppText variant="caption" style={styles.roleLabel}>{ROLE_LABELS[target.role].toUpperCase()}</AppText></View>
            <AppText variant="display" style={styles.profileName}>{target.firstName} {target.lastName}</AppText>
            <AppText style={styles.username}>@{target.username}</AppText>
          </View>
          <View style={[styles.heroStatus, { backgroundColor: target.isActive ? 'rgba(43,215,137,0.18)' : 'rgba(255,91,111,0.18)' }]}><View style={[styles.statusDot, { backgroundColor: target.isActive ? '#55E5A5' : '#FF788D' }]} /><AppText variant="label" style={{ color: target.isActive ? '#B9F8DA' : '#FFD2D9' }}>{target.isActive ? 'Activ' : 'Inactiv'}</AppText></View>
        </View>

        <View style={[styles.heroMetrics, compact && styles.heroMetricsCompact]}>
          <HeroMetric icon="business-outline" value={String(selectedPropertyCount)} label={selectedPropertyCount === 1 ? 'proprietate' : 'proprietăți'} />
          <View style={styles.heroDivider} />
          <HeroMetric icon="key-outline" value={String(selectedPermissionCount)} label="permisiuni" />
          <View style={styles.heroDivider} />
          <HeroMetric icon="time-outline" value={target.lastLoginAt ? formatDate(target.lastLoginAt, true) : 'Niciodată'} label="ultima autentificare" wide />
        </View>

        {target.email || target.phone ? <View style={styles.contactRow}>
          {target.email ? <View style={styles.contactPill}><Ionicons name="mail-outline" size={15} color="#E6EEFF" /><AppText variant="caption" style={styles.contactText} numberOfLines={1}>{target.email}</AppText></View> : null}
          {target.phone ? <View style={styles.contactPill}><Ionicons name="call-outline" size={15} color="#E6EEFF" /><AppText variant="caption" style={styles.contactText}>{target.phone}</AppText></View> : null}
        </View> : null}
      </LinearGradient>

      <Card style={styles.section} elevated>
        <SectionHeading icon="ribbon-outline" color={palette.electric} title="Rolul utilizatorului" description="Rolul stabilește nivelul general de acces. Permisiunile individuale rămân configurabile separat." />
        <View style={styles.roleGrid}>
          {roles.map((item) => {
            const selected = role === item;
            return <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              disabled={primaryAdmin}
              onPress={() => setRole(item)}
              style={({ pressed }) => [styles.roleOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface, opacity: pressed ? 0.78 : 1 }]}
            >
              <View style={[styles.roleOptionIcon, { backgroundColor: selected ? colors.primary : colors.surfaceMuted }]}><Ionicons name={item === 'ADMIN' ? 'shield-checkmark-outline' : item === 'TECHNICIAN' ? 'construct-outline' : item === 'COLLABORATOR' ? 'people-outline' : 'person-outline'} size={21} color={selected ? '#fff' : colors.textMuted} /></View>
              <View style={styles.roleOptionCopy}><AppText variant="label">{ROLE_LABELS[item]}</AppText><AppText variant="caption" muted>{item === 'ADMIN' ? 'Acces administrativ configurabil' : item === 'MANAGER' ? 'Coordonare și rapoarte' : item === 'OPERATOR' ? 'Clienți și fișe' : item === 'TECHNICIAN' ? 'Lucrări și semnături' : 'Acces de colaborator'}</AppText></View>
              <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.primary : colors.border} />
            </Pressable>;
          })}
        </View>
        {primaryAdmin ? <View style={[styles.notice, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}30` }]}><View style={[styles.noticeIcon, { backgroundColor: colors.primary }]}><Ionicons name="lock-closed-outline" size={20} color="#fff" /></View><AppText variant="caption" style={styles.noticeCopy}>Rolul Administratorului principal este protejat și nu poate fi schimbat.</AppText></View> : null}
        <View style={styles.sectionAction}><Button label={primaryAdmin ? 'Rol protejat' : role === target.role ? 'Rol salvat' : 'Salvează rolul'} icon={primaryAdmin ? 'lock-closed-outline' : 'ribbon-outline'} loading={saving === 'role'} disabled={primaryAdmin || role === target.role || Boolean(saving && saving !== 'role')} onPress={() => void saveRole()} /></View>
      </Card>

      <Card style={styles.section} elevated>
        <SectionHeading icon="business-outline" color={palette.electric} title="Acces la proprietăți" description="Alege spațiile de lucru și datele pe care le poate deschide." />
        {globalAccess ? <View style={[styles.notice, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}30` }]}><View style={[styles.noticeIcon, { backgroundColor: colors.primary }]}><Ionicons name="shield-checkmark-outline" size={20} color="#fff" /></View><AppText variant="caption" style={styles.noticeCopy}>Administratorul are acces global la toate proprietățile. Pentru acces limitat, folosește un alt rol.</AppText></View> : null}
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
              <View style={[styles.propertyIcon, { backgroundColor: enabled ? colors.primary : colors.surfaceMuted }]}><Ionicons name={property.type === 'SERVICE' ? 'construct-outline' : 'storefront-outline'} size={21} color={enabled ? '#fff' : colors.textMuted} /></View>
              <View style={styles.propertyCopy}><AppText variant="label" numberOfLines={2}>{property.name}</AppText><AppText variant="caption" muted>{property.type === 'SERVICE' ? 'Service' : 'Magazin'} · {enabled ? 'Acces permis' : 'Fără acces'}</AppText></View>
              <Switch pointerEvents="none" value={enabled} disabled={globalAccess} trackColor={{ false: colors.border, true: colors.primary }} />
            </Pressable>;
          })}
        </View>
        {!globalAccess && !propertyIds.length ? <View style={[styles.notice, { backgroundColor: isDark ? '#39270C' : palette.warningSoft, borderColor: `${palette.warning}35` }]}><View style={[styles.noticeIcon, { backgroundColor: palette.warning }]}><Ionicons name="warning-outline" size={20} color="#fff" /></View><AppText variant="caption" style={styles.noticeCopy}>Fără o proprietate selectată, utilizatorul se poate autentifica, dar nu poate deschide datele aplicației.</AppText></View> : null}
        <View style={styles.sectionAction}><Button label={primaryAdmin ? 'Acces protejat' : 'Salvează accesul'} icon={primaryAdmin ? 'lock-closed-outline' : 'business-outline'} loading={saving === 'access'} disabled={primaryAdmin || globalAccess || Boolean(saving && saving !== 'access')} onPress={() => void saveAccess('access')} /></View>
      </Card>

      <Card style={styles.section} elevated>
        <SectionHeading icon="options-outline" color={palette.purple} title="Permisiuni personalizate" description="Controlează clar ce poate vedea și modifica utilizatorul." />
        <View style={[styles.permissionSummary, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><View><AppText variant="heading">{selectedPermissionCount} din {ALL_PERMISSIONS.length}</AppText><AppText variant="caption" muted>permisiuni active</AppText></View><View style={[styles.permissionProgress, { backgroundColor: colors.border }]}><View style={[styles.permissionProgressFill, { width: `${Math.round(selectedPermissionCount / ALL_PERMISSIONS.length * 100)}%`, backgroundColor: palette.purple }]} /></View></View>
        <View style={styles.permissionGrid}>{ALL_PERMISSIONS.map((permission) => {
          const enabled = globalAccess || permissions.includes(permission);
          return <Pressable key={permission} disabled={globalAccess} onPress={() => togglePermission(permission)} style={({ pressed }) => [styles.permission, { borderColor: enabled ? `${palette.purple}70` : colors.border, backgroundColor: enabled ? (isDark ? '#251A48' : '#F4EFFF') : colors.surface, opacity: pressed ? 0.78 : 1 }]}>
            <View style={[styles.permissionCheck, { backgroundColor: enabled ? palette.purple : colors.surfaceMuted }]}><Ionicons name={enabled ? 'checkmark' : 'remove'} size={16} color={enabled ? '#fff' : colors.textMuted} /></View>
            <View style={styles.permissionCopy}><AppText variant="label">{permissionLabels[permission]}</AppText><AppText variant="caption" muted>{permission}</AppText></View>
            <Switch pointerEvents="none" value={enabled} disabled={globalAccess} trackColor={{ false: colors.border, true: palette.purple }} />
          </Pressable>;
        })}</View>
        {primaryAdmin ? <View style={[styles.notice, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}30` }]}><Ionicons name="lock-closed-outline" size={20} color={colors.primary} /><AppText variant="caption" style={styles.noticeCopy}>Administratorul principal are permanent toate cele 21 de permisiuni. Acestea nu pot fi retrase nici din propriul cont.</AppText></View> : null}
        <View style={styles.sectionAction}><Button label={primaryAdmin ? 'Permisiuni protejate' : 'Salvează permisiunile'} icon={primaryAdmin ? 'lock-closed-outline' : 'shield-checkmark-outline'} loading={saving === 'permissions'} disabled={primaryAdmin || globalAccess || Boolean(saving && saving !== 'permissions')} onPress={() => void saveAccess('permissions')} /></View>
      </Card>

      <Card style={styles.section} elevated>
        <SectionHeading icon="key-outline" color={palette.cyan} title="Parolă nouă" description="Schimbarea parolei închide sesiunile vechi ale utilizatorului." />
        <View style={[styles.passwordPanel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Input label="Parolă nouă" secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} />
          <AppText variant="caption" muted>Folosește minimum 8 caractere. Recomandat: litere mari și mici, cifre și un simbol.</AppText>
        </View>
        {protectedFromCurrent ? <View style={[styles.notice, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}30` }]}><Ionicons name="lock-closed-outline" size={20} color={colors.primary} /><AppText variant="caption" style={styles.noticeCopy}>Doar Administratorul principal își poate schimba propria parolă.</AppText></View> : null}
        <View style={styles.sectionAction}><Button variant="outline" label={protectedFromCurrent ? 'Parolă protejată' : 'Actualizează parola'} icon={protectedFromCurrent ? 'lock-closed-outline' : 'key-outline'} loading={saving === 'password'} disabled={protectedFromCurrent || Boolean(saving && saving !== 'password')} onPress={() => void resetPassword()} /></View>
      </Card>

      <Card style={[styles.section, styles.statusSection, { backgroundColor: target.isActive ? (isDark ? '#2F240E' : '#FFFBF1') : (isDark ? '#102B23' : '#F2FCF8'), borderColor: target.isActive ? `${palette.warning}45` : `${palette.success}45` }]}>
        <SectionHeading icon={target.isActive ? 'pause-circle-outline' : 'play-circle-outline'} color={target.isActive ? palette.warning : palette.success} title={target.isActive ? 'Dezactivare temporară' : 'Reactivare utilizator'} description={target.isActive ? 'Blochează autentificarea, dar păstrează utilizatorul, rolul și accesul pentru reactivare.' : 'Redă utilizatorului accesul cu rolul și permisiunile păstrate.'} />
        {primaryAdmin ? <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: `${colors.primary}30` }]}><Ionicons name="lock-closed-outline" size={20} color={colors.primary} /><AppText variant="caption" style={styles.noticeCopy}>Administratorul principal nu poate fi dezactivat.</AppText></View> : target.id !== currentUser?.id ? <View style={styles.sectionAction}><Button variant={target.isActive ? 'outline' : 'primary'} label={target.isActive ? 'Dezactivează utilizatorul' : 'Reactivează utilizatorul'} icon={target.isActive ? 'pause-circle-outline' : 'play-circle-outline'} onPress={() => setStatusOpen(true)} /></View> : <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: `${palette.warning}30` }]}><Ionicons name="shield-outline" size={20} color={palette.warning} /><AppText variant="caption" style={styles.noticeCopy}>Nu îți poți dezactiva propriul cont cât timp ești autentificat cu el.</AppText></View>}
      </Card>

      <Card style={[styles.section, styles.dangerSection, { backgroundColor: isDark ? '#29131B' : '#FFF7F8', borderColor: `${palette.danger}45` }]}>
        <SectionHeading icon="trash-outline" color={palette.danger} title="Ștergere utilizator" description="Elimină accesul contului, păstrând istoricul necesar pentru audit." />
        {primaryAdmin ? <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: `${colors.primary}30` }]}><Ionicons name="lock-closed-outline" size={20} color={colors.primary} /><AppText variant="caption" style={styles.noticeCopy}>Administratorul principal este permanent și nu poate fi șters.</AppText></View> : target.id !== currentUser?.id ? <View style={styles.sectionAction}><Button variant="danger" label="Șterge utilizatorul" icon="trash-outline" onPress={() => setDeleteOpen(true)} /></View> : <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: `${palette.danger}30` }]}><Ionicons name="shield-outline" size={20} color={palette.danger} /><AppText variant="caption" style={styles.noticeCopy}>Nu îți poți șterge propriul cont cât timp ești autentificat cu el.</AppText></View>}
      </Card>
    </Screen>

    <Modal visible={statusOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !statusSaving && setStatusOpen(false)}>
      <ModalSafeBottom style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} disabled={statusSaving} onPress={() => setStatusOpen(false)} />
        <View style={[styles.deleteModal, compact && styles.deleteModalCompact, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <View style={styles.deleteHeader}><View style={[styles.deleteIcon, { backgroundColor: target.isActive ? (isDark ? '#4A340B' : palette.warningSoft) : (isDark ? '#0B4934' : palette.successSoft) }]}><Ionicons name={target.isActive ? 'pause-circle-outline' : 'play-circle-outline'} size={29} color={target.isActive ? palette.warning : palette.success} /></View><View style={styles.deleteCopy}><AppText variant="title">{target.isActive ? 'Dezactivezi utilizatorul?' : 'Reactivezi utilizatorul?'}</AppText><AppText variant="caption" muted>{target.firstName} {target.lastName} · @{target.username}</AppText></View><Pressable accessibilityLabel="Închide" disabled={statusSaving} onPress={() => setStatusOpen(false)} style={[styles.modalClose, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable></View>
          <View style={[styles.deleteWarning, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><Ionicons name="information-circle-outline" size={21} color={target.isActive ? palette.warning : palette.success} /><AppText style={styles.noticeCopy}>{target.isActive ? 'Sesiunile curente vor fi închise și autentificarea va fi blocată. Contul rămâne în lista Utilizatori și poate fi reactivat oricând.' : 'Utilizatorul va putea să se autentifice din nou, cu același rol, aceleași proprietăți și aceleași permisiuni.'}</AppText></View>
          <View style={[styles.modalActions, compact && styles.modalActionsCompact]}><Button variant="outline" label="Anulează" disabled={statusSaving} onPress={() => setStatusOpen(false)} style={[styles.modalButton, compact && styles.modalButtonCompact]} /><Button label={target.isActive ? 'Dezactivează' : 'Reactivează'} icon={target.isActive ? 'pause-circle-outline' : 'play-circle-outline'} loading={statusSaving} onPress={() => void changeAccountStatus()} style={[styles.modalButton, compact && styles.modalButtonCompact]} /></View>
        </View>
      </ModalSafeBottom>
    </Modal>

    <Modal visible={deleteOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !deleting && setDeleteOpen(false)}>
      <ModalSafeBottom style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} disabled={deleting} onPress={() => setDeleteOpen(false)} />
        <View style={[styles.deleteModal, compact && styles.deleteModalCompact, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <View style={styles.deleteHeader}><View style={[styles.deleteIcon, { backgroundColor: isDark ? '#551D2A' : palette.dangerSoft }]}><Ionicons name="trash-outline" size={29} color={palette.danger} /></View><View style={styles.deleteCopy}><AppText variant="title">Ștergi utilizatorul?</AppText><AppText variant="caption" muted>{target.firstName} {target.lastName} · @{target.username}</AppText></View><Pressable accessibilityLabel="Închide" disabled={deleting} onPress={() => setDeleteOpen(false)} style={[styles.modalClose, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable></View>
          <View style={[styles.deleteWarning, { backgroundColor: isDark ? '#331922' : '#FFF2F4', borderColor: `${palette.danger}35` }]}><Ionicons name="alert-circle-outline" size={21} color={palette.danger} /><AppText style={styles.noticeCopy}>Contul va dispărea din aplicație, toate sesiunile vor fi închise și autentificarea va fi blocată. Istoricul acțiunilor rămâne în jurnalul de audit.</AppText></View>
          <View style={[styles.modalActions, compact && styles.modalActionsCompact]}><Button variant="outline" label="Anulează" disabled={deleting} onPress={() => setDeleteOpen(false)} style={[styles.modalButton, compact && styles.modalButtonCompact]} /><Button variant="danger" label="Șterge definitiv" icon="trash-outline" loading={deleting} onPress={() => void deleteUser()} style={[styles.modalButton, compact && styles.modalButtonCompact]} /></View>
        </View>
      </ModalSafeBottom>
    </Modal>
  </>;
}

function HeroMetric({ icon, value, label, wide = false }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; wide?: boolean }) {
  return <View style={[styles.heroMetric, wide && styles.heroMetricWide]}><Ionicons name={icon} size={18} color="#DCE8FF" /><View style={styles.heroMetricCopy}><AppText variant="label" style={styles.heroMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{value}</AppText><AppText variant="caption" style={styles.heroMetricLabel}>{label}</AppText></View></View>;
}

function SectionHeading({ icon, color, title, description }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; description: string }) {
  const { isDark } = useAppTheme();
  return <View style={styles.sectionHeading}><View style={[styles.sectionIcon, { backgroundColor: isDark ? `${color}22` : `${color}12` }]}><Ionicons name={icon} size={23} color={color} /></View><View style={styles.sectionCopy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>{description}</AppText></View></View>;
}

const styles = StyleSheet.create({
  page: { gap: spacing.xxl, paddingBottom: 128 },
  profileHero: { borderRadius: 30, padding: spacing.xxl, gap: spacing.xl, overflow: 'hidden', shadowColor: '#071C52', shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 9 },
  heroGlow: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -185, right: -60, backgroundColor: 'rgba(255,255,255,0.12)' },
  heroGlowSmall: { position: 'absolute', width: 160, height: 160, borderRadius: 80, bottom: -105, left: '38%', backgroundColor: 'rgba(255,255,255,0.08)' },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  profileTopCompact: { alignItems: 'flex-start', flexWrap: 'wrap' },
  avatarRing: { width: 82, height: 82, borderRadius: 28, padding: 4, backgroundColor: 'rgba(255,255,255,0.22)' },
  avatar: { flex: 1, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900' },
  profileCopy: { minWidth: 0, flex: 1, gap: 3 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roleLabel: { color: '#DCE8FF', fontWeight: '900', letterSpacing: 1.1 },
  profileName: { color: '#fff' },
  username: { color: '#DCE8FF', fontWeight: '700' },
  heroStatus: { minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  heroMetrics: { minHeight: 76, padding: spacing.md, borderRadius: radius.lg, backgroundColor: 'rgba(2,20,64,0.20)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroMetricsCompact: { flexWrap: 'wrap' },
  heroMetric: { minWidth: 105, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroMetricWide: { minWidth: 190, flexGrow: 1.5 },
  heroMetricCopy: { minWidth: 0, flex: 1 },
  heroMetricValue: { color: '#fff', fontWeight: '900' },
  heroMetricLabel: { color: '#C8D9FF' },
  heroDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.18)' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  contactPill: { minHeight: 34, maxWidth: '100%', paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  contactText: { color: '#E6EEFF', minWidth: 0 },
  section: { gap: spacing.xl, padding: spacing.xl },
  statusSection: { borderWidth: 1.5 },
  dangerSection: { borderWidth: 1.5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { minWidth: 0, flex: 1, gap: 3 },
  sectionAction: { alignItems: 'stretch', paddingTop: spacing.xs },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  roleOption: { minWidth: 230, minHeight: 82, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md },
  roleOptionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  roleOptionCopy: { minWidth: 0, flex: 1, gap: 3 },
  propertyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  propertyAccess: { minWidth: 270, minHeight: 88, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.lg },
  propertyIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  propertyCopy: { minWidth: 0, flex: 1, gap: 3 },
  notice: { minHeight: 66, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noticeIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  noticeCopy: { minWidth: 0, flex: 1, lineHeight: 21 },
  permissionSummary: { minHeight: 76, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  permissionProgress: { height: 8, flex: 1, borderRadius: radius.pill, overflow: 'hidden' },
  permissionProgressFill: { height: '100%', borderRadius: radius.pill },
  permissionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  permission: { minWidth: 280, minHeight: 78, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.25, borderRadius: radius.lg, padding: spacing.md },
  permissionCheck: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  permissionCopy: { minWidth: 0, flex: 1, gap: 2 },
  passwordPanel: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalOverlay: { justifyContent: 'flex-end', paddingHorizontal: spacing.md },
  deleteModal: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 30, shadowOffset: { width: 0, height: -12 }, elevation: 20 },
  deleteModalCompact: { paddingHorizontal: spacing.lg },
  modalHandle: { width: 46, height: 5, borderRadius: radius.pill, alignSelf: 'center' },
  deleteHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  deleteIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  deleteCopy: { minWidth: 0, flex: 1, gap: 3 },
  modalClose: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deleteWarning: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalActionsCompact: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  modalButton: { minWidth: 0, flexGrow: 1, flexShrink: 1 },
  modalButtonCompact: { width: '100%', flexGrow: 0, flexShrink: 0 },
});
