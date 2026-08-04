import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  FocusEvent,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  UIManager,
  View,
} from 'react-native';

const DEFAULT_KEYBOARD_GAP = 12;
const REVEAL_DELAYS = Platform.OS === 'android' ? [40, 180, 320] : [20, 120];

type Props = ScrollViewProps & {
  keyboardGap?: number;
};

/**
 * ScrollView care păstrează automat inputul activ complet vizibil deasupra tastaturii.
 * Măsurarea se face în coordonatele ferestrei, deci funcționează și în bottom-sheet-uri,
 * nu doar în ecranele care ocupă întreaga înălțime.
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, Props>(function KeyboardAwareScrollView({
  automaticallyAdjustKeyboardInsets,
  children,
  contentContainerStyle,
  keyboardDismissMode,
  keyboardGap = DEFAULT_KEYBOARD_GAP,
  keyboardShouldPersistTaps,
  onFocus,
  onScroll,
  scrollEventThrottle,
  ...props
}, forwardedRef) {
  const scrollRef = useRef<ScrollView>(null);
  const focusedTargetRef = useRef<number | null>(null);
  const scrollYRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useImperativeHandle(forwardedRef, () => scrollRef.current as ScrollView, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const revealFocusedInput = useCallback(() => {
    const target = focusedTargetRef.current;
    const scroll = scrollRef.current;
    const keyboard = Keyboard.metrics();
    if (!target || !scroll || !keyboard || keyboard.height <= 0) return;

    UIManager.measureInWindow(target, (_inputX, inputY, _inputWidth, inputHeight) => {
      const nativeScroll = scroll.getNativeScrollRef();
      if (!nativeScroll) return;
      nativeScroll.measureInWindow((_scrollX, scrollY, _scrollWidth, scrollHeight) => {
        const visibleTop = scrollY + keyboardGap;
        const visibleBottom = Math.min(scrollY + scrollHeight, keyboard.screenY) - keyboardGap;
        const inputBottom = inputY + inputHeight;
        let delta = 0;

        if (inputBottom > visibleBottom) delta = inputBottom - visibleBottom;
        else if (inputY < visibleTop) delta = inputY - visibleTop;

        if (Math.abs(delta) < 1) return;
        scroll.scrollTo({ y: Math.max(0, scrollYRef.current + delta), animated: true });
      });
    });
  }, [keyboardGap]);

  const updateKeyboardInset = useCallback(() => {
    const scroll = scrollRef.current;
    const keyboard = Keyboard.metrics();
    const nativeScroll = scroll?.getNativeScrollRef();
    if (!nativeScroll || !keyboard || keyboard.height <= 0) {
      setKeyboardInset(0);
      return;
    }

    nativeScroll.measureInWindow((_scrollX, scrollY, _scrollWidth, scrollHeight) => {
      const coveredHeight = Math.max(0, scrollY + scrollHeight - keyboard.screenY);
      setKeyboardInset(coveredHeight > 0 ? Math.ceil(coveredHeight + keyboardGap) : 0);
    });
  }, [keyboardGap]);

  const scheduleReveal = useCallback(() => {
    clearTimers();
    timersRef.current = REVEAL_DELAYS.flatMap((delay) => [
      setTimeout(updateKeyboardInset, delay),
      setTimeout(revealFocusedInput, delay + 36),
    ]);
  }, [clearTimers, revealFocusedInput, updateKeyboardInset]);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', scheduleReveal);
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      clearTimers();
      setKeyboardInset(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
      clearTimers();
    };
  }, [clearTimers, scheduleReveal]);

  const handleFocus = useCallback((event: FocusEvent) => {
    focusedTargetRef.current = event.nativeEvent.target;
    onFocus?.(event);
    scheduleReveal();
  }, [onFocus, scheduleReveal]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  }, [onScroll]);

  return <ScrollView
    ref={scrollRef}
    {...props}
    automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets ?? Platform.OS === 'ios'}
    contentContainerStyle={contentContainerStyle}
    keyboardDismissMode={keyboardDismissMode ?? (Platform.OS === 'ios' ? 'interactive' : 'on-drag')}
    keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
    onFocus={handleFocus}
    onScroll={handleScroll}
    scrollEventThrottle={scrollEventThrottle ?? 16}
  >
    {children}
    {keyboardInset > 0 ? <View pointerEvents="none" style={{ height: keyboardInset }} /> : null}
  </ScrollView>;
});
