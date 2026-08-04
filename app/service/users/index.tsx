import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { ALL_PERMISSIONS, ROLE_LABELS } from '@/constants/permissions';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useBackToAdministration } from '@/hooks/useBackToAdministration';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { userRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { User } from '@/types';
import { formatDate, initials } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

type UserFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const avatarGradients: [string, string][] = [
  ['#075CFF', '#1045C8'],
  ['#8B42FF', '#6330D8'],
  ['#08B86E', '#078950'],
  ['#FFAD22', '#F27616'],
];

export default function UsersScreen() {
  useBackToAdministration();
  const { activeProperty } = useProperty();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 620;
  const propertyId = activeProperty?.id ?? '';
  const [heroHeight, setHeroHeight] = useState(176);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<UserFilter>('ALL');
  const state = useAsyncData(() => userRepository.list(propertyId), [propertyId]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  const users = useMemo(() => state.data ?? [], [state.data]);
  const activeCount = users.filter((user) => user.isActive).length;
  const administrators = users.filter((user) => user.role === 'ADMIN').length;
  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ro-RO');
    return users.filter((user) => {
      if (filter === 'ACTIVE' && !user.isActive) return false;
      if (filter === 'INACTIVE' && user.isActive) return false;
      if (!normalized) return true;
      return `${user.firstName} ${user.lastName} ${user.username} ${user.email} ${ROLE_LABELS[user.role]}`.toLocaleLowerCase('ro-RO').includes(normalized);
    });
  }, [filter, query, users]);

  return <Screen header={<AppHeader title="Utilizatori" back onBack={() => router.replace('/service/more')} />} scroll={false} bottomInset={false} style={styles.screen}>
    <View style={styles.root}>
      <LinearGradient
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          if (Math.abs(nextHeight - heroHeight) > 1) setHeroHeight(nextHeight);
        }}
        colors={isDark ? ['#08265C', '#075CFF'] : ['#10399B', '#1478FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, styles.fixedHero, mobile && styles.fixedHeroMobile]}
      >
        <View style={styles.heroGlow} />
        <View style={styles.heroGlowSmall} />
        <View style={styles.heroCopy}>
          <View style={styles.eyebrowRow}><Ionicons name="shield-checkmark-outline" size={15} color="#DDE9FF" /><AppText variant="caption" style={styles.eyebrow}>ECHIPĂ ȘI ACCES</AppText></View>
          <AppText variant="title" style={styles.heroTitle}>Utilizatori și permisiuni</AppText>
          <AppText style={styles.heroText} numberOfLines={2}>Controlează accesul echipei în {activeProperty?.name}.</AppText>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}><View style={[styles.heroDot, { backgroundColor: '#61E7A7' }]} /><AppText variant="caption" style={styles.heroStatText}>{activeCount} activi</AppText></View>
            <View style={styles.heroStat}><Ionicons name="key-outline" size={14} color="#DDE9FF" /><AppText variant="caption" style={styles.heroStatText}>{administrators} administratori</AppText></View>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Adaugă utilizator" onPress={() => router.push('/service/users/create')} style={({ pressed }) => [styles.addButton, mobile && styles.addButtonMobile, { opacity: pressed ? 0.78 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
          <Ionicons name="person-add-outline" size={21} color="#075CFF" />
          {!mobile ? <AppText variant="label" style={styles.addButtonLabel}>Utilizator nou</AppText> : null}
        </Pressable>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: heroHeight + spacing.xs }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.reload(true)} tintColor={colors.primary} />}
      >
        <View style={[styles.sheet, mobile && styles.sheetMobile, { backgroundColor: colors.background, shadowColor: colors.shadow }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

          <View style={styles.sectionHeading}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="people-outline" size={20} color={colors.primary} /></View>
            <View style={styles.sectionCopy}><AppText variant="title">Echipa ta</AppText><AppText variant="caption" muted>{filteredUsers.length} din {users.length} conturi afișate</AppText></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Adaugă utilizator" onPress={() => router.push('/service/users/create')} style={({ pressed }) => [styles.sheetAdd, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}><Ionicons name="add" size={24} color="#fff" /></Pressable>
          </View>

          <View style={[styles.search, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <View style={[styles.searchIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="search-outline" size={19} color={colors.primary} /></View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Caută după nume, utilizator, rol sau email…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.text }]}
            />
            {query ? <Pressable accessibilityLabel="Șterge căutarea" onPress={() => setQuery('')} style={styles.clearSearch}><Ionicons name="close-circle" size={21} color={colors.textMuted} /></Pressable> : null}
          </View>

          <ScrollView horizontal style={styles.filterScroller} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <FilterChip label="Toți" icon="people-outline" selected={filter === 'ALL'} onPress={() => setFilter('ALL')} />
            <FilterChip label="Activi" icon="checkmark-circle-outline" selected={filter === 'ACTIVE'} onPress={() => setFilter(filter === 'ACTIVE' ? 'ALL' : 'ACTIVE')} />
            <FilterChip label="Inactivi" icon="pause-circle-outline" selected={filter === 'INACTIVE'} onPress={() => setFilter(filter === 'INACTIVE' ? 'ALL' : 'INACTIVE')} />
          </ScrollView>

          {state.loading ? <LoadingState rows={5} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !filteredUsers.length ? <EmptyState icon={query || filter !== 'ALL' ? 'search-outline' : 'people-outline'} title={query || filter !== 'ALL' ? 'Niciun rezultat' : 'Niciun utilizator'} message={query || filter !== 'ALL' ? 'Schimbă termenul de căutare sau filtrul selectat.' : 'Adaugă primul utilizator pentru această proprietate.'} /> : <View style={styles.list}>{filteredUsers.map((user, index) => <UserCard key={user.id} user={user} colorsIndex={index} locked={Boolean(user.isPrimaryAdmin)} onPress={() => router.push(`/service/users/${user.id}`)} />)}</View>}
        </View>
      </ScrollView>
    </View>
  </Screen>;
}

function FilterChip({ label, icon, selected, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.filterChip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.76 : 1 }]}>
    <Ionicons name={icon} size={17} color={selected ? '#fff' : colors.textMuted} />
    <AppText variant="label" style={{ color: selected ? '#fff' : colors.text }}>{label}</AppText>
  </Pressable>;
}

