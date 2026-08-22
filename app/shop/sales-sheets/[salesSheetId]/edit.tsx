import { SalesSheetForm } from '@/components/sales/SalesSheetForm';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Screen } from '@/components/ui/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { salesSheetRepository } from '@/repositories/api-repositories';
import { SalesSheet } from '@/types';
import { Redirect, router, useLocalSearchParams } from 'expo-router';

export default function EditSalesSheetScreen() {
  const { salesSheetId } = useLocalSearchParams<{ salesSheetId: string }>();
  const { hasPermission } = useAuth();
  const state = useAsyncData<SalesSheet>(() => salesSheetRepository.get(salesSheetId), [salesSheetId]);

  if (!hasPermission('sales_sheets.update')) return <Redirect href="/shop/sales-sheets" />;
  if (state.loading) return <Screen header={<AppHeader title="Editare fișă de vânzare" back onBack={() => router.back()} />}><LoadingState rows={7} /></Screen>;
  if (state.error || !state.data) return <Screen header={<AppHeader title="Editare fișă de vânzare" back onBack={() => router.back()} />}><ErrorState message={state.error?.message ?? 'Fișa nu a putut fi încărcată.'} onRetry={() => void state.reload()} /></Screen>;

  return <SalesSheetForm initialSheet={state.data} />;
}
