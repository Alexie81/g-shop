import { cleaningDarkColors, cleaningLightColors, darkColors, lightColors, ThemeColors } from '@/theme/tokens';
import { useProperty } from '@/contexts/PropertyContext';
import { isCleaningProperty } from '@/utils/property';
import { preferenceStorage } from '@/services/storage';
import { ThemePreference } from '@/types';
import * as SystemUI from 'expo-system-ui';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => Promise<void>;
  isDark: boolean;
  isCleaning: boolean;
  colors: ThemeColors;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const { activeProperty } = useProperty();
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';
  const isCleaning = isCleaningProperty(activeProperty);
  const colors = isCleaning ? (isDark ? cleaningDarkColors : cleaningLightColors) : (isDark ? darkColors : lightColors);

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
    isCleaning,
    colors,
    ready,
    setPreference: async (next) => {
      setPreferenceState(next);
      await preferenceStorage.set('theme', next);
    },
  }), [colors, isCleaning, isDark, preference, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}
