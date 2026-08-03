import { AppUpdateInfo, AuditLog, AuthSession, Client, ClientExpense, ClientExpenseDeleteResult, ClientFinancialOverview, ClientParticipant, Collaborator, CompanyDetails, CreateClientExpensePayload, DashboardMetrics, GenerateServiceDocumentInput, Paginated, Permission, Property, ServiceDocument, ServiceDocumentRegisterRow, ServiceDocumentType, ServiceSheet, ServiceSheetPdf, UpdateClientExpensePayload, UpdateClientFinancialsPayload, User, UUID, WhatsAppMessage } from '@/types';

export interface AuthRepository {
  login(username: string, password: string, device: string): Promise<AuthSession>;
  logout(): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  updateProfile(firstName: string, lastName: string): Promise<User>;
}

export interface PropertyRepository {
  list(): Promise<Property[]>;
  updateName(id: UUID, name: string): Promise<Property>;
}
export interface CompanyDetailsRepository {
  list(propertyId: UUID): Promise<CompanyDetails[]>;
  create(propertyId: UUID, input: Omit<CompanyDetails, 'id' | 'propertyId' | 'isDefault' | 'stampUrl' | 'createdAt' | 'updatedAt'>): Promise<CompanyDetails>;
  update(companyId: UUID, input: Omit<CompanyDetails, 'id' | 'propertyId' | 'isDefault' | 'stampUrl' | 'createdAt' | 'updatedAt'>): Promise<CompanyDetails>;
  setDefault(companyId: UUID): Promise<CompanyDetails>;
  saveStamp(companyId: UUID, stamp: string): Promise<CompanyDetails>;
  removeStamp(companyId: UUID): Promise<CompanyDetails>;
}
export interface AppUpdateRepository { get(): Promise<AppUpdateInfo>; }
export interface DashboardRepository { get(propertyId: UUID): Promise<DashboardMetrics>; }
export interface ClientRepository {
  list(propertyId: UUID, query?: string, qrStatus?: string): Promise<Paginated<Client>>;
  get(id: UUID): Promise<Client>;
  create(input: Partial<Client>): Promise<Client>;
  update(id: UUID, input: Partial<Client>): Promise<Client>;
  remove(id: UUID): Promise<void>;
  ensureQr(id: UUID): Promise<Client>;
  markQrUsed(id: UUID): Promise<Client>;
  recordQrShare(id: UUID, method: string): Promise<void>;
  getFinancials(id: UUID): Promise<ClientFinancialOverview>;
  updateFinancials(id: UUID, input: UpdateClientFinancialsPayload): Promise<ClientFinancialOverview>;
  addExpense(id: UUID, input: CreateClientExpensePayload): Promise<ClientExpense>;
  updateExpense(id: UUID, expenseId: UUID, input: UpdateClientExpensePayload): Promise<ClientExpense>;
  removeExpense(id: UUID, expenseId: UUID): Promise<ClientExpenseDeleteResult>;
  getParticipants(id: UUID): Promise<ClientParticipant[]>;
  updateParticipants(id: UUID, userIds: UUID[]): Promise<ClientParticipant[]>;
}
export interface ServiceSheetRepository {
  list(propertyId: UUID): Promise<Paginated<ServiceSheet>>;
  get(id: UUID): Promise<ServiceSheet>;
  create(input: Partial<ServiceSheet>): Promise<ServiceSheet>;
  update(id: UUID, input: Partial<ServiceSheet>): Promise<ServiceSheet>;
  remove(id: UUID): Promise<void>;
  saveSignature(id: UUID, signature: string): Promise<ServiceSheet>;
  generatePdf(id: UUID): Promise<ServiceSheetPdf>;
  listDocuments(id: UUID): Promise<ServiceDocument[]>;
  generateDocument(id: UUID, type: ServiceDocumentType, input?: GenerateServiceDocumentInput): Promise<ServiceDocument>;
  listRegister(propertyId: UUID): Promise<ServiceDocumentRegisterRow[]>;
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
  updatePermissions(id: UUID, permissions: Permission[], propertyIds?: UUID[]): Promise<User>;
}
export interface AuditRepository {
  list(propertyId?: UUID): Promise<Paginated<AuditLog>>;
  remove(propertyId: UUID, ids?: UUID[]): Promise<{ deleted: number }>;
}
export interface WhatsAppMessageRepository {
  list(propertyId: UUID): Promise<WhatsAppMessage[]>;
  create(input: Pick<WhatsAppMessage, 'propertyId' | 'title' | 'message' | 'sortOrder'>): Promise<WhatsAppMessage>;
  update(id: UUID, input: Pick<WhatsAppMessage, 'propertyId' | 'title' | 'message' | 'sortOrder'>): Promise<WhatsAppMessage>;
  remove(id: UUID, propertyId: UUID): Promise<void>;
  recordUse(id: UUID, clientId: UUID): Promise<void>;
}
