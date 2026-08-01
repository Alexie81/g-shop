import { palette, radius, spacing } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastType = 'success' | 'error' | 'info';
type ToastContextValue = { showToast: (message: string, type?: ToastType) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const translate = useRef(new Animated.Value(-120)).current;
  const insets = useSafeAreaInsets();

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type });
    translate.stopAnimation();
    Animated.sequence([
      Animated.spring(translate, { toValue: 0, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(translate, { toValue: -120, duration: 220, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [translate]);

  const value = useMemo(() => ({ showToast }), [showToast]);
  const tone = toast?.type === 'success' ? palette.success : toast?.type === 'error' ? palette.danger : palette.electric;
  const icon = toast?.type === 'success' ? 'checkmark-circle' : toast?.type === 'error' ? 'alert-circle' : 'information-circle';

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View style={[styles.toast, { top: insets.top + 8, backgroundColor: tone, transform: [{ translateY: translate }] }]}>
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
