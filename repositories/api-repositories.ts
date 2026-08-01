import { apiRequest } from '@/services/api';
import { AuthRepository, AuditRepository, ClientRepository, CollaboratorRepository, DashboardRepository, PropertyRepository, ServiceSheetRepository, UserRepository } from '@/repositories/interfaces';

export const authRepository: AuthRepository = {
  login: (username, password, device) => apiRequest('/auth/login', { method: 'POST', authenticated: false, body: JSON.stringify({ username, password, device }) }),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
  forgotPassword: (email) => apiRequest('/auth/forgot-password', { method: 'POST', authenticated: false, body: JSON.stringify({ email }) }),
  changePassword: (currentPassword, newPassword) => apiRequest('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
};

export const propertyRepository: PropertyRepository = { list: () => apiRequest('/properties') };
export const dashboardRepository: DashboardRepository = { get: (propertyId) => apiRequest(`/dashboard?propertyId=${propertyId}`) };
export const clientRepository: ClientRepository = {
  list: (propertyId, query = '', qrStatus = '') => apiRequest(`/clients?propertyId=${propertyId}&query=${encodeURIComponent(query)}&qrStatus=${encodeURIComponent(qrStatus)}`),
  get: (id) => apiRequest(`/clients/${id}`),
  create: (input) => apiRequest('/clients', { method: 'POST', body: JSON.stringify(input) }),
  update: (id, input) => apiRequest(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  generateQr: (id) => apiRequest(`/clients/${id}/qr`, { method: 'POST' }),
  markQrUsed: (id) => apiRequest(`/clients/${id}/qr/use`, { method: 'POST' }),
  recordQrShare: (id, method) => apiRequest(`/clients/${id}/qr/share`, { method: 'POST', body: JSON.stringify({ method }) }),
};
export const serviceSheetRepository: ServiceSheetRepository = {
  list: (propertyId) => apiRequest(`/service-sheets?propertyId=${propertyId}`),
  get: (id) => apiRequest(`/service-sheets/${id}`),
  create: (input) => apiRequest('/service-sheets', { method: 'POST', body: JSON.stringify(input) }),
  update: (id, input) => apiRequest(`/service-sheets/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  saveSignature: (id, signature) => apiRequest(`/service-sheets/${id}/signature`, { method: 'POST', body: JSON.stringify({ signature }) }),
};
export const collaboratorRepository: CollaboratorRepository = {
  list: (propertyId) => apiRequest(`/collaborators?propertyId=${propertyId}`),
  get: (id, propertyId) => apiRequest(`/collaborators/${id}?propertyId=${propertyId}`),
  create: (input) => apiRequest('/collaborators', { method: 'POST', body: JSON.stringify(input) }),
  update: (id, input) => apiRequest(`/collaborators/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id, propertyId) => apiRequest(`/collaborators/${id}?propertyId=${propertyId}`, { method: 'DELETE' }),
};
export const userRepository: UserRepository = {
  list: (propertyId) => apiRequest(`/users?propertyId=${propertyId}`),
  create: (input) => apiRequest('/users', { method: 'POST', body: JSON.stringify(input) }),
  update: (id, input) => apiRequest(`/users/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id) => apiRequest(`/users/${id}`, { method: 'DELETE' }),
  resetPassword: (id, password) => apiRequest(`/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  updatePermissions: (id, permissions) => apiRequest(`/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),
};
export const auditRepository: AuditRepository = { list: (propertyId) => apiRequest(`/audit-logs${propertyId ? `?propertyId=${propertyId}` : ''}`) };
