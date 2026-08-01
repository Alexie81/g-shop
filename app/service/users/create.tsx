import { AppHeader } from '@/components/layout/AppHeader';
import { UserForm } from '@/components/users/UserForm';
import { Screen } from '@/components/ui/Screen';
import { useProperty } from '@/contexts/PropertyContext';
export default function CreateUser() { const { activeProperty } = useProperty(); return <Screen header={<AppHeader title="Utilizator nou" back />}><UserForm propertyId={activeProperty?.id ?? ''} /></Screen>; }
