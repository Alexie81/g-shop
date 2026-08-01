import { useAppTheme } from '@/contexts/ThemeContext';
import { spacing } from '@/theme/tokens';
import { PropsWithChildren, ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({ children, scroll = true, refreshing = false, onRefresh, style, bottomInset = true, header }:
  PropsWithChildren<{ scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; style?: StyleProp<ViewStyle>; bottomInset?: boolean; header?: ReactNode }>) {
  const { colors } = useAppTheme();
  const content = <View style={[styles.content, !bottomInset && { paddingBottom: spacing.lg }, style]}>{children}</View>;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
      {header}
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { flexGrow: 1 }, content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.lg, paddingBottom: 112 } });
