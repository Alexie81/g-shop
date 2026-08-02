import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { whatsAppMessageRepository } from '@/repositories/api-repositories';
import { radius, spacing } from '@/theme/tokens';
import { Client, WhatsAppMessage } from '@/types';
import { fullName, normalizePhoneForWhatsApp } from '@/utils/format';
import { renderWhatsAppMessage } from '@/utils/whatsapp-messages';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, Modal, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

export function WhatsAppQuickMessagesModal({ visible, client, propertyName, messages, onClose }: {
  visible: boolean;
  client: Client;
  propertyName: string;
  messages: WhatsAppMessage[];
  onClose: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const mobile = width < 620;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const selected = useMemo(() => messages.find((item) => item.id === selectedId) ?? null, [messages, selectedId]);
  const preview = selected ? renderWhatsAppMessage(selected.message, client, propertyName) : '';

  useEffect(() => {
    if (visible) { setSelectedId(messages[0]?.id ?? null); translateY.setValue(0); }
  }, [messages, translateY, visible]);

  const closeByDrag = useCallback(() => {
    Animated.timing(translateY, { toValue: 720, duration: 230, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      translateY.setValue(0);
      onClose();
    });
  }, [onClose, translateY]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 76 || gesture.vy > 0.65) { closeByDrag(); return; }
      Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 230, mass: 0.8, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 230, mass: 0.8, useNativeDriver: true }).start(),
  }), [closeByDrag, translateY]);

  const choose = (id: string | null) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedId(id);
  };
  const openWhatsApp = async () => {
    const phone = normalizePhoneForWhatsApp(client.phone);
    if (!phone) return showToast('Clientul nu are un număr de telefon valid.', 'error');
    const url = `https://wa.me/${phone}${preview ? `?text=${encodeURIComponent(preview)}` : ''}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) return showToast('WhatsApp nu este disponibil pe acest dispozitiv.', 'error');
      await Linking.openURL(url);
      if (selected) void whatsAppMessageRepository.recordUse(selected.id, client.id).catch(() => undefined);
      onClose();
    } catch { showToast('WhatsApp nu a putut fi deschis.', 'error'); }
  };

  return <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
    <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <Pressable accessibilityLabel="Închide mesajele WhatsApp" style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View style={[styles.sheet, mobile && styles.sheetMobile, { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ translateY }] }]}>
        <View {...panResponder.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Trage în jos pentru a închide" style={styles.draggableHeader}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={styles.whatsAppIcon}><Ionicons name="logo-whatsapp" size={29} color="#fff" /></View>
            <View style={styles.headerCopy}><AppText variant="title">Mesaj rapid</AppText><AppText variant="caption" muted numberOfLines={1}>Către {fullName(client)} · {client.phone}</AppText></View>
            <Pressable accessibilityLabel="Închide" onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
          </View>
        </View>

        <AppText variant="label">Alege unul dintre mesajele contului tău</AppText>
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {messages.map((item) => {
            const active = item.id === selectedId;
            return <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => choose(item.id)} style={({ pressed }) => [styles.option, { backgroundColor: active ? (isDark ? '#063B2A' : '#EAFBF2') : colors.surfaceMuted, borderColor: active ? '#25D366' : colors.border, opacity: pressed ? 0.78 : 1 }]}>
              <View style={[styles.optionCheck, { backgroundColor: active ? '#25D366' : colors.surface, borderColor: active ? '#25D366' : colors.border }]}>{active ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}</View>
              <View style={styles.optionCopy}><AppText variant="label">{item.title}</AppText><AppText variant="caption" muted numberOfLines={2}>{renderWhatsAppMessage(item.message, client, propertyName)}</AppText></View>
            </Pressable>;
          })}
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: selectedId === null }} onPress={() => choose(null)} style={({ pressed }) => [styles.option, { backgroundColor: selectedId === null ? colors.primarySoft : colors.surfaceMuted, borderColor: selectedId === null ? colors.primary : colors.border, opacity: pressed ? 0.78 : 1 }]}>
            <View style={[styles.optionCheck, { backgroundColor: selectedId === null ? colors.primary : colors.surface, borderColor: selectedId === null ? colors.primary : colors.border }]}>{selectedId === null ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}</View>
            <View style={styles.optionCopy}><AppText variant="label">Conversație fără mesaj</AppText><AppText variant="caption" muted>Deschide WhatsApp și scrie mesajul manual.</AppText></View>
          </Pressable>
        </ScrollView>

        {selected ? <View style={[styles.preview, { backgroundColor: isDark ? '#071C17' : '#F4FBF7', borderColor: isDark ? '#17553B' : '#CFEEDD' }]}><View style={styles.previewTop}><Ionicons name="chatbubble-ellipses-outline" size={17} color="#18A957" /><AppText variant="caption" style={styles.previewLabel}>PREVIZUALIZARE</AppText></View><AppText style={styles.previewText}>{preview}</AppText></View> : null}
        {!messages.length ? <View style={[styles.empty, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="chatbox-ellipses-outline" size={27} color={colors.textMuted} /><View style={styles.emptyCopy}><AppText variant="label">Nu ai mesaje predefinite</AppText><AppText variant="caption" muted>Le poți crea din Mai mult → Mesaje WhatsApp.</AppText></View></View> : null}

        <Button label="Deschide WhatsApp" icon="logo-whatsapp" onPress={() => void openWhatsApp()} style={styles.sendButton} />
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '94%', maxWidth: 680, maxHeight: '92%', borderWidth: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: spacing.xl, gap: spacing.lg },
  sheetMobile: { width: '100%', paddingHorizontal: spacing.lg }, draggableHeader: { marginHorizontal: -spacing.lg, marginTop: -spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md }, handle: { width: 46, height: 5, borderRadius: radius.pill, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, whatsAppIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', shadowColor: '#075E54', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 }, headerCopy: { minWidth: 0, flex: 1 }, close: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  listScroll: { flexGrow: 0, maxHeight: 290 }, list: { gap: spacing.sm, paddingBottom: spacing.xs }, option: { minHeight: 74, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, optionCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, optionCopy: { minWidth: 0, flex: 1, gap: 3 },
  preview: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }, previewTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, previewLabel: { color: '#14984E', fontWeight: '900', letterSpacing: 0.8 }, previewText: { lineHeight: 21 },
  empty: { minHeight: 76, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, emptyCopy: { minWidth: 0, flex: 1, gap: 3 }, sendButton: { width: '100%', backgroundColor: '#18B95D' },
});
