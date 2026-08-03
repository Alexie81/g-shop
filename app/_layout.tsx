import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationCoordinator } from '@/components/notifications/NotificationCoordinator';
import { AppUpdateCoordinator } from '@/components/updates/AppUpdateCoordinator';
import { PropertyProvider } from '@/contexts/PropertyContext';
import { ThemeProvider, useAppTheme } from '@/contexts/ThemeContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

void SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { isDark, ready } = useAppTheme();
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => undefined); }, [ready]);
  return <>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
  </>;
}

export default function RootLayout() {
  return <SafeAreaProvider><ThemeProvider><AuthProvider><PropertyProvider><ToastProvider><NotificationCoordinator /><AppUpdateCoordinator /><Navigation /></ToastProvider></PropertyProvider></AuthProvider></ThemeProvider></SafeAreaProvider>;
}
