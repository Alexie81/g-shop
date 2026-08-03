export type UUID = string;
export type ISODate = string;

export interface BaseEntity {
  id: UUID;
  createdAt: ISODate;
  updatedAt: ISODate;
  createdBy: UUID;
  updatedBy: UUID;
  isActive: boolean;
}

export type PropertyType = 'SERVICE' | 'SHOP';
export type UserRole = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'TECHNICIAN' | 'COLLABORATOR';
export type ThemePreference = 'light' | 'dark' | 'system';

export type Permission =
  | 'dashboard.view'
  | 'clients.view'
  | 'clients.create'
  | 'clients.update'
  | 'clients.delete'
  | 'qr.generate'
  | 'qr.scan'
  | 'qr.share'
  | 'service_sheets.view'
  | 'service_sheets.create'
  | 'service_sheets.update'
  | 'service_sheets.sign'
  | 'collaborators.view'
  | 'collaborators.manage'
  | 'users.view'
  | 'users.manage'
  | 'roles.manage'
  | 'reports.view'
  | 'financials.view'
  | 'audit.view'
  | 'settings.manage';

export interface Role extends BaseEntity {
  name: string;
  code: UserRole;
  description?: string;
  permissions: Permission[];
}

export interface Property extends BaseEntity {
  name: string;
  domain: string;
  type: PropertyType;
  logo?: string;
  enabledModules: string[];
}

export interface CompanyDetails {
  id: UUID;
  propertyId: UUID;
  isDefault: boolean;
  legalName: string;
  taxId: string;
  tradeRegisterNumber: string;
  vatPayer: boolean;
  address: string;
  city: string;
  county: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  iban: string;
  representativeName: string;
  representativeRole: string;
  stampUrl?: string | null;
  createdAt?: ISODate | null;
  updatedAt?: ISODate | null;
}

export interface AppUpdateInfo {
  platform: 'android';
  latestVersion: string;
  latestBuildNumber?: number;
  downloadUrl: string;
  releaseNotes: string[];
  publishedAt?: string;
  mandatory: boolean;
}

export interface User extends BaseEntity {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  roleId?: UUID;
  propertyIds: UUID[];
  permissions: Permission[];
  lastLoginAt?: ISODate;
}

export interface Technician extends BaseEntity {
  propertyId: UUID;
  name: string;
  phone?: string;
  specialty?: string;
  notes?: string;
}

export type QRStatus =
  | 'NOT_GENERATED'
  | 'GENERATED'
  | 'SENT'
  | 'USED'
  | 'EXPIRED'
  | 'INVALIDATED'
  | 'REGENERATED';

export interface ClientQR extends BaseEntity {
  clientId: UUID;
  propertyId: UUID;
  token?: string;
  publicUrl?: string;
  status: QRStatus;
  generatedAt?: ISODate;
  sentAt?: ISODate;
  openedAt?: ISODate;
  usedAt?: ISODate;
  expiresAt?: ISODate;
  invalidatedAt?: ISODate;
  generatedBy?: UUID;
}

export interface Client extends BaseEntity {
  propertyId: UUID;
  firstName: string;
  lastName: string;
  phone: string;
  secondaryPhone?: string;
  email?: string;
  address?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  notes?: string;
  signatureUrl?: string;
  signedAt?: ISODate;
  status: 'ACTIVE' | 'INACTIVE' | 'NEW' | 'REVIEW_REQUIRED' | 'FINALIZED';
  collaboratorId?: UUID;
  commissionType?: CommissionType;
  commissionValue?: number;
  collaborators: ClientCollaboratorAssignment[];
  qr?: ClientQR;
  serviceSheetsCount: number;
  lastActivityAt?: ISODate;
}

export type ClientPaymentStatus = 'UNPAID' | 'PAID';

export interface ClientFinancialRecord {
  clientId: UUID;
  propertyId: UUID;
  currencyCode: string;
  exchangeRateToRon: number;
  workPrice: number;
  diagnosticFee: number;
  advancePaid: number;
  discountPercent: number;
  actualPartsCost: number;
  displayedPartsCost: number;
  displayedLaborCost: number;
  paymentStatus: ClientPaymentStatus;
  persisted: boolean;
  updatedAt?: ISODate;
  updatedBy?: UUID;
}

export type ClientFinancials = ClientFinancialRecord;

export interface ClientFinancialSummary {
  subtotal: number;
  discountAmount: number;
  totalDue: number;
  receivedAmount: number;
  remainingDue: number;
  additionalExpenses: number;
  internalCosts: number;
  collaboratorCost: number;
  gshopNet: number;
}

export interface ClientExpense {
  id: UUID;
  clientId: UUID;
  propertyId?: UUID;
  description: string;
  amount: number;
  createdAt: ISODate;
  updatedAt?: ISODate;
  createdBy?: UUID;
  updatedBy?: UUID;
}

export interface ClientParticipant {
  id: UUID;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isAssigned: boolean;
}

