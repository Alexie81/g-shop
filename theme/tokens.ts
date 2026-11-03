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
  brandGradient: readonly [string, string, ...string[]];
  brandText: string;
  brandDecoration: string;
  brandAccent: string;
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
  brandGradient: ['#082376', '#075CFF', '#0D78FF'],
  brandText: '#DDE8FF',
  brandDecoration: '#8CB7FF',
  brandAccent: palette.electric,
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
  brandGradient: ['#082376', '#075CFF', '#0D78FF'],
  brandText: '#DDE8FF',
  brandDecoration: '#8CB7FF',
  brandAccent: palette.electric,
};

export const cleaningLightColors: ThemeColors = {
  ...lightColors,
  background: '#FFF9F4',
  surfaceMuted: '#FFF0E5',
  text: '#291B14',
  textMuted: '#796352',
  border: '#EEDDD1',
  primary: '#C2410C',
  primarySoft: '#FFEDD5',
  shadow: '#6F2F13',
  input: '#FFF3E9',
  overlay: 'rgba(35, 17, 7, 0.48)',
  brandGradient: ['#7C2D12', '#C2410C', '#EA580C'],
  brandText: '#FFEDD5',
  brandDecoration: '#FDBA74',
  brandAccent: '#C2410C',
};

export const cleaningDarkColors: ThemeColors = {
  ...darkColors,
  background: '#120D0A',
  surface: '#211813',
  surfaceElevated: '#2B1D16',
  surfaceMuted: '#342219',
  text: '#FFF8F0',
  textMuted: '#CBB3A0',
  border: '#533321',
  primary: '#D04A0C',
  primarySoft: '#492310',
  tabBar: '#211813',
  input: '#2C1D15',
  brandGradient: ['#431A0C', '#9A3412', '#C2410C'],
  brandText: '#FFE7D3',
  brandDecoration: '#FDBA74',
  brandAccent: '#D04A0C',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

export function resolveColors(scheme: ColorSchemeName): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}
