import { SalesSheetForm } from '@/components/sales/SalesSheetForm';
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'expo-router';

export default function NewSalesSheetScreen() {
  const { hasPermission } = useAuth();
  if (!hasPermission('sales_sheets.create')) return <Redirect href={'/shop/sales-sheets' as never} />;
  return <SalesSheetForm />;
}
