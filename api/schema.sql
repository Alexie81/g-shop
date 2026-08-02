SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS properties (
  id BINARY(16) PRIMARY KEY,
  name VARCHAR(90) NOT NULL,
  domain VARCHAR(140) NOT NULL UNIQUE,
  type ENUM('SERVICE','SHOP') NOT NULL,
  enabled_modules JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NULL,
  updated_by BINARY(16) NULL,
  INDEX idx_properties_active (is_active, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BINARY(16) PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(60) NOT NULL,
  last_name VARCHAR(60) NOT NULL,
  email VARCHAR(140) NULL,
  phone VARCHAR(24) NULL,
  role ENUM('ADMIN','MANAGER','OPERATOR','TECHNICIAN','COLLABORATOR') NOT NULL DEFAULT 'OPERATOR',
  permissions JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NULL,
  updated_by BINARY(16) NULL,
  INDEX idx_users_active_role (is_active, role),
  INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_properties (
  user_id BINARY(16) NOT NULL,
  property_id BINARY(16) NOT NULL,
  PRIMARY KEY (user_id, property_id),
  CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_up_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS property_company_details (
  property_id BINARY(16) PRIMARY KEY,
  legal_name VARCHAR(160) NULL,
  tax_id VARCHAR(24) NULL,
  trade_register_number VARCHAR(40) NULL,
  vat_payer TINYINT(1) NOT NULL DEFAULT 0,
  address VARCHAR(220) NULL,
  city VARCHAR(80) NULL,
  county VARCHAR(80) NULL,
  postal_code VARCHAR(16) NULL,
  country VARCHAR(60) NOT NULL DEFAULT 'România',
  phone VARCHAR(30) NULL,
  email VARCHAR(140) NULL,
  website VARCHAR(160) NULL,
  bank_name VARCHAR(100) NULL,
  iban VARCHAR(40) NULL,
  representative_name VARCHAR(120) NULL,
  representative_role VARCHAR(80) NULL,
  stamp_path VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NULL,
  updated_by BINARY(16) NULL,
  CONSTRAINT fk_company_details_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id BINARY(16) PRIMARY KEY,
  user_id BINARY(16) NOT NULL,
  token_hash BINARY(32) NOT NULL UNIQUE,
  device VARCHAR(100) NULL,
  ip_address VARBINARY(16) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_sessions_user_active (user_id, revoked_at, expires_at),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS collaborators (
  id BINARY(16) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(24) NULL,
  email VARCHAR(140) NULL,
  role VARCHAR(70) NULL,
  default_commission_type ENUM('PERCENT_NET','PERCENT_TOTAL','FIXED') NOT NULL DEFAULT 'PERCENT_NET',
  default_commission_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  bank_account VARCHAR(34) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NULL,
  updated_by BINARY(16) NULL,
  INDEX idx_collaborators_active (is_active, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS collaborator_properties (
  collaborator_id BINARY(16) NOT NULL,
  property_id BINARY(16) NOT NULL,
  is_preset TINYINT(1) NULL DEFAULT NULL,
  PRIMARY KEY (collaborator_id, property_id),
  UNIQUE KEY uq_cp_property_preset (property_id, is_preset),
  CONSTRAINT fk_cp_collaborator FOREIGN KEY (collaborator_id) REFERENCES collaborators(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clients (
  id BINARY(16) PRIMARY KEY,
  property_id BINARY(16) NOT NULL,
  first_name VARCHAR(70) NOT NULL,
  last_name VARCHAR(70) NOT NULL,
  phone VARCHAR(24) NOT NULL,
  secondary_phone VARCHAR(24) NULL,
  email VARCHAR(140) NULL,
  address VARCHAR(220) NULL,
  city VARCHAR(80) NULL,
  county VARCHAR(80) NULL,
  postal_code VARCHAR(12) NULL,
  notes TEXT NULL,
  status ENUM('ACTIVE','INACTIVE','NEW','REVIEW_REQUIRED','FINALIZED') NOT NULL DEFAULT 'NEW',
  collaborator_id BINARY(16) NULL,
  commission_type ENUM('PERCENT_NET','PERCENT_TOTAL','FIXED') NULL,
  commission_value DECIMAL(10,2) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NOT NULL,
  updated_by BINARY(16) NOT NULL,
  INDEX idx_clients_property_active (property_id, is_active, last_name, first_name),
  INDEX idx_clients_phone (phone),
  INDEX idx_clients_email (email),
  CONSTRAINT fk_client_property FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_client_collaborator FOREIGN KEY (collaborator_id) REFERENCES collaborators(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_collaborators (
  client_id BINARY(16) NOT NULL,
  collaborator_id BINARY(16) NOT NULL,
  commission_type ENUM('PERCENT_NET','PERCENT_TOTAL','FIXED') NOT NULL,
  commission_value DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NOT NULL,
  updated_by BINARY(16) NOT NULL,
  PRIMARY KEY (client_id,collaborator_id),
  INDEX idx_client_collaborators_order (client_id,sort_order),
  INDEX idx_client_collaborators_collaborator (collaborator_id,client_id),
  CONSTRAINT fk_client_collaborator_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_collaborator_collaborator FOREIGN KEY (collaborator_id) REFERENCES collaborators(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS client_financials (
  client_id BINARY(16) PRIMARY KEY,
  currency_code CHAR(3) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT 'RON',
  exchange_rate_to_ron DECIMAL(14,6) UNSIGNED NOT NULL DEFAULT 1.000000,
  work_price DECIMAL(12,2) UNSIGNED NOT NULL DEFAULT 0,
  diagnostic_fee DECIMAL(12,2) UNSIGNED NOT NULL DEFAULT 0,
  advance_paid DECIMAL(12,2) UNSIGNED NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) UNSIGNED NOT NULL DEFAULT 0,
  actual_parts_cost DECIMAL(12,2) UNSIGNED NOT NULL DEFAULT 0,
  displayed_parts_cost DECIMAL(12,2) UNSIGNED NOT NULL DEFAULT 0,
  displayed_labor_cost DECIMAL(12,2) UNSIGNED NOT NULL DEFAULT 0,
  payment_status ENUM('UNPAID','PAID') NOT NULL DEFAULT 'UNPAID',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NOT NULL,
  updated_by BINARY(16) NOT NULL,
  CONSTRAINT fk_client_financial_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS client_expenses (
  id BINARY(16) PRIMARY KEY,
  client_id BINARY(16) NOT NULL,
  description VARCHAR(120) NOT NULL,
  amount DECIMAL(12,2) UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NOT NULL,
  updated_by BINARY(16) NOT NULL,
  INDEX idx_client_expenses_client (client_id),
  CONSTRAINT fk_client_expense_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_participants (
  client_id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  PRIMARY KEY (client_id, user_id),
  INDEX idx_client_participants_user (user_id),
  CONSTRAINT fk_client_participant_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_participant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS client_qr (
  id BINARY(16) PRIMARY KEY,
  client_id BINARY(16) NOT NULL,
  property_id BINARY(16) NOT NULL,
  token BINARY(16) NOT NULL UNIQUE,
  status ENUM('GENERATED','SENT','USED','EXPIRED','INVALIDATED','REGENERATED') NOT NULL,
  generated_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  opened_at DATETIME NULL,
  used_at DATETIME NULL,
  expires_at DATETIME NULL,
  invalidated_at DATETIME NULL,
  generated_by BINARY(16) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NOT NULL,
  updated_by BINARY(16) NOT NULL,
  INDEX idx_qr_client_active (client_id, is_active),
  INDEX idx_qr_property_status (property_id, status, is_active),
  CONSTRAINT fk_qr_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_qr_property FOREIGN KEY (property_id) REFERENCES properties(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS qr_shares (
  id BINARY(16) PRIMARY KEY,
  qr_id BINARY(16) NOT NULL,
  client_id BINARY(16) NOT NULL,
  property_id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  method ENUM('WHATSAPP','EMAIL','SMS','COPY','NATIVE') NOT NULL,
  status ENUM('INITIATED','SENT','FAILED') NOT NULL DEFAULT 'INITIATED',
  sent_at DATETIME NOT NULL,
  INDEX idx_qr_shares_client (client_id, sent_at),
  CONSTRAINT fk_share_qr FOREIGN KEY (qr_id) REFERENCES client_qr(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS qr_scan_logs (
  id BINARY(16) PRIMARY KEY,
  qr_id BINARY(16) NOT NULL,
  client_id BINARY(16) NOT NULL,
  property_id BINARY(16) NOT NULL,
  scanned_by BINARY(16) NULL,
  action ENUM('OPEN_PROFILE','CHECK_IN','DROP_OFF','PICK_UP','PUBLIC_FORM') NOT NULL,
  device VARCHAR(100) NULL,
  status ENUM('VALID','INVALID','EXPIRED') NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_scan_client_time (client_id, created_at),
  INDEX idx_scan_property_time (property_id, created_at),
  CONSTRAINT fk_scan_qr FOREIGN KEY (qr_id) REFERENCES client_qr(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS client_intakes (
  id BINARY(16) PRIMARY KEY,
  client_id BINARY(16) NOT NULL,
  qr_id BINARY(16) NOT NULL,
  property_id BINARY(16) NOT NULL,
  payload JSON NOT NULL,
  submitted_at DATETIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_intake_qr (qr_id),
  INDEX idx_intake_client (client_id, submitted_at),
  CONSTRAINT fk_intake_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_intake_qr FOREIGN KEY (qr_id) REFERENCES client_qr(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_sheets (
  id BINARY(16) PRIMARY KEY,
  property_id BINARY(16) NOT NULL,
  client_id BINARY(16) NOT NULL,
  number VARCHAR(24) NOT NULL UNIQUE,
  equipment VARCHAR(100) NOT NULL,
  brand VARCHAR(80) NULL,
  model VARCHAR(100) NULL,
  serial_number VARCHAR(100) NULL,
  accessories VARCHAR(500) NULL,
  reported_issue TEXT NOT NULL,
  technical_assessment TEXT NULL,
  work_performed TEXT NULL,
  parts_used TEXT NULL,
  parts_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  labor_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  direct_costs DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  technician_id BINARY(16) NULL,
  collaborator_id BINARY(16) NULL,
  collaborator_commission DECIMAL(12,2) NULL,
  show_company_details TINYINT(1) NOT NULL DEFAULT 1,
  warranty VARCHAR(120) NULL,
  storage_after VARCHAR(120) NULL,
  handover_notes TEXT NULL,
  identity_document VARCHAR(120) NULL,
  approve_diagnostics TINYINT(1) NOT NULL DEFAULT 0,
  approve_repair TINYINT(1) NOT NULL DEFAULT 0,
  repair_refused TINYINT(1) NOT NULL DEFAULT 0,
  product_delivered TINYINT(1) NOT NULL DEFAULT 0,
  internal_notes TEXT NULL,
  signature_path VARCHAR(255) NULL,
  signed_at DATETIME NULL,
  received_at DATETIME NOT NULL,
  estimated_at DATETIME NULL,
  completed_at DATETIME NULL,
  status ENUM('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS','COMPLETED','DELIVERED','CANCELLED') NOT NULL DEFAULT 'NEW',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NOT NULL,
  updated_by BINARY(16) NOT NULL,
  INDEX idx_sheets_property_status (property_id, status, created_at),
  INDEX idx_sheets_client (client_id, created_at),
  CONSTRAINT fk_sheet_property FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_sheet_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_sheet_collaborator FOREIGN KEY (collaborator_id) REFERENCES collaborators(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_sheet_status_history (
  id BINARY(16) PRIMARY KEY,
  service_sheet_id BINARY(16) NOT NULL,
  old_status VARCHAR(24) NULL,
  new_status VARCHAR(24) NOT NULL,
  changed_by BINARY(16) NOT NULL,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_sheet_history (service_sheet_id, created_at),
  CONSTRAINT fk_history_sheet FOREIGN KEY (service_sheet_id) REFERENCES service_sheets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS interventions (
  id BINARY(16) PRIMARY KEY,
  property_id BINARY(16) NOT NULL,
  client_id BINARY(16) NOT NULL,
  service_sheet_id BINARY(16) NULL,
  technician_id BINARY(16) NULL,
  collaborator_id BINARY(16) NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  scheduled_at DATETIME NOT NULL,
  estimated_minutes SMALLINT UNSIGNED NULL,
  status ENUM('SCHEDULED','CONFIRMED','TRAVELLING','IN_PROGRESS','WAITING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  direct_costs DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  location VARCHAR(220) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NOT NULL,
  updated_by BINARY(16) NOT NULL,
  INDEX idx_interventions_property_status (property_id, status, scheduled_at),
  INDEX idx_interventions_client (client_id, scheduled_at),
  CONSTRAINT fk_intervention_property FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_intervention_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_intervention_sheet FOREIGN KEY (service_sheet_id) REFERENCES service_sheets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_requests (
  id BINARY(16) PRIMARY KEY,
  property_id BINARY(16) NOT NULL,
  client_id BINARY(16) NOT NULL,
  intake_id BINARY(16) NOT NULL,
  status ENUM('NEW','REVIEWED','CONVERTED','CANCELLED') NOT NULL DEFAULT 'NEW',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_requests_property_status (property_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS commissions (
  id BINARY(16) PRIMARY KEY,
  collaborator_id BINARY(16) NOT NULL,
  client_id BINARY(16) NOT NULL,
  service_sheet_id BINARY(16) NULL,
  intervention_id BINARY(16) NULL,
  property_id BINARY(16) NOT NULL,
  total_value DECIMAL(12,2) NOT NULL,
  direct_costs DECIMAL(12,2) NOT NULL,
  net_value DECIMAL(12,2) NOT NULL,
  type ENUM('PERCENT_NET','PERCENT_TOTAL','FIXED') NOT NULL,
  rate_or_amount DECIMAL(10,2) NOT NULL,
  commission_value DECIMAL(12,2) NOT NULL,
  status ENUM('ESTIMATED','CALCULATED','APPROVED','PAID','CANCELLED') NOT NULL DEFAULT 'ESTIMATED',
  paid_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NOT NULL,
  updated_by BINARY(16) NOT NULL,
  INDEX idx_commissions_property_status (property_id, status, created_at),
  INDEX idx_commissions_collaborator (collaborator_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id BINARY(16) PRIMARY KEY,
  user_id BINARY(16) NULL,
  property_id BINARY(16) NULL,
  title VARCHAR(120) NOT NULL,
  message VARCHAR(500) NOT NULL,
  type ENUM('INFO','SUCCESS','WARNING','ERROR') NOT NULL DEFAULT 'INFO',
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_notifications_user_read (user_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BINARY(16) PRIMARY KEY,
  property_id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  title VARCHAR(80) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by BINARY(16) NOT NULL,
  updated_by BINARY(16) NOT NULL,
  INDEX idx_whatsapp_messages_owner (property_id,user_id,is_active,sort_order,title),
  CONSTRAINT fk_whatsapp_message_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_whatsapp_message_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BINARY(16) PRIMARY KEY,
  user_id BINARY(16) NULL,
  property_id BINARY(16) NULL,
  action VARCHAR(45) NOT NULL,
  module VARCHAR(35) NOT NULL,
  entity_type VARCHAR(40) NULL,
  entity_id BINARY(16) NULL,
  summary VARCHAR(255) NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  ip_address VARBINARY(16) NULL,
  device VARCHAR(160) NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_audit_property_time (property_id, created_at),
  INDEX idx_audit_user_time (user_id, created_at),
  INDEX idx_audit_entity (entity_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id BINARY(16) PRIMARY KEY,
  email VARCHAR(140) NOT NULL,
  ip_address VARBINARY(16) NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_reset_email_time (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_categories (
  id BINARY(16) PRIMARY KEY,
  property_id BINARY(16) NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_category_slug (property_id, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id BINARY(16) PRIMARY KEY,
  property_id BINARY(16) NOT NULL,
  category_id BINARY(16) NULL,
  name VARCHAR(180) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  description TEXT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  sale_price DECIMAL(12,2) NULL,
  status ENUM('DRAFT','PUBLISHED','HIDDEN') NOT NULL DEFAULT 'DRAFT',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_product_sku (property_id, sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_stocks (
  product_id BINARY(16) NOT NULL,
  property_id BINARY(16) NOT NULL,
  quantity MEDIUMINT NOT NULL DEFAULT 0,
  reserved_quantity MEDIUMINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (product_id, property_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
