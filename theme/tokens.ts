import { ColorSchemeName } from 'react-native';

export const palette = {
  electric: '#075CFF',
  electricLight: '#EAF1FF',
  electricDark: '#0646C8',
  navy: '#07152D',
  navyDeep: '#040C1A',
  navyCard: '#0C1D35',
  success: '#14A83B',
  successSoft: '#E9F9ED',
  warning: '#FF9F0A',
  warningSoft: '#FFF4DE',
  danger: '#E7354C',
  dangerSoft: '#FDECEF',
  purple: '#7C3AED',
  cyan: '#05A7C4',
  white: '#FFFFFF',
  ink: '#071534',
  slate: '#62718A',
  line: '#E4EAF3',
  canvas: '#F5F8FD',
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primarySoft: string;
  tabBar: string;
  shadow: string;
  input: string;
  overlay: string;
};

export const lightColors: ThemeColors = {
  background: palette.canvas,
  surface: palette.white,
  surfaceElevated: palette.white,
  surfaceMuted: '#EEF3FA',
  text: palette.ink,
  textMuted: palette.slate,
  border: palette.line,
  primary: palette.electric,
  primarySoft: palette.electricLight,
  tabBar: '#FFFFFF',
  shadow: '#17305A',
  input: '#F0F4FA',
  overlay: 'rgba(4, 12, 26, 0.48)',
};

export const darkColors: ThemeColors = {
  background: palette.navyDeep,
  surface: palette.navy,
  surfaceElevated: palette.navyCard,
  surfaceMuted: '#102541',
  text: '#F8FAFF',
  textMuted: '#9CACBF',
  border: '#1C3657',
  primary: '#2F79FF',
  primarySoft: '#0B2D69',
  tabBar: '#07162A',
  shadow: '#000000',
  input: '#0D203A',
  overlay: 'rgba(0, 0, 0, 0.68)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

export function resolveColors(scheme: ColorSchemeName): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}
