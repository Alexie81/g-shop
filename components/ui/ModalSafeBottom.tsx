import { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function ModalSafeBottom({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  const insets = useSafeAreaInsets();
  const flattened = StyleSheet.flatten(style);
  const currentPadding = Number(flattened?.paddingBottom ?? flattened?.paddingVertical ?? flattened?.padding ?? 0);
  return <View {...props} style={[styles.root, style, { paddingBottom: Math.max(currentPadding, insets.bottom) }]}>{children}</View>;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
