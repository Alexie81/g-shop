import { InterventionForm } from '@/components/interventions/InterventionForm';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { useProperty } from '@/contexts/PropertyContext';
import { useLocalSearchParams } from 'expo-router';
export default function CreateIntervention() { const { activeProperty } = useProperty(); const { clientId } = useLocalSearchParams<{ clientId?: string }>(); return <Screen header={<AppHeader title="Intervenție nouă" back />}><InterventionForm propertyId={activeProperty?.id ?? ''} initialClientId={clientId} /></Screen>; }
