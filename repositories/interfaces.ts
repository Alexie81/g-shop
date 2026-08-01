import { AuditLog, AuthSession, Client, Collaborator, DashboardMetrics, Paginated, Permission, Property, ServiceSheet, User, UUID } from '@/types';

export interface AuthRepository {
  login(username: string, password: string, device: string): Promise<AuthSession>;
  logout(): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}

export interface PropertyRepository { list(): Promise<Property[]>; }
export interface DashboardRepository { get(propertyId: UUID): Promise<DashboardMetrics>; }
export interface ClientRepository {
  list(propertyId: UUID, query?: string, qrStatus?: string): Promise<Paginated<Client>>;
  get(id: UUID): Promise<Client>;
  create(input: Partial<Client>): Promise<Client>;
  update(id: UUID, input: Partial<Client>): Promise<Client>;
  ensureQr(id: UUID): Promise<Client>;
  markQrUsed(id: UUID): Promise<Client>;
  recordQrShare(id: UUID, method: string): Promise<void>;
}
export interface ServiceSheetRepository {
  list(propertyId: UUID): Promise<Paginated<ServiceSheet>>;
  get(id: UUID): Promise<ServiceSheet>;
  create(input: Partial<ServiceSheet>): Promise<ServiceSheet>;
  update(id: UUID, input: Partial<ServiceSheet>): Promise<ServiceSheet>;
  saveSignature(id: UUID, signature: string): Promise<ServiceSheet>;
}
export interface CollaboratorRepository {
  list(propertyId: UUID): Promise<Collaborator[]>;
  get(id: UUID, propertyId: UUID): Promise<Collaborator>;
  create(input: Partial<Collaborator> & { propertyIds: UUID[] }): Promise<Collaborator>;
  update(id: UUID, input: Partial<Collaborator> & { propertyId: UUID }): Promise<Collaborator>;
  remove(id: UUID, propertyId: UUID): Promise<void>;
}
export interface UserRepository {
  list(propertyId: UUID): Promise<User[]>;
  create(input: Partial<User> & { password: string }): Promise<User>;
  update(id: UUID, input: Partial<User>): Promise<User>;
  remove(id: UUID): Promise<void>;
  resetPassword(id: UUID, password: string): Promise<void>;
  updatePermissions(id: UUID, permissions: Permission[]): Promise<User>;
}
export interface AuditRepository { list(propertyId?: UUID): Promise<Paginated<AuditLog>>; }
