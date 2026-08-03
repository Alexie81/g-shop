import { SERVICE_STATUS_LABELS } from '@/components/service-sheets/ServiceSheetStatus';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useBackToAdministration } from '@/hooks/useBackToAdministration';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { serviceSheetRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { ServiceDocumentRegisterRow } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import * as XLSX from 'xlsx';

type RegisterFilter = 'ALL' | 'COMPLETE' | 'INCOMPLETE';
type RegisterDocument = {
  sheetName: 'Fișe de intrare' | 'Devize finale' | 'Fișe de ieșire' | 'Certificate garanție';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  number: (row: ServiceDocumentRegisterRow) => string | undefined;
  at: (row: ServiceDocumentRegisterRow) => string | undefined;
};

const documentColumns: RegisterDocument[] = [
  { sheetName: 'Fișe de intrare', label: 'Fișă de intrare', icon: 'enter-outline', color: palette.electric, number: (row) => row.intakeNumber, at: (row) => row.intakeAt },
  { sheetName: 'Devize finale', label: 'Deviz final', icon: 'calculator-outline', color: palette.purple, number: (row) => row.finalEstimateNumber, at: (row) => row.finalEstimateAt },
  { sheetName: 'Fișe de ieșire', label: 'Fișă de ieșire', icon: 'exit-outline', color: palette.success, number: (row) => row.exitNumber, at: (row) => row.exitAt },
  { sheetName: 'Certificate garanție', label: 'Garanție', icon: 'shield-checkmark-outline', color: palette.cyan, number: (row) => row.warrantyNumber, at: (row) => row.warrantyAt },
];

const filters: { key: RegisterFilter; label: string }[] = [
  { key: 'ALL', label: 'Toate' },
  { key: 'COMPLETE', label: 'Complete' },
  { key: 'INCOMPLETE', label: 'Cu documente lipsă' },
];

const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function RegisterScreen() {
  useBackToAdministration();
  const { activeProperty } = useProperty();
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const propertyId = activeProperty?.id ?? '';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RegisterFilter>('ALL');
  const [exporting, setExporting] = useState(false);
  const state = useAsyncData(() => propertyId ? serviceSheetRepository.listRegister(propertyId) : Promise.resolve([]), [propertyId]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  const allRows = useMemo(() => state.data ?? [], [state.data]);
  const completeCount = useMemo(() => allRows.filter(isComplete).length, [allRows]);
  const documentsCount = useMemo(() => allRows.reduce((total, row) => total + countDocuments(row), 0), [allRows]);
  const rows = useMemo(() => {
    const needle = normalizeSearch(query.trim());
    return allRows.filter((row) => {
      if (filter === 'COMPLETE' && !isComplete(row)) return false;
      if (filter === 'INCOMPLETE' && isComplete(row)) return false;
      if (!needle) return true;
      return normalizeSearch([
        row.serviceSheetNumber,
        row.clientName,
        row.equipment,
        row.brand,
        row.model,
        row.intakeNumber,
        row.finalEstimateNumber,
        row.exitNumber,
        row.warrantyNumber,
      ].filter(Boolean).join(' ')).includes(needle);
    });
  }, [allRows, filter, query]);

  const exportRegister = async () => {
    if (!rows.length) return showToast('Nu există înregistrări de exportat pentru filtrul curent.', 'info');
    setExporting(true);
    try {
      const workbook = buildWorkbook(rows);
      const fileName = `registru-service-${dateFilePart(new Date())}.xlsx`;
      if (Platform.OS === 'web') {
        downloadWorkbookOnWeb(workbook, fileName);
        showToast('Registrul Excel a fost descărcat.', 'success');
      } else {
        const directory = FileSystem.cacheDirectory;
        if (!directory) throw new Error('Spațiul temporar al aplicației nu este disponibil.');
        const sharingAvailable = await Sharing.isAvailableAsync();
        if (!sharingAvailable) throw new Error('Partajarea fișierelor nu este disponibilă pe acest dispozitiv.');
        const uri = `${directory}${fileName}`;
        const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64', compression: true });
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
        await Sharing.shareAsync(uri, {
          mimeType: excelMimeType,
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
          dialogTitle: 'Exportă registrul service',
        });
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Registrul nu a putut fi exportat.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const openRepair = (row: ServiceDocumentRegisterRow) => router.push(`/service/service-sheets/${row.serviceSheetId}`);
  const backToMore = () => router.replace('/service/more');

  return <Screen header={<AppHeader title="Registru" back onBack={backToMore} />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <View style={styles.stack}>
      <LinearGradient colors={isDark ? ['#0A2655', '#075CFF'] : ['#103DA8', '#0879FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, compact && styles.heroCompact]}>
        <View pointerEvents="none" style={styles.heroOrb} />
        <View style={styles.heroTop}>
          <View style={styles.heroHeading}>
            <View style={styles.heroIcon}><Ionicons name="library-outline" size={25} color="#FFFFFF" /></View>
            <View style={styles.heroCopy}>
              <AppText variant="caption" style={styles.eyebrow}>REGISTRU DOCUMENTE SERVICE</AppText>
              <AppText variant="title" style={styles.heroTitle}>O reparație, toate documentele</AppText>
              <AppText variant="caption" style={styles.heroSubtitle} numberOfLines={1}>{activeProperty?.name}</AppText>
            </View>
          </View>
          {!compact ? <Button label="Exportă .xlsx" icon="download-outline" compact loading={exporting} disabled={!rows.length} onPress={() => void exportRegister()} style={styles.heroExport} /> : null}
        </View>
        <View style={[styles.heroMetrics, compact && styles.heroMetricsCompact]}>
          <HeroMetric icon="construct-outline" value={allRows.length} label="reparații" />
          <View style={styles.heroDivider} />
          <HeroMetric icon="documents-outline" value={documentsCount} label="documente" />
          <View style={styles.heroDivider} />
          <HeroMetric icon="checkmark-done-outline" value={completeCount} label="complete" />
        </View>
      </LinearGradient>

      <Card elevated style={styles.toolbar}>
        <View style={styles.toolbarTitleRow}>
          <View style={[styles.toolbarIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="filter-outline" size={20} color={colors.primary} /></View>
          <View style={styles.toolbarCopy}>
            <AppText variant="heading">Caută și filtrează</AppText>
            <AppText variant="caption" muted>{rows.length} din {allRows.length} reparații afișate</AppText>
          </View>
          {compact ? <Button label="Excel" icon="download-outline" compact loading={exporting} disabled={!rows.length} onPress={() => void exportRegister()} /> : null}
        </View>
        <View style={[styles.search, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={20} color={colors.textMuted} />
          <TextInput
            accessibilityLabel="Caută în registru"
            value={query}
            onChangeText={setQuery}
            placeholder="Nr. reparație, client, echipament sau document…"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query ? <Pressable accessibilityRole="button" accessibilityLabel="Șterge căutarea" onPress={() => setQuery('')} style={styles.clearSearch}><Ionicons name="close-circle" size={20} color={colors.textMuted} /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filters.map((item) => {
            const selected = filter === item.key;
            const count = item.key === 'ALL' ? allRows.length : item.key === 'COMPLETE' ? completeCount : allRows.length - completeCount;
            return <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setFilter(item.key)} style={({ pressed }) => [styles.filterChip, { backgroundColor: selected ? colors.primary : colors.surfaceMuted, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.75 : 1 }]}>
              <AppText variant="label" style={{ color: selected ? '#FFFFFF' : colors.text }}>{item.label}</AppText>
              <View style={[styles.filterCount, { backgroundColor: selected ? 'rgba(255,255,255,0.20)' : colors.surface }]}><AppText variant="caption" style={{ color: selected ? '#FFFFFF' : colors.textMuted, fontWeight: '800' }}>{count}</AppText></View>
            </Pressable>;
          })}
        </ScrollView>
      </Card>

      {state.loading ? <LoadingState rows={7} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : !rows.length ? <EmptyState icon="file-tray-outline" title="Nicio reparație găsită" message={allRows.length ? 'Schimbă termenul de căutare sau filtrul selectat.' : 'Reparațiile și documentele generate vor apărea automat aici.'} /> : compact ? <View style={styles.mobileList}>{rows.map((row) => <MobileRegisterCard key={row.serviceSheetId} row={row} onPress={() => openRepair(row)} />)}</View> : <RegisterTable rows={rows} onOpen={openRepair} />}

      {!state.loading && !state.error && rows.length ? <View style={[styles.exportHint, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
        <AppText variant="caption" muted style={styles.exportHintText}>Exportul include filtrarea curentă într-un singur fișier Excel, cu foi separate pentru intrări, devize, ieșiri și certificate de garanție.</AppText>
      </View> : null}
    </View>
  </Screen>;
}

function RegisterTable({ rows, onOpen }: { rows: ServiceDocumentRegisterRow[]; onOpen: (row: ServiceDocumentRegisterRow) => void }) {
  const { colors } = useAppTheme();
  return <Card style={styles.tableCard} elevated>
    <View style={[styles.tableHeader, { backgroundColor: colors.surfaceMuted, borderBottomColor: colors.border }]}>
      <TableHeaderCell label="REPARAȚIE" style={styles.repairColumn} />
      <TableHeaderCell label="CLIENT / ECHIPAMENT" style={styles.clientColumn} />
      {documentColumns.map((document) => <TableHeaderCell key={document.sheetName} label={document.label.toLocaleUpperCase('ro-RO')} style={styles.documentColumn} />)}
    </View>
    {rows.map((row, index) => <Pressable
      key={row.serviceSheetId}
      accessibilityRole="button"
      accessibilityLabel={`Deschide reparația ${row.serviceSheetNumber}`}
      onPress={() => onOpen(row)}
      style={({ pressed }) => [styles.tableRow, { borderBottomColor: colors.border, backgroundColor: pressed ? colors.primarySoft : index % 2 ? colors.surfaceMuted : colors.surface }]}
    >
      <View style={[styles.tableCell, styles.repairColumn]}>
        <View style={styles.repairNumberLine}><Ionicons name="construct-outline" size={17} color={colors.primary} /><AppText variant="label" numberOfLines={1}>{row.serviceSheetNumber}</AppText></View>
        <AppText variant="caption" muted>{registerDate(row.receivedAt)}</AppText>
        {row.status ? <AppText variant="caption" numberOfLines={1} style={{ color: colors.primary, fontWeight: '700' }}>{SERVICE_STATUS_LABELS[row.status]}</AppText> : null}
      </View>
      <View style={[styles.tableCell, styles.clientColumn]}>
        <AppText variant="label" numberOfLines={1}>{row.clientName || 'Client nespecificat'}</AppText>
        <AppText variant="caption" muted numberOfLines={2}>{equipmentLabel(row)}</AppText>
      </View>
      {documentColumns.map((document) => <View key={document.sheetName} style={[styles.tableCell, styles.documentColumn]}><DocumentCell document={document} row={row} /></View>)}
    </Pressable>)}
  </Card>;
}

function TableHeaderCell({ label, style }: { label: string; style: object }) {
  const { colors } = useAppTheme();
  return <View style={[styles.headerCell, style]}><AppText variant="caption" numberOfLines={1} style={{ color: colors.textMuted, fontWeight: '900', letterSpacing: 0.35 }}>{label}</AppText></View>;
}

function DocumentCell({ document, row }: { document: RegisterDocument; row: ServiceDocumentRegisterRow }) {
  const { colors, isDark } = useAppTheme();
  const number = document.number(row);
  const at = document.at(row);
  if (!hasDocument(number, at)) return <View style={[styles.missingBadge, { backgroundColor: isDark ? '#351827' : palette.dangerSoft }]}><Ionicons name="remove-circle-outline" size={15} color={palette.danger} /><AppText variant="caption" style={{ color: palette.danger, fontWeight: '800' }}>Lipsește</AppText></View>;
  const split = splitRegisterDate(at);
  return <View style={styles.documentCell}>
    <View style={styles.documentNumberLine}><View style={[styles.documentDot, { backgroundColor: document.color }]} /><AppText variant="label" numberOfLines={1}>{number || 'Fără număr'}</AppText></View>
    <View style={styles.documentDateLine}><Ionicons name="calendar-outline" size={13} color={colors.textMuted} /><AppText variant="caption" muted>{split.date}</AppText><Ionicons name="time-outline" size={13} color={colors.textMuted} /><AppText variant="caption" muted>{split.time}</AppText></View>
  </View>;
}

function MobileRegisterCard({ row, onPress }: { row: ServiceDocumentRegisterRow; onPress: () => void }) {
  const { colors } = useAppTheme();
  const completed = isComplete(row);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Deschide reparația ${row.serviceSheetNumber}`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}>
    <Card elevated style={styles.mobileCard}>
      <View style={styles.mobileTop}>
        <View style={[styles.mobileRepairIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="construct-outline" size={20} color={colors.primary} /></View>
        <View style={styles.mobileHeading}>
          <View style={styles.mobileNumberLine}><AppText variant="heading" numberOfLines={1}>{row.serviceSheetNumber}</AppText><View style={[styles.completionBadge, { backgroundColor: completed ? palette.successSoft : palette.warningSoft }]}><Ionicons name={completed ? 'checkmark-circle' : 'time-outline'} size={14} color={completed ? palette.success : palette.warning} /><AppText variant="caption" style={{ color: completed ? palette.success : '#B56A00', fontWeight: '800' }}>{completed ? 'Complet' : `${documentColumns.length - countDocuments(row)} lipsă`}</AppText></View></View>
          <AppText variant="label" numberOfLines={1}>{row.clientName || 'Client nespecificat'}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{equipmentLabel(row)}</AppText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>
      <View style={[styles.mobileDocuments, { borderTopColor: colors.border }]}>
        {documentColumns.map((document) => <MobileDocumentRow key={document.sheetName} document={document} row={row} />)}
      </View>
    </Card>
  </Pressable>;
}

function MobileDocumentRow({ document, row }: { document: RegisterDocument; row: ServiceDocumentRegisterRow }) {
  const { colors, isDark } = useAppTheme();
  const number = document.number(row);
  const at = document.at(row);
  const available = hasDocument(number, at);
  const split = splitRegisterDate(at);
  return <View style={styles.mobileDocumentRow}>
    <View style={[styles.mobileDocumentIcon, { backgroundColor: `${document.color}${isDark ? '28' : '14'}` }]}><Ionicons name={document.icon} size={17} color={document.color} /></View>
    <View style={styles.mobileDocumentCopy}><AppText variant="caption" muted>{document.label}</AppText><AppText variant="label" numberOfLines={1}>{available ? number || 'Fără număr' : 'Document lipsă'}</AppText></View>
    {available ? <View style={styles.mobileDocumentDate}><AppText variant="caption" muted>{split.date}</AppText><AppText variant="caption" style={{ color: colors.textMuted, fontWeight: '800' }}>{split.time}</AppText></View> : <Ionicons name="remove-circle-outline" size={18} color={palette.danger} />}
  </View>;
}

function HeroMetric({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) {
  return <View style={styles.heroMetric}><Ionicons name={icon} size={18} color="#FFFFFF" /><View><AppText variant="heading" style={styles.heroMetricValue}>{value}</AppText><AppText variant="caption" style={styles.heroMetricLabel}>{label}</AppText></View></View>;
}

function hasDocument(number?: string, at?: string) {
  return Boolean(number?.trim() || at);
}

function countDocuments(row: ServiceDocumentRegisterRow) {
  return documentColumns.reduce((total, document) => total + (hasDocument(document.number(row), document.at(row)) ? 1 : 0), 0);
}

function isComplete(row: ServiceDocumentRegisterRow) {
  return countDocuments(row) === documentColumns.length;
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro-RO');
}

function equipmentLabel(row: ServiceDocumentRegisterRow) {
  const equipment = row.equipment?.trim();
  const details = [row.brand, row.model].filter(Boolean).join(' ').trim();
  if (!equipment) return details || 'Echipament nespecificat';
  if (!details || normalizeSearch(equipment).includes(normalizeSearch(details))) return equipment;
  return `${equipment} · ${details}`;
}

function parseRegisterDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function splitRegisterDate(value?: string) {
  const date = parseRegisterDate(value);
  if (!date) return { date: '—', time: '—' };
  return {
    date: new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' }).format(date),
  };
}

function registerDate(value?: string) {
  const split = splitRegisterDate(value);
  return split.date === '—' ? 'Dată nespecificată' : `Primită ${split.date}, ${split.time}`;
}

function statusLabel(row: ServiceDocumentRegisterRow) {
  return row.status ? SERVICE_STATUS_LABELS[row.status] : '';
}

function buildWorkbook(rows: ServiceDocumentRegisterRow[]) {
  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: 'Registru documente service', Subject: 'Fișe de intrare, devize finale, fișe de ieșire și certificate de garanție', Author: 'G-Shop', CreatedDate: new Date() };
  for (const document of documentColumns) {
    const data: (string | number)[][] = [[
      'Nr. document',
      'Data',
      'Ora',
      'Nr. reparație',
      'Client',
      'Echipament',
      'Status reparație',
    ]];
    for (const row of rows) {
      const number = document.number(row);
      const at = document.at(row);
      if (!hasDocument(number, at)) continue;
      const split = splitRegisterDate(at);
      data.push([number || '', split.date === '—' ? '' : split.date, split.time === '—' ? '' : split.time, row.serviceSheetNumber, row.clientName, equipmentLabel(row), statusLabel(row)]);
    }
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    worksheet['!cols'] = [{ wch: 22 }, { wch: 13 }, { wch: 9 }, { wch: 18 }, { wch: 30 }, { wch: 38 }, { wch: 22 }];
    worksheet['!autofilter'] = { ref: `A1:G${Math.max(1, data.length)}` };
    XLSX.utils.book_append_sheet(workbook, worksheet, document.sheetName);
  }
  return workbook;
}

function downloadWorkbookOnWeb(workbook: XLSX.WorkBook, fileName: string) {
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
  const blob = new Blob([bytes], { type: excelMimeType });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function dateFilePart(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 1120, alignSelf: 'center', gap: spacing.lg },
  hero: { minHeight: 176, borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden', justifyContent: 'space-between', gap: spacing.lg },
  heroCompact: { minHeight: 190, padding: spacing.lg },
  heroOrb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, right: -80, top: -165, backgroundColor: 'rgba(255,255,255,0.11)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroHeading: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' },
  heroCopy: { minWidth: 0, flex: 1, gap: 1 },
  eyebrow: { color: '#C9DCFF', fontWeight: '900', letterSpacing: 0.8 },
  heroTitle: { color: '#FFFFFF' },
  heroSubtitle: { color: '#D9E7FF' },
  heroExport: { minWidth: 156, backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.25)' },
  heroMetrics: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, paddingHorizontal: spacing.lg, backgroundColor: 'rgba(3,20,64,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  heroMetricsCompact: { paddingHorizontal: spacing.sm },
  heroMetric: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  heroMetricValue: { color: '#FFFFFF', lineHeight: 20 },
  heroMetricLabel: { color: '#C9DCFF' },
  heroDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.18)' },
  toolbar: { gap: spacing.md },
  toolbarTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toolbarIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  toolbarCopy: { minWidth: 0, flex: 1, gap: 1 },
  search: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: { minWidth: 0, flex: 1, paddingVertical: spacing.md, fontSize: 15 },
  clearSearch: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  filterRow: { gap: spacing.sm, paddingRight: spacing.xs },
  filterChip: { minHeight: 40, borderWidth: 1, borderRadius: radius.pill, paddingLeft: spacing.md, paddingRight: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterCount: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  tableCard: { overflow: 'hidden', padding: 0 },
  tableHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1 },
  headerCell: { justifyContent: 'center', paddingHorizontal: spacing.md },
  tableRow: { minHeight: 96, flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth },
  tableCell: { minWidth: 0, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 4 },
  repairColumn: { flex: 1.02, minWidth: 130 },
  clientColumn: { flex: 1.35, minWidth: 160 },
  documentColumn: { flex: 1.1, minWidth: 145 },
  repairNumberLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  documentCell: { minWidth: 0, gap: 5 },
  documentNumberLine: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  documentDot: { width: 7, height: 7, borderRadius: 4 },
  documentDateLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 4 },
  missingBadge: { alignSelf: 'flex-start', minHeight: 27, paddingHorizontal: spacing.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 },
  mobileList: { gap: spacing.md },
  mobileCard: { padding: spacing.md, gap: spacing.md },
  mobileTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mobileRepairIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  mobileHeading: { minWidth: 0, flex: 1, gap: 2 },
  mobileNumberLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  completionBadge: { minHeight: 25, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4 },
  mobileDocuments: { borderTopWidth: 1, paddingTop: spacing.sm, gap: spacing.xs },
  mobileDocumentRow: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mobileDocumentIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mobileDocumentCopy: { minWidth: 0, flex: 1, gap: 1 },
  mobileDocumentDate: { alignItems: 'flex-end' },
  exportHint: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  exportHintText: { minWidth: 0, flex: 1, lineHeight: 19 },
});
