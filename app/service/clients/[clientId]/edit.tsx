import { ClientForm } from '@/components/clients/ClientForm';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useProperty } from '@/contexts/PropertyContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { clientRepository } from '@/repositories/api-repositories';
import { useLocalSearchParams } from 'expo-router';
export default function EditClientScreen() { const { clientId } = useLocalSearchParams<{ clientId: string }>(); const { activeProperty } = useProperty(); const state = useAsyncData(() => clientRepository.get(clientId), [clientId]); if (state.loading) return <Screen header={<AppHeader title="Editare client" back />}><LoadingState /></Screen>; if (state.error || !state.data) return <Screen header={<AppHeader title="Editare client" back />}><ErrorState message={state.error?.message ?? 'Client inexistent.'} /></Screen>; return <Screen header={<AppHeader title="Editare client" back />}><ClientForm propertyId={activeProperty?.id ?? ''} client={state.data} /></Screen>; }
