import { Property } from '@/types';

const SYSTEM_USER = '00000000-0000-0000-0000-000000000001';
const now = '2026-08-01T00:00:00.000Z';

export const INITIAL_PROPERTIES: Property[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Reparații Calculatoare București',
    domain: 'reparatiicalculatoare-bucuresti.ro',
    type: 'SERVICE',
    isActive: true,
    enabledModules: ['dashboard', 'clients', 'qr', 'serviceSheets', 'collaborators', 'users', 'reports'],
    createdAt: now,
    updatedAt: now,
    createdBy: SYSTEM_USER,
    updatedBy: SYSTEM_USER,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Calculatoare Profesionale',
    domain: 'calculatoareprofesionale.ro',
    type: 'SHOP',
    isActive: true,
    enabledModules: ['shopComingSoon'],
    createdAt: now,
    updatedAt: now,
    createdBy: SYSTEM_USER,
    updatedBy: SYSTEM_USER,
  },
];

export const SHOP_MODULE_ENABLED = process.env.EXPO_PUBLIC_SHOP_MODULE_ENABLED === 'true';