function UserCard({ user, colorsIndex, locked, onPress }: { user: User; colorsIndex: number; locked: boolean; onPress: () => void }) {
  const { colors, isDark } = useAppTheme();
  const roleColor = user.role === 'ADMIN' ? palette.purple : user.role === 'COLLABORATOR' ? palette.cyan : palette.electric;
  const accessLabel = user.role === 'ADMIN' ? 'Acces global' : `${user.propertyIds.length} ${user.propertyIds.length === 1 ? 'proprietate' : 'proprietăți'}`;
  const permissionCount = user.role === 'ADMIN' ? ALL_PERMISSIONS.length : user.permissions.filter((permission) => ALL_PERMISSIONS.includes(permission)).length;
  return <Pressable accessibilityRole="button" accessibilityLabel={locked ? `${user.firstName} ${user.lastName}, Administrator principal protejat` : `Deschide utilizatorul ${user.firstName} ${user.lastName}`} accessibilityState={{ disabled: locked }} disabled={locked} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
    <Card style={[styles.userCard, { borderColor: locked ? `${palette.purple}70` : user.isActive ? colors.border : `${palette.danger}45` }]}>
      <View style={[styles.accent, { backgroundColor: user.isActive ? palette.electric : palette.danger }]} />
      <LinearGradient colors={avatarGradients[colorsIndex % avatarGradients.length]} style={styles.avatar}><AppText variant="label" style={styles.avatarText}>{initials(user.firstName, user.lastName)}</AppText></LinearGradient>
      <View style={styles.userContent}>
        <View style={styles.nameRow}>
          <AppText variant="heading" numberOfLines={1} style={styles.userName}>{user.firstName} {user.lastName}</AppText>
          <View style={[styles.status, { backgroundColor: locked ? (isDark ? '#2B1D55' : '#F2ECFF') : user.isActive ? (isDark ? '#0B4D35' : palette.successSoft) : (isDark ? '#57202A' : palette.dangerSoft) }]}>{locked ? <Ionicons name="pin" size={13} color={palette.purple} /> : <View style={[styles.statusDot, { backgroundColor: user.isActive ? palette.success : palette.danger }]} />}<AppText variant="caption" style={{ color: locked ? palette.purple : user.isActive ? palette.success : palette.danger, fontWeight: '800' }}>{locked ? 'Principal' : user.isActive ? 'Activ' : 'Inactiv'}</AppText></View>
        </View>
        <View style={styles.identityRow}><Ionicons name={user.role === 'ADMIN' ? 'shield-checkmark-outline' : 'person-outline'} size={15} color={roleColor} /><AppText variant="caption" numberOfLines={1} style={{ color: roleColor, fontWeight: '800' }}>@{user.username} · {ROLE_LABELS[user.role]}</AppText></View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}><Ionicons name="key-outline" size={14} color={colors.textMuted} /><AppText variant="caption" muted>{permissionCount} permisiuni</AppText></View>
          <View style={styles.metaItem}><Ionicons name="business-outline" size={14} color={colors.textMuted} /><AppText variant="caption" muted>{accessLabel}</AppText></View>
        </View>
        <View style={styles.lastLogin}><Ionicons name={locked ? 'lock-closed-outline' : 'time-outline'} size={14} color={locked ? palette.purple : colors.textMuted} /><AppText variant="caption" muted numberOfLines={1}>{locked ? 'Cont protejat · se modifică numai din Profil' : user.lastLoginAt ? `Ultima autentificare ${formatDate(user.lastLoginAt, true)}` : 'Nu s-a autentificat încă'}</AppText></View>
      </View>
      <View style={[styles.chevron, { backgroundColor: locked ? (isDark ? '#2B1D55' : '#F2ECFF') : colors.primarySoft }]}><Ionicons name={locked ? 'lock-closed' : 'chevron-forward'} size={20} color={locked ? palette.purple : colors.primary} /></View>
    </Card>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 0, paddingBottom: 0 },
  root: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollContent: {},
  hero: { minHeight: 176, borderRadius: radius.xl, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, overflow: 'hidden' },
  fixedHero: { position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg },
  fixedHeroMobile: { top: spacing.md, left: spacing.md, right: spacing.md },
  heroGlow: { position: 'absolute', width: 230, height: 230, borderRadius: 115, top: -135, right: -45, backgroundColor: 'rgba(255,255,255,0.11)' },
  heroGlowSmall: { position: 'absolute', width: 110, height: 110, borderRadius: 55, bottom: -68, left: '38%', backgroundColor: 'rgba(255,255,255,0.07)' },
  heroCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  eyebrow: { color: '#DDE9FF', fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: '#fff' },
  heroText: { color: '#E5EEFF', maxWidth: 650 },
  heroStats: { marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { minHeight: 30, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.13)', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  heroDot: { width: 7, height: 7, borderRadius: 4 },
  heroStatText: { color: '#fff', fontWeight: '800' },
  addButton: { minHeight: 50, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, shadowColor: '#031538', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  addButtonMobile: { width: 50, paddingHorizontal: 0, borderRadius: 25 },
  addButtonLabel: { color: '#075CFF' },
  sheet: { minHeight: 720, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 112, gap: spacing.lg, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  sheetMobile: { paddingHorizontal: spacing.md },
  sheetHandle: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginBottom: spacing.xs },
  sectionHeading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { minWidth: 0, flex: 1 },
  sheetAdd: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 58, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  searchInput: { minWidth: 0, flex: 1, height: 54, fontSize: 15, fontWeight: '600', outlineStyle: 'none' } as never,
  clearSearch: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  filterScroller: { flexGrow: 0, flexShrink: 0, height: 46 },
  filters: { minHeight: 46, alignItems: 'center', gap: spacing.sm, paddingRight: spacing.lg },
  filterChip: { height: 44, alignSelf: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  list: { gap: spacing.md },
  userCard: { minHeight: 112, padding: spacing.lg, paddingLeft: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, overflow: 'hidden' },
  accent: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900' },
  userContent: { minWidth: 0, flex: 1, gap: 5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  userName: { minWidth: 0, maxWidth: '100%' },
  status: { minHeight: 26, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  identityRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lastLogin: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chevron: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
