import { Property } from '@/types';

type PropertyIdentity = Pick<Property, 'domain' | 'name' | 'type'>;

export function isCleaningProperty(property: Partial<PropertyIdentity> | null | undefined) {
  const domain = property?.domain?.trim().toLowerCase() ?? '';
  return domain === 'curatatorie-canapele.ro' || domain.endsWith('.curatatorie-canapele.ro');
}

export function isScooterProperty(property: Partial<PropertyIdentity> | null | undefined) {
  const domain = property?.domain?.trim().toLocaleLowerCase('ro-RO') ?? '';
  return domain === 'gshop-trotinete.ro' || domain.endsWith('.gshop-trotinete.ro');
}

export function propertyIcon(property: Partial<PropertyIdentity> | null | undefined) {
  if (isCleaningProperty(property)) return 'sparkles-outline' as const;
  if (isScooterProperty(property)) return 'bicycle-outline' as const;
  return property?.type === 'SHOP' ? 'storefront-outline' as const : 'construct-outline' as const;
}

export function propertyModuleLabel(property: Partial<PropertyIdentity> | null | undefined) {
  if (isCleaningProperty(property)) return 'Curățare · comenzi & fișe';
  if (isScooterProperty(property)) return 'Service trotinete & fișe';
  return property?.type === 'SHOP' ? 'Magazin online · În lucru' : 'Service & fișe';
}

export function propertyAlias(property: Partial<PropertyIdentity> | null | undefined) {
  if (isCleaningProperty(property)) return 'Canapele';
  const domain = property?.domain?.trim().toLocaleLowerCase('ro-RO') ?? '';
  if (isScooterProperty(property)) return 'Trotinete';
  if (domain === 'calculatoareprofesionale.ro' || domain.endsWith('.calculatoareprofesionale.ro')) return 'Shop';
  if (domain === 'reparatiicalculatoare-bucuresti.ro' || domain.endsWith('.reparatiicalculatoare-bucuresti.ro')) return 'Calculatoare';
  return property?.name?.trim() || 'Proprietate';
}
