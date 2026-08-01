import { useAuth } from '@/contexts/AuthContext';
import { Redirect, Stack } from 'expo-router';

export default function AuthLayout() {
  const { user, ready, requiresPropertySelection } = useAuth();
  if (ready && user) return <Redirect href={requiresPropertySelection ? '/select-property' : '/'} />;
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
