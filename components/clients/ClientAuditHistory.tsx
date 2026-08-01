import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { AuditLog } from '@/types';
import { formatFinanceMoney } from '@/utils/client-finance';
import { formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

type Props = {
  items: readonly AuditLog[];
  compact?: boolean;
  limit?: number;
};

type Change = {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
};

const FIELD_LABELS: Record<string, string> = {
  firstname: 'Prenume',
  lastname: 'Nume',
  phone: 'Telefon',
  secondaryphone: 'Telefon secundar',
  email: 'Email',
  address: 'Adresă',
  city: 'Localitate',
  county: 'Județ',
  postalcode: 'Cod poștal',
  notes: 'Observații',
  status: 'Status client',
  isactive: 'Client activ',
  collaboratorid: 'Colaborator atribuit',
  commissiontype: 'Tip comision',
  commissionvalue: 'Valoare comision',
  currencycode: 'Monedă',
  exchangeratetoron: 'Curs către RON',
  workprice: 'Preț lucrare',
  diagnosticfee: 'Taxă diagnostic',
  advancepaid: 'Avans încasat',
  discountpercent: 'Reducere',
  actualpartscost: 'Cost real piese',
  displayedpartscost: 'Cost piese afișat',
  displayedlaborcost: 'Cost manoperă afișat',
  paymentstatus: 'Stare plată',
  subtotal: 'Subtotal',
  discountamount: 'Valoare reducere',
  totaldue: 'Total de achitat',
  receivedamount: 'Total încasat',
  remainingdue: 'Rest de achitat',
  additionalexpenses: 'Cheltuieli suplimentare',
  internalcosts: 'Costuri interne',
  collaboratorcost: 'Cost colaborator',
  gshopnet: 'G-Shop Net',
  description: 'Descriere cheltuială',
  amount: 'Valoare cheltuială',
  expenses: 'Cheltuieli',
  participants: 'Participanți',
  participantids: 'Participanți',
  userids: 'Participanți',
  username: 'Utilizator',
  role: 'Rol',
  isassigned: 'Participant atribuit',
  equipment: 'Echipament',
  brand: 'Marcă',
  model: 'Model',
  serialnumber: 'Serie',
  reportedissue: 'Problemă declarată',
  technicalassessment: 'Constatare tehnică',
  workperformed: 'Lucrări efectuate',
  internalnotes: 'Observații interne',
};

const STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Neachitat',
  PAID: 'Achitat',
  ACTIVE: 'Activ',
  INACTIVE: 'Inactiv',
  NEW: 'Nou',
  REVIEW_REQUIRED: 'Necesită verificare',
  PERCENT_NET: 'Procent din net',
  PERCENT_TOTAL: 'Procent din total',
  FIXED: 'Sumă fixă',
  GENERATED: 'Generat',
  USED: 'Folosit',
  SENT: 'Trimis',
};

const MONEY_FIELDS = new Set([
  'workprice', 'diagnosticfee', 'advancepaid', 'actualpartscost', 'displayedpartscost',
  'displayedlaborcost', 'subtotal', 'discountamount', 'totaldue', 'receivedamount',
  'remainingdue', 'additionalexpenses', 'internalcosts', 'collaboratorcost', 'gshopnet',
  'amount', 'commissionvalue',
]);

const HIDDEN_FIELDS = new Set(['id', 'clientid', 'propertyid', 'createdat', 'updatedat', 'createdby', 'updatedby', 'persisted']);
const SENSITIVE_MARKERS = ['password', 'passwordhash', 'token', 'accesstoken', 'refreshtoken', 'secret', 'authorization', 'apikey', 'signature', 'publicurl', 'ipaddress', 'device', 'bankaccount', 'iban'];

