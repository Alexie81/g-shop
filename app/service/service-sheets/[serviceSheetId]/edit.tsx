import { AppHeader } from '@/components/layout/AppHeader';
import { ServiceSheetForm } from '@/components/service-sheets/ServiceSheetForm';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { serviceSheetRepository } from '@/repositories/api-repositories';
import { useLocalSearchParams } from 'expo-router';

export default function EditServiceSheetScreen() {
  const { serviceSheetId } = useLocalSearchParams<{ serviceSheetId: string }>();
  const state = useAsyncData(() => serviceSheetRepository.get(serviceSheetId), [serviceSheetId]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);

  if (state.loading) {
    return <Screen header={<AppHeader title="Editare fișă" back />}><LoadingState rows={6} /></Screen>;
  }

  if (state.error || !state.data) {
    return <Screen header={<AppHeader title="Editare fișă" back />}><ErrorState message={state.error?.message ?? 'Fișa nu există.'} onRetry={() => void state.reload()} /></Screen>;
  }

  return <Screen header={<AppHeader title={`Editează ${state.data.number}`} back />}>
    <ServiceSheetForm propertyId={state.data.propertyId} sheet={state.data} />
  </Screen>;
}