export interface ClientFinancialOverview {
  financials: ClientFinancialRecord;
  summary: ClientFinancialSummary;
  expenses: ClientExpense[];
  collaborator: ClientFinancialCollaborator | null;
  collaborators: ClientFinancialCollaborator[];
}

export interface ClientCollaboratorAssignment {
  collaboratorId: UUID;
  name: string;
  role?: string;
  commissionType: CommissionType;
  commissionValue: number;
  sortOrder: number;
}

export interface ClientFinancialCollaborator {
  id: UUID;
  name: string;
  role?: string;
  commissionType?: CommissionType;
  commissionValue?: number;
  amount: number;
  paid: number;
  due: number;
  status: 'PAID' | 'UNPAID';
  hasCommission: boolean;
}

export type UpdateClientFinancialsPayload = Partial<Pick<ClientFinancialRecord,
  | 'currencyCode'
  | 'exchangeRateToRon'
  | 'workPrice'
  | 'diagnosticFee'
  | 'advancePaid'
  | 'discountPercent'
  | 'actualPartsCost'
  | 'displayedPartsCost'
  | 'displayedLaborCost'
  | 'paymentStatus'
>>;

export interface CreateClientExpensePayload {
  description: string;
  amount: number;
}

export type UpdateClientExpensePayload = Partial<CreateClientExpensePayload>;

export interface ClientExpenseDeleteResult {
  deleted: boolean;
  id?: UUID;
}

export interface UpdateClientParticipantsPayload {
  userIds: UUID[];
}

export interface QRScanLog extends BaseEntity {
  qrId: UUID;
  clientId: UUID;
  propertyId: UUID;
  scannedBy: UUID;
  action: 'OPEN_PROFILE' | 'CHECK_IN' | 'DROP_OFF' | 'PICK_UP' | 'PUBLIC_FORM';
  device: string;
  status: 'VALID' | 'INVALID' | 'EXPIRED';
}

export type ServiceSheetStatus =
  | 'NEW'
  | 'WAITING'
  | 'VERIFYING'
  | 'IN_PROGRESS'
  | 'WAITING_PARTS'
  | 'COMPLETED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface ServiceSheetItem extends BaseEntity {
  serviceSheetId: UUID;
  name: string;
  quantity: number;
  unitPrice: number;
  directCost: number;
}

export interface ServiceSheet extends BaseEntity {
  propertyId: UUID;
  clientId: UUID;
  number: string;
  currencyCode?: string;
  equipment: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  accessories?: string;
  reportedIssue: string;
  technicalAssessment?: string;
  workPerformed?: string;
  partsUsed?: string;
  partsCost: number;
  laborCost: number;
  totalCost: number;
  directCosts: number;
  netValue: number;
  technicianId?: UUID;
  collaboratorId?: UUID;
  collaboratorCommission?: number;
  showCompanyDetails: boolean;
  companyId?: UUID;
  companyName?: string;
  warranty?: string;
  warrantyStartAt?: ISODate;
  warrantyEndAt?: ISODate;
  warrantyRemediation?: string;
  storageAfter?: string;
  handoverNotes?: string;
  identityDocument?: string;
  approveDiagnostics: boolean;
  approveRepair: boolean;
  repairRefused: boolean;
  productDelivered: boolean;
  technicianName?: string;
  internalNotes?: string;
  signatureUrl?: string;
  signedAt?: ISODate;
  receivedAt: ISODate;
  estimatedAt?: ISODate;
  estimatedRepairDays?: number;
  intakeAgreementAt?: ISODate;
  completedAt?: ISODate;
  status: ServiceSheetStatus;
  client?: Pick<Client, 'id' | 'firstName' | 'lastName' | 'phone'>;
}

export interface ServiceSheetPdf {
  url: string;
  fileName: string;
  generatedAt: ISODate;
}

export type ServiceDocumentType = 'INTAKE' | 'FINAL_ESTIMATE' | 'EXIT' | 'WARRANTY';
export type ServiceDocumentStatus = 'MISSING' | 'PUBLISHED';

export interface ServiceDocumentItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  directCost?: number;
}

export interface EstimatedCosts {
  diagnosticFee: number;
  partsCost: number;
  laborCost: number;
  advancePaid: number;
  discountPercent: number;
  currencyCode: string;
  subtotal: number;
  discountAmount: number;
  totalDue: number;
  receivedAmount: number;
  remainingDue: number;
}

export interface ServiceDocument {
  id?: UUID;
  serviceSheetId: UUID;
  type: ServiceDocumentType;
  label: string;
  status: ServiceDocumentStatus;
  available: boolean;
  number?: string;
  documentAt?: ISODate;
  agreementAt?: ISODate;
  agreementStatus?: 'ACCEPTED' | 'REFUSED';
  generatedAt?: ISODate;
  estimatedRepairDays?: number;
  productState?: 'REPAIRED' | 'INITIAL';
  technicalAssessment?: string;
  defectCause?: string;
  finalNotes?: string;
  warrantyPeriod?: string;
  warrantyStartAt?: ISODate;
  warrantyEndAt?: ISODate;
  warrantyRemediation?: string;
  estimatedCosts?: EstimatedCosts;
  parts: ServiceDocumentItem[];
  labor: ServiceDocumentItem[];
  url?: string;
}

