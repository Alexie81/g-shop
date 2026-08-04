import { AppHeader } from '@/components/layout/AppHeader';
import { UserForm } from '@/components/users/UserForm';
import { Screen } from '@/components/ui/Screen';
import { ErrorState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { router } from 'expo-router';

export default function CreateUser() {
  const { hasPermission } = useAuth();
  const { activeProperty } = useProperty();
  const back = () => router.replace('/service/users');
  return <Screen header={<AppHeader title="Utilizator nou" back onBack={back} />}>
    {hasPermission('users.manage')
      ? <UserForm propertyId={activeProperty?.id ?? ''} />
      : <ErrorState message="Nu ai permisiunea «Gestionează utilizatori»." />}
  </Screen>;
}
