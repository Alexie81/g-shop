import { AppText } from '@/components/ui/AppText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Image, StyleSheet, View } from 'react-native';

export function RouteLoader() {
  const { colors } = useAppTheme();
  return <View style={[styles.container, { backgroundColor: colors.background }]}><Image source={require('@/logo/logo.png')} style={styles.logo} /><AppText variant="label" muted>Se pregătește workspace-ul…</AppText></View>;
}
const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }, logo: { width: 84, height: 84, borderRadius: 22 } });
