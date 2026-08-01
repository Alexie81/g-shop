import { ClientForm } from '@/components/clients/ClientForm';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { useProperty } from '@/contexts/PropertyContext';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

export default function CreateClientScreen() {
  const { activeProperty } = useProperty();
  const cancelCreation = useCallback(() => router.replace('/service/clients'), []);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelCreation();
      return true;
    });
    return () => subscription.remove();
  }, [cancelCreation]));

  return <Screen header={<AppHeader title="Client nou" back onBack={cancelCreation} />}>
    <AppText muted>Completează datele clientului. Codul QR este creat automat la salvare.</AppText>
    <ClientForm propertyId={activeProperty?.id ?? ''} />
  </Screen>;
}
