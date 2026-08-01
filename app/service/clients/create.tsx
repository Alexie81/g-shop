import { ClientForm } from '@/components/clients/ClientForm';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { useProperty } from '@/contexts/PropertyContext';
export default function CreateClientScreen() { const { activeProperty } = useProperty(); return <Screen header={<AppHeader title="Client nou" back />}><AppText muted>Completează datele clientului. Codul QR poate fi generat imediat după salvare.</AppText><ClientForm propertyId={activeProperty?.id ?? ''} /></Screen>; }
