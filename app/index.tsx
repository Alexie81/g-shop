import { RouteLoader } from '@/components/layout/RouteLoader';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { Redirect } from 'expo-router';

export default function Index() {
  const { user, ready } = useAuth();
  const { activeProperty, loading } = useProperty();
  if (!ready || (user && loading)) return <RouteLoader />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!activeProperty) return <Redirect href="/select-property" />;
  return <Redirect href={activeProperty.type === 'SERVICE' ? '/service/dashboard' : '/shop/home'} />;
}
