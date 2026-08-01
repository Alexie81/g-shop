import { AppHeader } from '@/components/layout/AppHeader';
import { UserForm } from '@/components/users/UserForm';
import { Screen } from '@/components/ui/Screen';
import { useProperty } from '@/contexts/PropertyContext';
import { router } from 'expo-router';
export default function CreateUser() { const { activeProperty } = useProperty(); return <Screen header={<AppHeader title="Utilizator nou" back onBack={() => router.replace('/service/users')} />}><UserForm propertyId={activeProperty?.id ?? ''} /></Screen>; }
