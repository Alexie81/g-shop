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
