import { Permission, UserRole } from '@/types';

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard.view', 'clients.view', 'clients.create', 'clients.update', 'clients.delete',
  'qr.generate', 'qr.scan', 'qr.share', 'service_sheets.view', 'service_sheets.create',
  'service_sheets.update', 'service_sheets.sign', 'interventions.view', 'interventions.manage',
  'collaborators.view', 'collaborators.manage', 'users.view', 'users.manage', 'roles.manage',
  'reports.view', 'financials.view', 'audit.view', 'settings.manage',
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: ALL_PERMISSIONS.filter((permission) => !['users.manage', 'roles.manage'].includes(permission)),
  OPERATOR: [
    'dashboard.view', 'clients.view', 'clients.create', 'clients.update', 'qr.generate', 'qr.scan',
    'qr.share', 'service_sheets.view', 'service_sheets.create', 'service_sheets.update',
    'interventions.view', 'interventions.manage', 'collaborators.view',
  ],
  TECHNICIAN: ['dashboard.view', 'clients.view', 'qr.scan', 'service_sheets.view', 'service_sheets.update', 'service_sheets.sign', 'interventions.view', 'interventions.manage'],
  COLLABORATOR: ['dashboard.view', 'clients.view', 'service_sheets.view', 'interventions.view'],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  OPERATOR: 'Operator',
  TECHNICIAN: 'Tehnician',
  COLLABORATOR: 'Colaborator',
};
