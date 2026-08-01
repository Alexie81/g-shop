import { useAppTheme } from '@/contexts/ThemeContext';
import { Text, TextProps, TextStyle } from 'react-native';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'caption' | 'label';
const variants: Record<Variant, TextStyle> = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 23, lineHeight: 29, fontWeight: '800', letterSpacing: -0.4 },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
};

export function AppText({ variant = 'body', muted, style, ...props }: TextProps & { variant?: Variant; muted?: boolean }) {
  const { colors } = useAppTheme();
  return <Text {...props} style={[variants[variant], { color: muted ? colors.textMuted : colors.text }, style]} />;
}
