import { ClientCard } from '@/components/clients/ClientCard';
import { WhatsAppQuickMessagesModal } from '@/components/clients/WhatsAppQuickMessagesModal';
import { AppHeader } from '@/components/layout/AppHeader';
import { AnimatedRefreshIcon } from '@/components/ui/AnimatedRefreshIcon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { clientRepository, whatsAppMessageRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { Client } from '@/types';
import { fullName } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

type ClientStateFilter = '' | 'ACTIVE' | 'FINALIZED';
type ClientSort = '' | 'NEWEST' | 'OLDEST' | 'NAME_ASC' | 'NAME_DESC';

const stateFilters: { value: ClientStateFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: '', label: 'Toți', icon: 'people-outline' },
  { value: 'ACTIVE', label: 'Activi', icon: 'pulse-outline' },
  { value: 'FINALIZED', label: 'Finalizați', icon: 'checkmark-done-outline' },
];

const sortOptions: { value: Exclude<ClientSort, ''>; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'NEWEST', label: 'Noi', icon: 'sparkles-outline' },
  { value: 'OLDEST', label: 'Vechi', icon: 'hourglass-outline' },
  { value: 'NAME_ASC', label: 'Nume A–Z', icon: 'arrow-down-outline' },
  { value: 'NAME_DESC', label: 'Nume Z–A', icon: 'arrow-up-outline' },
];