export function ClientAuditHistory({ items, compact = false, limit }: Props) {
  const { colors, isDark } = useAppTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const visibleItems = useMemo(() => items.slice(0, limit && limit > 0 ? limit : items.length), [items, limit]);

  if (!visibleItems.length) {
    return <Card style={[styles.empty, compact && styles.emptyCompact]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="time-outline" size={26} color={colors.primary} /></View>
      <View style={styles.emptyCopy}><AppText variant="heading">Nicio modificare înregistrată</AppText><AppText variant="caption" muted>Acțiunile asupra clientului vor apărea aici, împreună cu utilizatorul și valorile modificate.</AppText></View>
    </Card>;
  }

  return <View style={[styles.list, compact && styles.listCompact]}>{visibleItems.map((item) => {
    const expanded = expandedId === item.id;
    const changes = getChanges(item.before, item.after);
    const previousCurrency = findCurrency(item.before) ?? findCurrency(item.after) ?? 'RON';
    const nextCurrency = findCurrency(item.after) ?? previousCurrency;
    const tone = actionTone(item.action, colors.primary);
    return <Pressable
      key={item.id}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${item.summary}. ${changes.length} câmpuri modificate.`}
      onPress={() => setExpandedId((current) => current === item.id ? null : item.id)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card elevated style={[styles.entry, compact && styles.entryCompact, { borderColor: expanded ? `${tone}72` : colors.border, backgroundColor: isDark ? colors.surfaceElevated : colors.surface }]}>
        <View style={[styles.actionIcon, { backgroundColor: `${tone}${isDark ? '24' : '14'}` }]}><Ionicons name={actionIcon(item.action, item.module)} size={20} color={tone} /></View>
        <View style={styles.entryBody}>
          <View style={styles.titleRow}><AppText variant="label" style={styles.summary}>{item.summary}</AppText>{changes.length ? <View style={[styles.countBadge, { backgroundColor: `${tone}${isDark ? '24' : '12'}` }]}><AppText variant="caption" style={{ color: tone, fontWeight: '800' }}>{changes.length} {changes.length === 1 ? 'modificare' : 'modificări'}</AppText></View> : null}</View>
          <View style={styles.metaRow}><Ionicons name="person-circle-outline" size={15} color={colors.textMuted} /><AppText variant="caption" muted style={styles.metaUser}>{item.userName || 'Sistem'}</AppText><View style={[styles.metaDot, { backgroundColor: colors.border }]} /><Ionicons name="calendar-outline" size={14} color={colors.textMuted} /><AppText variant="caption" muted>{formatDate(item.createdAt, true)}</AppText></View>
          {expanded ? <View style={[styles.changes, { borderTopColor: colors.border }]}>
            {changes.length ? changes.map((change) => <ChangeRow key={change.key} change={change} previousCurrency={previousCurrency} nextCurrency={nextCurrency} />) : <View style={[styles.noChanges, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="information-circle-outline" size={18} color={colors.textMuted} /><AppText variant="caption" muted>Acțiunea nu conține valori publice modificate.</AppText></View>}
          </View> : null}
        </View>
        <View style={[styles.chevron, { backgroundColor: colors.surfaceMuted }]}><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} /></View>
      </Card>
    </Pressable>;
  })}</View>;
}

function ChangeRow({ change, previousCurrency, nextCurrency }: { change: Change; previousCurrency: string; nextCurrency: string }) {
  const { colors, isDark } = useAppTheme();
  return <View style={[styles.change, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
    <View style={styles.changeTitle}><View style={[styles.changeDot, { backgroundColor: colors.primary }]} /><AppText variant="label" style={styles.changeLabel}>{change.label}</AppText></View>
    <View style={styles.values}>
      <View style={[styles.valueBlock, { backgroundColor: isDark ? `${palette.danger}10` : '#FFF7F8' }]}><AppText variant="caption" style={{ color: palette.danger, fontWeight: '800' }}>ÎNAINTE</AppText><AppText variant="caption" numberOfLines={4}>{formatAuditValue(change.before, change.key, previousCurrency)}</AppText></View>
      <Ionicons name="arrow-forward" size={17} color={colors.textMuted} />
      <View style={[styles.valueBlock, { backgroundColor: isDark ? `${palette.success}10` : '#F3FBF5' }]}><AppText variant="caption" style={{ color: palette.success, fontWeight: '800' }}>DUPĂ</AppText><AppText variant="caption" numberOfLines={4}>{formatAuditValue(change.after, change.key, nextCurrency)}</AppText></View>
    </View>
  </View>;
}

function getChanges(before?: Record<string, unknown>, after?: Record<string, unknown>): Change[] {
  const previous = flattenVisible(before ?? {});
  const next = flattenVisible(after ?? {});
  return Array.from(new Set([...Object.keys(previous), ...Object.keys(next)]))
    .filter((key) => stableValue(previous[key]) !== stableValue(next[key]))
    .map((key) => ({ key, label: labelFor(key), before: previous[key], after: next[key] }));
}

function flattenVisible(input: Record<string, unknown>, prefix = '', output: Record<string, unknown> = {}): Record<string, unknown> {
  Object.entries(input).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isHidden(path)) return;
    if (isPlainRecord(value)) flattenVisible(value, path, output);
    else output[path] = value;
  });
  return output;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKey(key: string) {
  return key.split('.').at(-1)?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() ?? '';
}

function isHidden(path: string) {
  const normalized = normalizeKey(path);
  return HIDDEN_FIELDS.has(normalized) || SENSITIVE_MARKERS.some((marker) => normalized.includes(marker));
}

function labelFor(path: string) {
  const raw = path.split('.').at(-1) ?? path;
  const normalized = normalizeKey(path);
  if (FIELD_LABELS[normalized]) return FIELD_LABELS[normalized];
  return raw.replace(/([a-zăâîșț])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stableValue).sort());
  if (isPlainRecord(value)) return JSON.stringify(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return JSON.stringify(value) ?? String(value);
}

function findCurrency(input?: Record<string, unknown>) {
  const values = flattenVisible(input ?? {});
  const currency = Object.entries(values).find(([key, value]) => normalizeKey(key) === 'currencycode' && typeof value === 'string')?.[1];
  return typeof currency === 'string' && currency.length === 3 ? currency.toUpperCase() : undefined;
}

function formatAuditValue(value: unknown, key: string, currencyCode: string): string {
  if (value === undefined || value === null || value === '') return '—';
  const normalized = normalizeKey(key);
  if (typeof value === 'boolean') return value ? 'Da' : 'Nu';
  if (Array.isArray(value)) {
    if (['participants', 'participantids', 'userids'].includes(normalized)) return participantSummary(value);
    if (!value.length) return 'Niciunul';
    return value.map((item) => safeListValue(item)).filter(Boolean).join(', ') || `${value.length} elemente`;
  }
  if (typeof value === 'number') {
    if (MONEY_FIELDS.has(normalized)) return formatFinanceMoney(value, currencyCode);
    if (normalized === 'discountpercent') return `${value.toLocaleString('ro-RO', { maximumFractionDigits: 2 })}%`;
    return value.toLocaleString('ro-RO', { maximumFractionDigits: 2 });
  }
  if (typeof value === 'string') {
    if (['participants', 'participantids', 'userids'].includes(normalized)) {
      const count = value.split(',').map((item) => item.trim()).filter(Boolean).length;
      return count ? `${count} ${count === 1 ? 'participant' : 'participanți'}` : 'Niciun participant';
    }
    if (STATUS_LABELS[value]) return STATUS_LABELS[value];
    if (normalized.endsWith('id')) return 'Setat';
    if (looksLikeDate(normalized, value)) return formatDate(value, true);
    return value;
  }
  return 'Valoare actualizată';
}

function participantSummary(value: unknown[]) {
  if (!value.length) return 'Niciun participant';
  const names = value.map((item) => isPlainRecord(item) ? [item.firstName, item.lastName].filter(Boolean).join(' ') : '').filter(Boolean);
  return names.length === value.length ? names.join(', ') : `${value.length} ${value.length === 1 ? 'participant' : 'participanți'}`;
}

function safeListValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!isPlainRecord(value)) return '';
  const name = [value.firstName, value.lastName].filter(Boolean).join(' ');
  if (name) return name;
  if (typeof value.description === 'string') return value.description;
  return '';
}

function looksLikeDate(key: string, value: string) {
  if (!/(date|at)$/.test(key)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function actionTone(action: string, primary: string) {
  if (/DELETE|REMOVE|DEACTIVATE/i.test(action)) return palette.danger;
  if (/PAY|PAID|COMPLETE/i.test(action)) return palette.success;
  if (/FINANC|EXPENSE|PARTICIPANT/i.test(action)) return palette.purple;
  return primary;
}

function actionIcon(action: string, module: string): keyof typeof Ionicons.glyphMap {
  if (/DELETE|REMOVE|DEACTIVATE/i.test(action)) return 'trash-outline';
  if (/EXPENSE/i.test(action)) return 'receipt-outline';
  if (/PARTICIPANT/i.test(action)) return 'people-outline';
  if (/FINANC|PAY/i.test(`${action} ${module}`)) return 'wallet-outline';
  if (/CREATE|ADD/i.test(action)) return 'add-circle-outline';
  return 'create-outline';
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  listCompact: { gap: spacing.sm },
  entry: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, overflow: 'hidden' },
  entryCompact: { padding: spacing.md },
  pressed: { opacity: 0.86, transform: [{ scale: 0.995 }] },
  actionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  entryBody: { minWidth: 0, flex: 1, gap: spacing.sm },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  summary: { minWidth: 160, flex: 1 },
  countBadge: { minHeight: 24, borderRadius: radius.pill, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  metaUser: { maxWidth: 180 },
  metaDot: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 2 },
  chevron: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  changes: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, gap: spacing.sm },
  change: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  changeTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  changeDot: { width: 6, height: 6, borderRadius: 3 },
  changeLabel: { flex: 1 },
  values: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  valueBlock: { minWidth: 0, flex: 1, borderRadius: radius.sm, padding: spacing.sm, gap: 2 },
  noChanges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  empty: { minHeight: 180, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xxl },
  emptyCompact: { minHeight: 120, padding: spacing.lg },
  emptyIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  emptyCopy: { maxWidth: 400, flex: 1, gap: spacing.xs },
});
