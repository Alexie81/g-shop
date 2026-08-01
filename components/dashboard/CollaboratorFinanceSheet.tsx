import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAppTheme } from '@/contexts/ThemeContext';
import { apiRequest } from '@/services/api';
import { palette, radius, spacing } from '@/theme/tokens';
import { CollaboratorFinanceSummary } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

export function CollaboratorFinanceSheet({ visible, propertyId, onClose, onChanged }: { visible: boolean; propertyId: string; onClose: () => void; onChanged: () => void }) {
  const { colors, isDark } = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [data, setData] = useState<CollaboratorFinanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState('');
  const expandedHeight = Math.max(360, windowHeight - 12);
  const collapsedHeight = Math.max(360, Math.min(windowHeight * 0.72, expandedHeight - 96));
  const sheetHeight = useRef(new Animated.Value(collapsedHeight)).current;
  const dragStart = useRef(collapsedHeight);
  const currentHeight = useRef(collapsedHeight);
  const collapsedRef = useRef(collapsedHeight);
  const expandedRef = useRef(expandedHeight);

  collapsedRef.current = collapsedHeight;
  expandedRef.current = expandedHeight;

  const animateTo = useCallback((value: number, after?: () => void) => {
    currentHeight.current = value;
    Animated.spring(sheetHeight, { toValue: value, damping: 22, stiffness: 210, mass: 0.82, useNativeDriver: false }).start(({ finished }) => { if (finished) after?.(); });
  }, [sheetHeight]);

  const closeByDrag = useCallback(() => {
    sheetHeight.stopAnimation();
    Animated.timing(sheetHeight, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      onClose();
      sheetHeight.setValue(collapsedRef.current);
      currentHeight.current = collapsedRef.current;
    });
  }, [onClose, sheetHeight]);

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => { sheetHeight.stopAnimation((value) => { dragStart.current = value; currentHeight.current = value; }); },
    onPanResponderMove: (_event, gesture) => {
      const next = Math.max(0, Math.min(expandedRef.current, dragStart.current - gesture.dy));
      currentHeight.current = next; sheetHeight.setValue(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 72 || gesture.vy > 0.8) { closeByDrag(); return; }
      if (gesture.dy < -50 || gesture.vy < -0.65) { animateTo(expandedRef.current); return; }
      const midpoint = (collapsedRef.current + expandedRef.current) / 2;
      animateTo(currentHeight.current >= midpoint ? expandedRef.current : collapsedRef.current);
    },
    onPanResponderTerminate: () => animateTo(currentHeight.current >= (collapsedRef.current + expandedRef.current) / 2 ? expandedRef.current : collapsedRef.current),
  })).current;

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true); setError('');
    try { setData(await apiRequest<CollaboratorFinanceSummary>(`/collaborator-finances?propertyId=${propertyId}`)); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Situația colaboratorilor nu a putut fi încărcată.'); }
    finally { setLoading(false); }
  }, [propertyId]);

  useEffect(() => { if (visible) { sheetHeight.setValue(collapsedHeight); currentHeight.current = collapsedHeight; void load(); } }, [collapsedHeight, load, sheetHeight, visible]);

  const setPaid = async (collaboratorId: string, clientId: string, paid: boolean) => {
    const key = `${collaboratorId}:${clientId}`; setUpdating(key);
    try {
      await apiRequest('/commissions/client-status', { method: 'PUT', body: JSON.stringify({ propertyId, collaboratorId, clientId, paid }) });
      await load(); onChanged();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Starea plății nu a putut fi actualizată.'); }
    finally { setUpdating(''); }
  };

  const summary = data ?? { paid: 0, due: 0, total: 0, collaborators: [] };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={closeByDrag} statusBarTranslucent>
    <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={closeByDrag}>
      <Animated.View style={[styles.sheet, { height: sheetHeight, backgroundColor: colors.background, borderColor: colors.border }]}>
      <Pressable style={styles.sheetBody} onPress={(event) => event.stopPropagation()}>
        <View {...panResponder.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Trage în sus pentru extindere sau în jos pentru închidere" style={styles.draggableHeader}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerCopy}><AppText variant="title">Colaboratori</AppText><AppText variant="caption" muted>Achitat și de achitat, pentru fiecare client</AppText></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Închide" onPress={closeByDrag} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={21} color={colors.text} /></Pressable>
        </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          <View style={styles.summary}>
            <SummaryMetric label="Total" value={summary.total} icon="wallet-outline" color={colors.primary} />
            <SummaryMetric label="Achitat" value={summary.paid} icon="checkmark-circle-outline" color={palette.success} />
            <SummaryMetric label="De achitat" value={summary.due} icon="time-outline" color={palette.warning} />
          </View>

          {error ? <View style={[styles.error, { backgroundColor: isDark ? `${palette.danger}18` : palette.dangerSoft }]}><Ionicons name="alert-circle" size={18} color={palette.danger} /><AppText variant="caption" style={{ color: palette.danger, flex: 1 }}>{error}</AppText></View> : null}
          {loading && !data ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><AppText muted>Se încarcă situația financiară…</AppText></View> : null}
          {!loading && data && !data.collaborators.length ? <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="people-circle-outline" size={34} color={colors.primary} /></View><AppText variant="heading">Nu există comisioane</AppText><AppText muted style={styles.center}>Comisioanele apar automat când o fișă este creată pentru un client atribuit unui colaborator.</AppText></View> : null}

          {summary.collaborators.map((collaborator, index) => {
            const accent = [palette.cyan, palette.purple, palette.warning, palette.electric][index % 4];
            return <Card key={collaborator.collaboratorId} style={[styles.collaborator, { borderColor: `${accent}70` }]}>
              <View style={styles.collaboratorHeader}>
                <View style={[styles.dot, { backgroundColor: accent }]} />
                <View style={styles.collaboratorCopy}><AppText variant="heading">{collaborator.collaboratorName}</AppText><AppText variant="caption" muted>{collaborator.role || 'Colaborator'}</AppText></View>
                <View style={[styles.totalBadge, { backgroundColor: isDark ? `${accent}20` : `${accent}12` }]}><AppText variant="label" style={{ color: accent }}>{formatCurrency(collaborator.total)}</AppText></View>
              </View>
              <View style={styles.collaboratorMetrics}>
                <MiniMetric label="Clienți" value={String(collaborator.clientsCount)} color={colors.text} />
                <MiniMetric label="Achitat" value={formatCurrency(collaborator.paid)} color={palette.success} />
                <MiniMetric label="De achitat" value={formatCurrency(collaborator.due)} color={palette.warning} />
              </View>
              <View style={styles.clients}>{collaborator.clients.map((client) => {
                const key = `${collaborator.collaboratorId}:${client.clientId}`; const hasDue = client.due > 0;
                return <View key={client.clientId} style={[styles.client, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                  <View style={styles.clientTop}><View style={styles.clientCopy}><AppText variant="label">{client.clientName}</AppText><AppText variant="caption" muted>{client.serviceSheetsCount} {client.serviceSheetsCount === 1 ? 'fișă' : 'fișe'} · {formatDate(client.lastActivityAt)}</AppText></View><View style={styles.amounts}><AppText variant="caption" style={{ color: palette.success, fontWeight: '800' }}>{formatCurrency(client.paid)} achitat</AppText><AppText variant="caption" style={{ color: palette.warning, fontWeight: '800' }}>{formatCurrency(client.due)} de achitat</AppText></View></View>
                  <Button compact variant={hasDue ? 'primary' : 'outline'} icon={hasDue ? 'checkmark-circle-outline' : 'arrow-undo-outline'} label={hasDue ? 'Marchează achitat' : 'Marchează neachitat'} loading={updating === key} onPress={() => void setPaid(collaborator.collaboratorId, client.clientId, hasDue)} />
                </View>;
              })}</View>
            </Card>;
          })}
        </ScrollView>
      </Pressable>
      </Animated.View>
    </Pressable>
  </Modal>;
}

function SummaryMetric({ label, value, icon, color }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  const { colors, isDark } = useAppTheme();
  return <View style={[styles.summaryMetric, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.summaryIcon, { backgroundColor: isDark ? `${color}22` : `${color}12` }]}><Ionicons name={icon} size={17} color={color} /></View><AppText variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color }}>{formatCurrency(value)}</AppText><AppText variant="caption" muted>{label}</AppText></View>;
}

function MiniMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={styles.miniMetric}><AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color }}>{value}</AppText><AppText variant="caption" muted>{label}</AppText></View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 720, alignSelf: 'center', borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  sheetBody: { flex: 1, minHeight: 0 },
  draggableHeader: { width: '100%', flexShrink: 0 },
  handle: { width: 48, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  header: { minHeight: 76, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerCopy: { minWidth: 0, flex: 1, gap: 2 },
  close: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 42, gap: spacing.lg },
  summary: { flexDirection: 'row', gap: spacing.sm },
  summaryMetric: { minWidth: 0, flex: 1, minHeight: 104, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, justifyContent: 'space-between' },
  summaryIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  error: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  empty: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xxl },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  collaborator: { gap: spacing.lg, borderWidth: 1.5 },
  collaboratorHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  collaboratorCopy: { minWidth: 0, flex: 1 },
  totalBadge: { minHeight: 34, borderRadius: radius.pill, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  collaboratorMetrics: { flexDirection: 'row', gap: spacing.sm },
  miniMetric: { minWidth: 0, flex: 1, alignItems: 'center', gap: 2 },
  clients: { gap: spacing.sm },
  client: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  clientTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  clientCopy: { minWidth: 0, flex: 1 },
  amounts: { alignItems: 'flex-end', gap: 2 },
});