export interface GenerateServiceDocumentInput {
  documentAt?: ISODate;
  agreementAt?: ISODate;
  agreementStatus?: 'ACCEPTED' | 'REFUSED';
  estimatedRepairDays?: number;
  productState?: 'REPAIRED' | 'INITIAL';
  technicalAssessment?: string;
  defectCause?: string;
  finalNotes?: string;
  warrantyPeriod?: string;
  warrantyStartAt?: ISODate;
  warrantyEndAt?: ISODate;
  warrantyRemediation?: string;
  estimatedCosts?: EstimatedCosts;
  parts?: ServiceDocumentItem[];
  labor?: ServiceDocumentItem[];
}

export interface ServiceDocumentRegisterRow {
  serviceSheetId: UUID;
  serviceSheetNumber: string;
  clientId?: UUID;
  clientName: string;
  equipment: string;
  brand?: string;
  model?: string;
  status?: ServiceSheetStatus;
  receivedAt?: ISODate;
  intakeNumber?: string;
  intakeAt?: ISODate;
  finalEstimateNumber?: string;
  finalEstimateAt?: ISODate;
  exitNumber?: string;
  exitAt?: ISODate;
  warrantyNumber?: string;
  warrantyAt?: ISODate;
}

export type CommissionType = 'PERCENT_NET' | 'PERCENT_TOTAL' | 'FIXED';
export type CommissionStatus = 'ESTIMATED' | 'CALCULATED' | 'APPROVED' | 'PAID' | 'CANCELLED';

export interface Collaborator extends BaseEntity {
  name: string;
  phone?: string;
  email?: string;
  role?: string;
  propertyIds: UUID[];
  isPreset: boolean;
  defaultCommissionType: CommissionType;
  defaultCommissionValue: number;
  bankAccount?: string;
  notes?: string;
}

export interface CollaboratorAssignment extends BaseEntity {
  collaboratorId: UUID;
  propertyId: UUID;
  entityType: 'CLIENT' | 'SERVICE_SHEET';
  entityId: UUID;
  commissionType: CommissionType;
  commissionValue: number;
  awardedAt: 'CREATION' | 'COMPLETION' | 'PAYMENT';
}

export interface Commission extends BaseEntity {
  collaboratorId: UUID;
  collaboratorName?: string;
  clientId: UUID;
  clientName?: string;
  serviceSheetId?: UUID;
  serviceSheetNumber?: string;
  propertyId: UUID;
  totalValue: number;
  directCosts: number;
  netValue: number;
  type: CommissionType;
  rateOrAmount: number;
  commissionValue: number;
  status: CommissionStatus;
  paidAt?: ISODate;
}

export interface CollaboratorFinanceClient {
  clientId: UUID;
  clientName: string;
  serviceSheetsCount: number;
  hasCommission?: boolean;
  paid: number;
  due: number;
  total: number;
  lastActivityAt?: ISODate;
}

export interface CollaboratorFinanceGroup {
  collaboratorId: UUID;
  collaboratorName: string;
  role?: string;
  clientsCount: number;
  paid: number;
  due: number;
  total: number;
  clients: CollaboratorFinanceClient[];
}

export interface CollaboratorFinanceSummary {
  paid: number;
  due: number;
  total: number;
  collaborators: CollaboratorFinanceGroup[];
}

export interface ProductCategory extends BaseEntity {
  propertyId: UUID;
  name: string;
  slug: string;
}

export interface Product extends BaseEntity {
  propertyId: UUID;
  categoryId?: UUID;
  name: string;
  sku: string;
  description?: string;
  price: number;
  salePrice?: number;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
}

export interface ProductStock extends BaseEntity {
  productId: UUID;
  propertyId: UUID;
  quantity: number;
  reservedQuantity: number;
}

export interface Notification extends BaseEntity {
  userId: UUID;
  propertyId?: UUID;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  readAt?: ISODate;
}

export interface WhatsAppMessage extends BaseEntity {
  propertyId: UUID;
  userId: UUID;
  title: string;
  message: string;
  sortOrder: number;
}

export interface AuditLog extends BaseEntity {
  userId?: UUID;
  userName?: string;
  propertyId?: UUID;
  action: string;
  module: string;
  entityType?: string;
  entityId?: UUID;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  device?: string;
}

export interface DashboardMetrics {
  clientsTotal: number;
  totalRevenue: number;
  clientsWaiting: number;
  revenueOnHold: number;
  gshopNet: number;
  collaboratorTotal: number;
  collaboratorPaid: number;
  collaboratorOnHold: number;
  clientsNew: number;
  serviceSheetsOpen: number;
  serviceSheetsInProgress: number;
  serviceSheetsCompleted: number;
  usersActive: number;
  collaboratorsActive: number;
  qrGenerated: number;
  qrUsed: number;
  estimatedRevenue: number;
  collaboratorCommissions: number;
  collaboratorPayments: number;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: ISODate;
  user: User;
}
