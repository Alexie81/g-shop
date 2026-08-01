import { darkColors, lightColors, ThemeColors } from '@/theme/tokens';
import { preferenceStorage } from '@/services/storage';
import { ThemePreference } from '@/types';
import * as SystemUI from 'expo-system-ui';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => Promise<void>;
  isDark: boolean;
  colors: ThemeColors;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';
  const colors = isDark ? darkColors : lightColors;

  useEffect(() => {
    preferenceStorage.get('theme').then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') setPreferenceState(saved);
    }).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    isDark,
    colors,
    ready,
    setPreference: async (next) => {
      setPreferenceState(next);
      await preferenceStorage.set('theme', next);
    },
  }), [colors, isDark, preference, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}
