import { AppHeader } from '@/components/layout/AppHeader';
import { ServiceSheetForm } from '@/components/service-sheets/ServiceSheetForm';
import { Screen } from '@/components/ui/Screen';
import { useProperty } from '@/contexts/PropertyContext';
import { useLocalSearchParams } from 'expo-router';
export default function CreateServiceSheetScreen() { const { activeProperty } = useProperty(); const { clientId } = useLocalSearchParams<{ clientId?: string }>(); return <Screen header={<AppHeader title="Fișă de service nouă" back />}><ServiceSheetForm propertyId={activeProperty?.id ?? ''} clientId={clientId} /></Screen>; }
