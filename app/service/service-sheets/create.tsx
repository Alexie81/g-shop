import { AppHeader } from '@/components/layout/AppHeader';
import { ServiceSheetForm } from '@/components/service-sheets/ServiceSheetForm';
import { Screen } from '@/components/ui/Screen';
import { useProperty } from '@/contexts/PropertyContext';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

export default function CreateServiceSheetScreen() {
  const { activeProperty } = useProperty();
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const cancelCreation = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/service/service-sheets');
  }, []);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelCreation();
      return true;
    });
    return () => subscription.remove();
  }, [cancelCreation]));

  return <Screen header={<AppHeader title="Fișă de service nouă" back onBack={cancelCreation} />}>
    <ServiceSheetForm propertyId={activeProperty?.id ?? ''} clientId={clientId} />
  </Screen>;
}
