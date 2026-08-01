export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(value);

export const formatDate = (value?: string, withTime = false) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ro-RO', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
};

export const initials = (firstName?: string, lastName?: string) =>
  `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || 'GS';

export const fullName = (person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}`;

export const normalizePhoneForWhatsApp = (value: string, defaultCountryCode = '40') => {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits) return '';
  if (digits.startsWith(`${defaultCountryCode}0`)) return `${defaultCountryCode}${digits.slice(defaultCountryCode.length + 1)}`;
  if (digits.startsWith(defaultCountryCode)) return digits;
  if (digits.startsWith('0')) return `${defaultCountryCode}${digits.slice(1)}`;
  if (digits.length === 9) return `${defaultCountryCode}${digits}`;
  return digits;
};
