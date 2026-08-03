import { AppHeader } from '@/components/layout/AppHeader';
import { ServiceSheetForm } from '@/components/service-sheets/ServiceSheetForm';
import { Screen } from '@/components/ui/Screen';
import { useProperty } from '@/contexts/PropertyContext';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler } from 'react-native';

export default function CreateServiceSheetScreen() {
  const { activeProperty } = useProperty();
  const { clientId, returnTo } = useLocalSearchParams<{ clientId?: string; returnTo?: string }>();
  const [formVersion, setFormVersion] = useState(0);
  const cancelCreation = useCallback(() => {
    setFormVersion((current) => current + 1);
    const destination = typeof returnTo === 'string'
      && returnTo.startsWith('/service/')
      && !returnTo.startsWith('/service/service-sheets/create')
      ? returnTo
      : '/service/service-sheets';
    router.replace(destination as never);
  }, [returnTo]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelCreation();
      return true;
    });
    return () => subscription.remove();
  }, [cancelCreation]));

  return <Screen header={<AppHeader title="Fișă de service nouă" back onBack={cancelCreation} />}>
    <ServiceSheetForm key={formVersion} propertyId={activeProperty?.id ?? ''} clientId={clientId} />
  </Screen>;
}
