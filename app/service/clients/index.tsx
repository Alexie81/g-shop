import { ClientCard } from '@/components/clients/ClientCard';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { clientRepository } from '@/repositories/api-repositories';
import { radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

const filters = [{ value: '', label: 'Toți' }, { value: 'NOT_GENERATED', label: 'QR negenerat' }, { value: 'GENERATED', label: 'QR generat' }, { value: 'SENT', label: 'QR trimis' }, { value: 'USED', label: 'QR folosit' }];
export default function ClientsScreen() {
  const { activeProperty } = useProperty(); const { colors } = useAppTheme(); const [query, setQuery] = useState(''); const [debounced, setDebounced] = useState(''); const [filter, setFilter] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebounced(query), 320); return () => clearTimeout(timer); }, [query]);
  const state = useAsyncData(() => clientRepository.list(activeProperty?.id ?? '', debounced, filter), [activeProperty?.id, debounced, filter]);
  return <Screen header={<AppHeader title="Clienți" />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <View style={styles.heading}><View style={{ flex: 1 }}><AppText variant="title">Clienții proprietății</AppText><AppText muted>{state.data?.total ?? 0} clienți · date online actualizate</AppText></View><Button compact label="Adaugă" icon="add" onPress={() => router.push('/service/clients/create')} /></View>
    <Card style={styles.tools}><View style={[styles.search, { backgroundColor: colors.input, borderColor: colors.border }]}><Ionicons name="search-outline" size={20} color={colors.textMuted} /><TextInput placeholder="Caută după nume, telefon sau email…" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} style={[styles.searchInput, { color: colors.text }]} />{query ? <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={19} color={colors.textMuted} /></Pressable> : null}</View><View style={styles.filters}>{filters.map((item) => <Pressable key={item.value} onPress={() => setFilter(item.value)} style={[styles.filter, { backgroundColor: filter === item.value ? colors.primary : colors.surfaceMuted }]}><AppText variant="caption" style={{ color: filter === item.value ? '#fff' : colors.textMuted, fontWeight: '800' }}>{item.label}</AppText></Pressable>)}</View></Card>
    {state.loading ? <LoadingState rows={5} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !state.data?.data.length ? <EmptyState icon="people-outline" title="Niciun client găsit" message={query || filter ? 'Încearcă alte criterii de căutare sau elimină filtrele.' : 'Adaugă primul client în această proprietate.'} action="Adaugă client" onAction={() => router.push('/service/clients/create')} /> : <View style={styles.list}>{state.data.data.map((client, index) => <ClientCard key={client.id} client={client} index={index} />)}</View>}
  </Screen>;
}
const styles = StyleSheet.create({ heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, tools: { gap: spacing.md }, search: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, searchInput: { flex: 1, fontSize: 15 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, filter: { borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: spacing.md }, list: { gap: spacing.md } });