export default function ClientsScreen() {
  const { activeProperty } = useProperty();
  const { colors } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const mobile = width < 640;
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<ClientStateFilter>('');
  const [sort, setSort] = useState<ClientSort>('');
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [whatsAppTarget, setWhatsAppTarget] = useState<Client | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 320);
    return () => clearTimeout(timer);
  }, [query]);

  const state = useAsyncData(
    () => clientRepository.list(activeProperty?.id ?? '', debounced),
    [activeProperty?.id, debounced],
  );
  const messagesState = useAsyncData(() => whatsAppMessageRepository.list(activeProperty?.id ?? ''), [activeProperty?.id]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);
  useRefreshOnFocus(() => messagesState.reload(true), messagesState.loading || messagesState.refreshing);
  const visibleClients = useMemo(() => {
    const clients = [...(state.data?.data ?? [])];
    const filtered = filter === 'FINALIZED'
      ? clients.filter((client) => client.status === 'FINALIZED')
      : filter === 'ACTIVE'
        ? clients.filter((client) => client.status !== 'FINALIZED')
        : clients;

    if (sort === 'NEWEST') filtered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    else if (sort === 'OLDEST') filtered.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    else if (sort === 'NAME_ASC') filtered.sort((a, b) => fullName(a).localeCompare(fullName(b), 'ro', { sensitivity: 'base' }));
    else if (sort === 'NAME_DESC') filtered.sort((a, b) => fullName(b).localeCompare(fullName(a), 'ro', { sensitivity: 'base' }));
    return filtered;
  }, [filter, sort, state.data?.data]);
  const shown = visibleClients.length;
  const activeFilter = stateFilters.find((item) => item.value === filter) ?? stateFilters[0];
  const activeSort = sortOptions.find((item) => item.value === sort);

  const requestDelete = (client: Client) => {
    setDeleteError('');
    setDeleteTarget(client);
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeleteError('');
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await clientRepository.remove(deleteTarget.id);
      setDeleteTarget(null);
      await state.reload(true);
      showToast('Clientul a fost șters.', 'success');
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'Clientul nu a putut fi șters.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const clearViewControls = () => {
    setQuery('');
    setFilter('');
    setSort('');
  };

  return <Screen
    header={<AppHeader title="Clienți" />}
    refreshing={state.refreshing}
    onRefresh={() => void state.reload(true)}
    style={styles.screen}
  >
    <Card style={[styles.tools, mobile && styles.toolsMobile]} elevated>
      <View style={styles.toolsHeading}>
        <View style={[styles.toolsIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="options-outline" size={19} color={colors.primary} />
        </View>
        <View style={styles.toolsCopy}>
          <AppText variant="heading">Găsește rapid un client</AppText>
          <AppText variant="caption" muted>Caută după datele de contact, filtrează starea și alege ordinea</AppText>
        </View>
      </View>

      <View style={[styles.search, { backgroundColor: colors.input, borderColor: query ? colors.primary : colors.border }]}>
        <View style={[styles.searchIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="search-outline" size={19} color={colors.primary} />
        </View>
        <TextInput
          accessibilityLabel="Caută client"
          placeholder="Nume, telefon sau email…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.text }]}
        />
        {query ? <Pressable
          accessibilityRole="button"
          accessibilityLabel="Șterge căutarea"
          hitSlop={10}
          onPress={() => setQuery('')}
          style={styles.clearSearch}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable> : null}
      </View>

      <View style={styles.filterWorkspace}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reîmprospătează lista clienților"
          accessibilityState={{ busy: state.refreshing }}
          disabled={state.refreshing}
          hitSlop={6}
          onPress={() => void state.reload(true)}
          style={({ pressed }) => [
            styles.refreshButton,
            { backgroundColor: colors.primarySoft, borderColor: colors.border },
            pressed && styles.filterPressed,
          ]}
        >
          <AnimatedRefreshIcon refreshing={state.refreshing} color={colors.primary} />
        </Pressable>

        <ScrollView
          horizontal
          style={styles.filterScroller}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          keyboardShouldPersistTaps="handled"
        >
          {stateFilters.map((item) => {
            const selected = filter === item.value;
            return <Pressable
              key={item.value || 'all'}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Filtru ${item.label}`}
              onPress={() => setFilter(item.value === '' || selected ? '' : item.value)}
              style={({ pressed }) => [
                styles.filter,
                { backgroundColor: colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border },
                pressed && styles.filterPressed,
              ]}
            >
              <Ionicons name={item.icon} size={16} color={selected ? colors.primary : colors.textMuted} />
              <AppText variant="caption" style={{ color: selected ? colors.primary : colors.textMuted, fontWeight: '800' }}>{item.label}</AppText>
            </Pressable>;
          })}
          {sortOptions.map((item) => {
            const selected = sort === item.value;
            return <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Sortare ${item.label}`}
              onPress={() => setSort(selected ? '' : item.value)}
              style={({ pressed }) => [
                styles.filter,
                { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border },
                pressed && styles.filterPressed,
              ]}
            >
              <Ionicons name={item.icon} size={16} color={selected ? '#fff' : colors.textMuted} />
              <AppText variant="caption" style={{ color: selected ? '#fff' : colors.textMuted, fontWeight: '800' }}>{item.label}</AppText>
            </Pressable>;
          })}
        </ScrollView>
      </View>
    </Card>

    <View style={styles.listHeading}>
      <View style={styles.listTitleRow}>
        <View style={[styles.listIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="list-outline" size={18} color={colors.primary} />
        </View>
        <View>
          <AppText variant="heading">Lista clienților</AppText>
          <AppText variant="caption" muted>
            {state.loading ? 'Se actualizează…' : `${shown} ${shown === 1 ? 'rezultat afișat' : 'rezultate afișate'}`}
          </AppText>
        </View>
      </View>
      <View style={styles.listHeadingActions}>
        {(query || filter || sort) ? <Pressable
          accessibilityRole="button"
          accessibilityLabel="Elimină căutarea, filtrul și sortarea"
          onPress={clearViewControls}
          style={[styles.activeFilter, { backgroundColor: colors.primarySoft }]}
        >
          <AppText variant="caption" style={{ color: colors.primary, fontWeight: '800' }} numberOfLines={1}>
            {[query ? `„${query}”` : '', filter ? activeFilter.label : '', activeSort?.label ?? ''].filter(Boolean).join(' · ')}
          </AppText>
          <Ionicons name="close-circle" size={16} color={colors.primary} />
        </Pressable> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Adaugă client nou"
          onPress={() => router.push('/service/clients/create')}
          style={({ pressed }) => [styles.addClientButton, { backgroundColor: colors.primary }, pressed && styles.filterPressed]}
        >
          <Ionicons name="add" size={23} color="#fff" />
        </Pressable>
      </View>
    </View>

    {state.loading
      ? <LoadingState rows={5} />
      : state.error
        ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} />
        : !visibleClients.length
          ? <EmptyState
              icon="people-outline"
              title="Niciun client găsit"
              message={query || filter ? 'Încearcă alte criterii de căutare sau elimină filtrele.' : 'Adaugă primul client în această proprietate.'}
              action={query || filter || sort ? 'Resetează afișarea' : 'Adaugă client'}
              onAction={() => query || filter || sort ? clearViewControls() : router.push('/service/clients/create')}
            />
          : <View style={styles.list}>
              {visibleClients.map((client, index) => <ClientCard
                key={client.id}
                client={client}
                index={index}
                onWhatsApp={setWhatsAppTarget}
                onDeleteRequest={requestDelete}
              />)}
            </View>}

    <DeleteClientModal
      client={deleteTarget}
      loading={deleteLoading}
      error={deleteError}
      onClose={closeDeleteModal}
      onConfirm={() => void confirmDelete()}
    />
    {whatsAppTarget ? <WhatsAppQuickMessagesModal visible client={whatsAppTarget} propertyName={activeProperty?.name ?? 'G-Shop'} messages={messagesState.data ?? []} onClose={() => setWhatsAppTarget(null)} /> : null}
  </Screen>;
}

function DeleteClientModal({ client, loading, error, onClose, onConfirm }: {
  client: Client | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  return <Modal
    visible={Boolean(client)}
    transparent
    animationType="fade"
    statusBarTranslucent
    onRequestClose={() => { if (!loading) onClose(); }}
  >
    <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
      <Pressable accessibilityLabel="Închide confirmarea" disabled={loading} style={StyleSheet.absoluteFill} onPress={onClose} />
      <Card style={[styles.modalCard, { backgroundColor: isDark ? colors.surfaceElevated : colors.surface }]} elevated>
        <View style={[styles.modalIcon, { backgroundColor: palette.dangerSoft }]}>
          <Ionicons name="trash-outline" size={28} color={palette.danger} />
        </View>
        <View style={styles.modalCopy}>
          <AppText variant="title">Ștergi clientul?</AppText>
          <AppText muted>
            {client ? `${fullName(client)} va fi eliminat din lista activă după confirmare.` : ''}
          </AppText>
        </View>
        <View style={[styles.modalNotice, { backgroundColor: isDark ? `${palette.warning}18` : palette.warningSoft }]}>
          <Ionicons name="alert-circle-outline" size={20} color={palette.warning} />
          <AppText variant="caption" style={styles.modalNoticeText}>Verifică atent clientul. Gestul de glisare nu șterge nimic fără această confirmare.</AppText>
        </View>
        {error ? <View style={[styles.modalError, { backgroundColor: `${palette.danger}12`, borderColor: `${palette.danger}45` }]}>
          <Ionicons name="alert-circle-outline" size={19} color={palette.danger} />
          <AppText variant="caption" style={styles.modalErrorText}>{error}</AppText>
        </View> : null}
        <View style={styles.modalActions}>
          <Button label="Anulează" variant="outline" disabled={loading} onPress={onClose} style={styles.modalButton} />
          <Button label="Șterge clientul" variant="danger" icon="trash-outline" loading={loading} onPress={onConfirm} style={styles.modalButton} />
        </View>
      </Card>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl },
  tools: { gap: spacing.lg, padding: spacing.xl },
  toolsMobile: { padding: spacing.lg },
  toolsHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toolsIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  toolsCopy: { flex: 1, minWidth: 0 },
  search: {
    minHeight: 56,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, minWidth: 0, height: 52, fontSize: 15 },
  clearSearch: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  filterWorkspace: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  refreshButton: { width: 42, height: 42, flexShrink: 0, borderWidth: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  filterScroller: { flex: 1, minWidth: 0 },
  filters: { gap: spacing.sm, paddingRight: spacing.sm },
  filter: { minHeight: 38, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterPressed: { opacity: 0.76 },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md },
  listTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  listHeadingActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
  listIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  activeFilter: { maxWidth: 220, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addClientButton: { width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  list: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 460, borderRadius: radius.xl, padding: spacing.xxl, gap: spacing.lg },
  modalIcon: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  modalCopy: { gap: spacing.sm },
  modalNotice: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  modalNoticeText: { flex: 1 },
  modalError: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  modalErrorText: { flex: 1, color: palette.danger },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modalButton: { flexGrow: 1, flexBasis: 170 },
});
