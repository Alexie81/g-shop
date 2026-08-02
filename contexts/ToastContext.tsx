import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastType = 'success' | 'error' | 'info';
type ToastContextValue = { showToast: (message: string, type?: ToastType) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const translate = useRef(new Animated.Value(-120)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  }, []);
  const dismiss = useCallback(() => {
    clearDismissTimer();
    translate.stopAnimation();
    Animated.timing(translate, { toValue: -140, duration: 190, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [clearDismissTimer, translate]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    clearDismissTimer();
    setToast({ message, type });
    translate.stopAnimation();
    translate.setValue(-120);
    Animated.spring(translate, { toValue: 0, damping: 17, stiffness: 210, mass: 0.8, useNativeDriver: true }).start(({ finished }) => {
      if (finished) dismissTimer.current = setTimeout(dismiss, 2600);
    });
  }, [clearDismissTimer, dismiss, translate]);

  useEffect(() => () => { clearDismissTimer(); translate.stopAnimation(); }, [clearDismissTimer, translate]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy < -3 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => gesture.dy < -3 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => { clearDismissTimer(); translate.stopAnimation(); },
    onPanResponderMove: (_event, gesture) => translate.setValue(Math.min(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy < -34 || gesture.vy < -0.45) { dismiss(); return; }
      Animated.spring(translate, { toValue: 0, damping: 18, stiffness: 220, mass: 0.8, useNativeDriver: true }).start(({ finished }) => {
        if (finished) dismissTimer.current = setTimeout(dismiss, 1800);
      });
    },
    onPanResponderTerminate: () => Animated.spring(translate, { toValue: 0, damping: 18, stiffness: 220, mass: 0.8, useNativeDriver: true }).start(({ finished }) => {
      if (finished) dismissTimer.current = setTimeout(dismiss, 1800);
    }),
  }), [clearDismissTimer, dismiss, translate]);

  const value = useMemo(() => ({ showToast }), [showToast]);
  const tone = toast?.type === 'success' ? palette.success : toast?.type === 'error' ? palette.danger : palette.electric;
  const icon = toast?.type === 'success' ? 'checkmark-circle' : toast?.type === 'error' ? 'alert-circle' : 'information-circle';

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View {...panResponder.panHandlers} accessibilityRole="alert" accessibilityLabel={`${toast.message}. Trage în sus pentru a închide.`} style={[styles.toast, { top: insets.top + 8, backgroundColor: tone, transform: [{ translateY: translate }] }]}>
          <Ionicons name={icon} size={21} color="#fff" />
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', zIndex: 1000, alignSelf: 'center', width: '90%', maxWidth: 520, minHeight: 52, borderRadius: radius.md, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  text: { color: '#fff', flex: 1, fontWeight: '700', fontSize: 14 },
});
