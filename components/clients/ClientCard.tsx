import { AppText } from '@/components/ui/AppText';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radius, spacing } from '@/theme/tokens';
import { Client } from '@/types';
import { formatDate, fullName, initials } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

const avatarColors = [palette.electric, palette.purple, palette.success, palette.warning, palette.cyan];
const SWIPE_LIMIT = 92;
const SWIPE_TRIGGER = 52;
const FLING_TRIGGER = 30;

function hasHorizontalIntent(dx: number, dy: number) {
  const horizontal = Math.abs(dx);
  const vertical = Math.abs(dy);
  return horizontal > 12 && horizontal > vertical * 1.35;
}

type ClientCardProps = {
  client: Client;
  index?: number;
  onWhatsApp?: (client: Client) => void;
  onDeleteRequest?: (client: Client) => void;
};

export function ClientCard({ client, index = 0, onWhatsApp, onDeleteRequest }: ClientCardProps) {
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 640;
  const compact = width < 390;
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeStarted = useRef(false);
  const accent = avatarColors[index % avatarColors.length];
  const finalized = client.status === 'FINALIZED';
  const statusColor = finalized ? palette.success : palette.danger;

  const resetPosition = useCallback((onComplete?: () => void) => Animated.spring(translateX, {
    toValue: 0,
    useNativeDriver: true,
    speed: 24,
    bounciness: 5,
  }).start(() => onComplete?.()), [translateX]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => hasHorizontalIntent(gesture.dx, gesture.dy),
    onMoveShouldSetPanResponderCapture: (_, gesture) => hasHorizontalIntent(gesture.dx, gesture.dy),
    onPanResponderGrant: () => {
      swipeStarted.current = true;
      translateX.stopAnimation();
    },
    onPanResponderMove: (_, gesture) => {
      translateX.setValue(Math.max(-SWIPE_LIMIT, Math.min(SWIPE_LIMIT, gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      const swipedRight = gesture.dx >= SWIPE_TRIGGER || (gesture.dx >= FLING_TRIGGER && gesture.vx >= 0.45);
      const swipedLeft = gesture.dx <= -SWIPE_TRIGGER || (gesture.dx <= -FLING_TRIGGER && gesture.vx <= -0.45);
      const action = swipedRight
        ? () => onWhatsApp?.(client)
        : swipedLeft
          ? () => onDeleteRequest?.(client)
          : undefined;
      resetPosition(() => { swipeStarted.current = false; });
      action?.();
    },
    onPanResponderTerminate: () => {
      resetPosition(() => { swipeStarted.current = false; });
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), [client, onDeleteRequest, onWhatsApp, resetPosition, translateX]);

  const openDetails = () => {
    if (!swipeStarted.current) router.push(`/service/clients/${client.id}`);
  };

  return <View style={[styles.swipeShell, mobile && styles.swipeShellMobile, { backgroundColor: colors.surfaceMuted }]}>
    <View style={styles.swipeActions} pointerEvents="none">
      <View style={[styles.swipeAction, styles.whatsAppAction]}>
        <Ionicons name="logo-whatsapp" size={25} color="#fff" />
        <AppText variant="caption" style={styles.actionText}>WhatsApp</AppText>
      </View>
      <View style={[styles.swipeAction, styles.deleteAction]}>
        <Ionicons name="trash-outline" size={24} color="#fff" />
        <AppText variant="caption" style={styles.actionText}>Șterge</AppText>
      </View>
    </View>

    <Animated.View
      {...panResponder.panHandlers}
      style={[styles.animatedCard, mobile && styles.fullWidth, {
        backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
        borderColor: colors.border,
        shadowColor: colors.shadow,
        transform: [{ translateX }],
      }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${fullName(client)}, ${client.phone}, ${finalized ? 'finalizat' : 'activ'}`}
        accessibilityHint="Deschide detaliile. Glisează spre dreapta pentru WhatsApp sau spre stânga pentru ștergere."
        accessibilityActions={[
          { name: 'activate', label: 'Deschide detaliile clientului' },
          { name: 'whatsapp', label: 'Deschide WhatsApp' },
          { name: 'delete', label: 'Solicită ștergerea clientului' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'whatsapp') onWhatsApp?.(client);
          else if (event.nativeEvent.actionName === 'delete') onDeleteRequest?.(client);
          else if (event.nativeEvent.actionName === 'activate') openDetails();
        }}
        onPress={openDetails}
        style={({ pressed }) => [styles.pressable, mobile && styles.fullWidth, compact && styles.pressableCompact, pressed && styles.pressed]}
      >
        <View style={[styles.accent, { backgroundColor: statusColor }]} />
        <View style={[styles.avatar, compact && styles.avatarCompact, { backgroundColor: `${accent}${isDark ? '35' : '18'}` }]}>
          <AppText variant="heading" style={{ color: accent }}>{initials(client.firstName, client.lastName)}</AppText>
        </View>

        <View style={styles.main}>
          <View style={styles.heading}>
            <AppText variant="heading" numberOfLines={1} style={styles.name}>{fullName(client)}</AppText>
            <ClientStatusBadge status={client.status} />
          </View>

          <View style={styles.detailLine}>
            <Ionicons name="call-outline" size={15} color={colors.textMuted} />
            <AppText variant="caption" muted numberOfLines={1} style={styles.detailText}>{client.phone}</AppText>
          </View>
          <View style={styles.detailLine}>
            <Ionicons name="calendar-clear-outline" size={14} color={colors.textMuted} />
            <AppText variant="caption" muted numberOfLines={1} style={styles.detailText}>Adăugat {formatDate(client.createdAt)}</AppText>
          </View>
        </View>

        <View style={[styles.chevron, compact && styles.chevronCompact, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </View>
      </Pressable>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  swipeShell: {
    flexGrow: 1,
    flexBasis: 410,
    maxWidth: '100%',
    minWidth: 0,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  swipeShellMobile: { width: '100%', maxWidth: '100%', flexBasis: '100%' },
  swipeActions: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  swipeAction: {
    width: SWIPE_LIMIT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  whatsAppAction: { backgroundColor: '#16A34A' },
  deleteAction: { backgroundColor: palette.danger },
  actionText: { color: '#fff', fontWeight: '800' },
  animatedCard: {
    minWidth: 0,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: radius.xl,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    shadowOpacity: 0.07,
    elevation: 2,
  },
  pressable: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    minHeight: 106,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    overflow: 'hidden',
  },
  fullWidth: { width: '100%', maxWidth: '100%' },
  pressableCompact: { gap: spacing.sm },
  pressed: { opacity: 0.82 },
  accent: {
    position: 'absolute',
    top: spacing.lg,
    bottom: spacing.lg,
    left: 0,
    width: 4,
    borderTopRightRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCompact: { width: 46, height: 46, borderRadius: radius.md },
  main: { flex: 1, minWidth: 0, gap: 6 },
  heading: { minHeight: 27, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  name: { flexGrow: 1, flexShrink: 1 },
  detailLine: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailText: { flexShrink: 1 },
  chevron: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  chevronCompact: { display: 'none' },
});
