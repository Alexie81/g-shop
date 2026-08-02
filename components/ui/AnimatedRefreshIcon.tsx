import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

export function AnimatedRefreshIcon({ refreshing, color, size = 20 }: { refreshing: boolean; color: string; size?: number }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const startedAt = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }

    if (refreshing) {
      if (animation.current) return;
      startedAt.current = Date.now();
      rotation.setValue(0);
      animation.current = Animated.loop(Animated.timing(rotation, {
        toValue: 1,
        duration: 760,
        easing: Easing.linear,
        useNativeDriver: true,
      }));
      animation.current.start();
      return;
    }

    if (!animation.current) return;
    const remaining = Math.max(0, 760 - (Date.now() - startedAt.current));
    stopTimer.current = setTimeout(() => {
      animation.current?.stop();
      animation.current = null;
      rotation.setValue(0);
      stopTimer.current = null;
    }, remaining);
  }, [refreshing, rotation]);

  useEffect(() => () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    animation.current?.stop();
  }, []);

  return <Animated.View
    style={[
      styles.icon,
      { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
    ]}
  >
    <Ionicons name="refresh" size={size} color={color} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center' },
});
