<?php
declare(strict_types=1);
require __DIR__ . '/src/bootstrap.php';

$allowedOrigins = array_map('trim', explode(',', env_value('CORS_ORIGINS', '*')));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
if (in_array('*', $allowedOrigins, true) || in_array($origin, $allowedOrigins, true)) header('Access-Control-Allow-Origin: ' . ($origin === 'null' ? '*' : $origin));
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

function route_path(): string {
    if (!empty($_SERVER['PATH_INFO'])) return '/' . trim((string)$_SERVER['PATH_INFO'], '/');
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/index.php');
    $base = rtrim(dirname($script), '/.');
    if ($base && str_starts_with($uri, $base)) $uri = substr($uri, strlen($base));
    $uri = preg_replace('#^/index\.php#', '', $uri) ?: '/';
    return '/' . trim($uri, '/');
}
function path_match(string $pattern, string $path, ?array &$params = null): bool {
    $names = [];
    $regex = preg_replace_callback('/\{([a-zA-Z][a-zA-Z0-9_]*)\}/', function ($match) use (&$names) { $names[] = $match[1]; return '([^/]+)'; }, $pattern);
    if (!preg_match('#^' . $regex . '$#', $path, $matches)) return false;
    array_shift($matches); $params = [];
    foreach ($names as $index => $name) $params[$name] = urldecode($matches[$index]);
    return true;
}
function jwt_issue(string $userId): array {
    $now = time(); $ttl = (int)env_value('ACCESS_TOKEN_TTL', '900');
    $header = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64url_encode(json_encode(['sub' => $userId, 'iat' => $now, 'exp' => $now + $ttl, 'iss' => 'g-shop-api']));
    $signature = base64url_encode(hash_hmac('sha256', $header . '.' . $payload, env_value('APP_KEY'), true));
    return [$header . '.' . $payload . '.' . $signature, gmdate('c', $now + $ttl)];
}
function jwt_decode(string $token): array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) fail('Sesiune invalidă.', 401);
    [$header, $payload, $signature] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', $header . '.' . $payload, env_value('APP_KEY'), true));
    if (!hash_equals($expected, $signature)) fail('Sesiune invalidă.', 401);
    $data = json_decode(base64url_decode($payload), true);
    if (!is_array($data) || ($data['exp'] ?? 0) < time()) fail('Sesiunea a expirat.', 401);
    return $data;
}
function bearer_token(): string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $match)) fail('Autentificare necesară.', 401);
    return trim($match[1]);
}
function user_record(string $userId): array {
    $sql = 'SELECT ' . uuid_sql('u.id') . ' id,u.username,u.first_name,u.last_name,u.email,u.phone,u.role,u.permissions,u.is_active,u.last_login_at,u.created_at,u.updated_at,' . uuid_sql('u.created_by') . ' created_by,' . uuid_sql('u.updated_by') . ' updated_by FROM users u WHERE u.id=? LIMIT 1';
    $stmt = db()->prepare($sql); $stmt->execute([uuid_bin($userId)]); $row = $stmt->fetch();
    if (!$row || !(bool)$row['is_active']) fail('Cont inactiv sau inexistent.', 401);
    $user = camel_row($row);
    $user['permissions'] = json_decode((string)$row['permissions'], true) ?: [];
    $props = db()->prepare('SELECT ' . uuid_sql('property_id') . ' id FROM user_properties WHERE user_id=?');
    $props->execute([uuid_bin($userId)]); $user['propertyIds'] = array_column($props->fetchAll(), 'id');
    return $user;
}
function current_user(): array {
    static $user;
    if ($user) return $user;
    $payload = jwt_decode(bearer_token());
    $user = user_record((string)$payload['sub']);
    return $user;
}
function require_permission(string $permission): array {
    $user = current_user();
    if ($user['role'] !== 'ADMIN' && !in_array($permission, $user['permissions'], true)) fail('Nu ai permisiunea necesară pentru această acțiune.', 403);
    return $user;
}
function ensure_property(string $propertyId, array $user): void {
    if ($user['role'] !== 'ADMIN' && !in_array($propertyId, $user['propertyIds'], true)) fail('Nu ai acces la această proprietate.', 403);
}
function audit_log(string $action, string $module, string $summary, ?string $entityType = null, ?string $entityId = null, ?string $propertyId = null, ?array $before = null, ?array $after = null, ?array $user = null): void {
    try {
        $user = $user ?? current_user();
        if ($before !== null && $after !== null) [$before, $after] = changed_fields($before, $after);
        $stmt = db()->prepare('INSERT INTO audit_logs (id,user_id,property_id,action,module,entity_type,entity_id,summary,before_data,after_data,ip_address,device,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([uuid_bin(uuid_v4()), isset($user['id']) ? uuid_bin($user['id']) : null, $propertyId ? uuid_bin($propertyId) : null, $action, $module, $entityType, $entityId ? uuid_bin($entityId) : null, $summary, $before ? json_encode($before, JSON_UNESCAPED_UNICODE) : null, $after ? json_encode($after, JSON_UNESCAPED_UNICODE) : null, request_ip(), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ($user['device'] ?? '')), 0, 160), now_utc()]);
    } catch (Throwable $ignored) { /* Audit failure must not expose internal details to clients. */ }
}
function auth_session(array $user, string $device): array {
    [$access, $accessExpires] = jwt_issue($user['id']);
    $refresh = base64url_encode(random_bytes(32)); $refreshTtl = (int)env_value('REFRESH_TOKEN_TTL', '2592000');
    $stmt = db()->prepare('INSERT INTO refresh_sessions (id,user_id,token_hash,device,ip_address,expires_at,created_at) VALUES (?,?,?,?,?,?,?)');
    $stmt->execute([uuid_bin(uuid_v4()), uuid_bin($user['id']), hash('sha256', $refresh, true), substr($device, 0, 100), request_ip(), gmdate('Y-m-d H:i:s', time() + $refreshTtl), now_utc()]);
    return ['accessToken' => $access, 'refreshToken' => $refresh, 'expiresAt' => $accessExpires, 'user' => $user];
}
function entity_base(array $row): array { return camel_row($row); }
function validated_person_name(mixed $value, string $label): string {
    if (!is_string($value)) fail($label . ' trebuie să fie text.', 422);
    $name = preg_replace('/\s+/u', ' ', trim($value));
    if ($name === null) fail($label . ' conține caractere invalide.', 422);
    $length = function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : preg_match_all('/./u', $name, $characters);
    $validCharacters = preg_match('/^[\p{L}\p{M}](?:[\p{L}\p{M} .\'\x{2019}\-]*[\p{L}\p{M}.])?$/u', $name) === 1;
    if ($length === false || $length < 1 || $length > 60 || !$validCharacters) {
        fail($label . ' trebuie să aibă între 1 și 60 de caractere și poate conține doar litere, spații, cratimă, apostrof sau punct.', 422);
    }
    return $name;
}
function collaborator_preset_migration_state(PDO $pdo): array {
    $wanted = [
        'collaborator_properties.is_preset',
        'collaborators.default_commission_type',
        'clients.commission_type',
        'commissions.type',
    ];
    $stmt = $pdo->query("SELECT table_name,column_name,column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='collaborator_properties' AND column_name='is_preset') OR (table_name='collaborators' AND column_name='default_commission_type') OR (table_name='clients' AND column_name='commission_type') OR (table_name='commissions' AND column_name='type'))");
    $columns = [];
    foreach ($stmt->fetchAll() as $row) $columns[$row['table_name'] . '.' . $row['column_name']] = strtoupper((string)$row['column_type']);
    $index = $pdo->query("SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='collaborator_properties' AND index_name='uq_cp_property_preset' LIMIT 1")->fetchColumn();
    return [
        'presetColumn' => isset($columns[$wanted[0]]),
        'collaboratorType' => isset($columns[$wanted[1]]) && str_contains($columns[$wanted[1]], 'PERCENT_TOTAL'),
        'clientType' => isset($columns[$wanted[2]]) && str_contains($columns[$wanted[2]], 'PERCENT_TOTAL'),
        'commissionType' => isset($columns[$wanted[3]]) && str_contains($columns[$wanted[3]], 'PERCENT_TOTAL'),
        'presetUniqueIndex' => (bool)$index,
    ];
}
function migrate_collaborator_presets(PDO $pdo): array {
    $lockName = 'gshop_collaborator_presets_v1';
    $lock = $pdo->prepare('SELECT GET_LOCK(?,10)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('Migrarea nu a putut obține blocarea bazei de date.');
    $changes = [];
    try {
        $state = collaborator_preset_migration_state($pdo);
        if (!$state['presetColumn']) {
            $pdo->exec('ALTER TABLE collaborator_properties ADD COLUMN is_preset TINYINT(1) NULL DEFAULT NULL AFTER property_id');
            $changes[] = 'collaborator_properties.is_preset';
        }
        if (!$state['collaboratorType']) {
            $pdo->exec("ALTER TABLE collaborators MODIFY COLUMN default_commission_type ENUM('PERCENT_NET','PERCENT_TOTAL','FIXED') NOT NULL DEFAULT 'PERCENT_NET'");
            $changes[] = 'collaborators.default_commission_type';
        }
        if (!$state['clientType']) {
            $pdo->exec("ALTER TABLE clients MODIFY COLUMN commission_type ENUM('PERCENT_NET','PERCENT_TOTAL','FIXED') NULL");
            $changes[] = 'clients.commission_type';
        }
        if (!$state['commissionType']) {
            $pdo->exec("ALTER TABLE commissions MODIFY COLUMN type ENUM('PERCENT_NET','PERCENT_TOTAL','FIXED') NOT NULL");
            $changes[] = 'commissions.type';
        }
        $state = collaborator_preset_migration_state($pdo);
        if (!$state['presetUniqueIndex']) {
            $pdo->exec('UPDATE collaborator_properties SET is_preset=NULL WHERE is_preset=0');
            $duplicates = $pdo->query('SELECT property_id,MIN(HEX(collaborator_id)) keep_id FROM collaborator_properties WHERE is_preset=1 GROUP BY property_id HAVING COUNT(*)>1')->fetchAll();
            $clear = $pdo->prepare('UPDATE collaborator_properties SET is_preset=NULL WHERE property_id=? AND is_preset=1 AND HEX(collaborator_id)<>?');
            foreach ($duplicates as $duplicate) $clear->execute([$duplicate['property_id'], $duplicate['keep_id']]);
            $pdo->exec('ALTER TABLE collaborator_properties ADD UNIQUE KEY uq_cp_property_preset (property_id,is_preset)');
            $changes[] = 'collaborator_properties.uq_cp_property_preset';
        }
    } finally {
        $release = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $release->execute([$lockName]);
    }
    return $changes;
}
function client_finance_migration_state(PDO $pdo): array {
    $stmt = $pdo->query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('client_financials','client_expenses','client_participants')");
    $tables = array_fill_keys(array_column($stmt->fetchAll(), 'table_name'), true);
    $clientStatusType = (string)$pdo->query("SELECT column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='clients' AND column_name='status' LIMIT 1")->fetchColumn();
    return [
        'clientFinancials' => isset($tables['client_financials']),
        'clientExpenses' => isset($tables['client_expenses']),
        'clientParticipants' => isset($tables['client_participants']),
        'clientFinalizedStatus' => str_contains(strtoupper($clientStatusType), 'FINALIZED'),
    ];
}
function migrate_client_finance(PDO $pdo): array {
    $lockName = 'gshop_client_finance_v1';
    $lock = $pdo->prepare('SELECT GET_LOCK(?,10)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('Migrarea financiară nu a putut obține blocarea bazei de date.');
    $changes = [];
    try {
        $state = client_finance_migration_state($pdo);
        if (!$state['clientFinancials']) {
            $pdo->exec("CREATE TABLE client_financials (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            $changes[] = 'client_financials';
        }
        if (!$state['clientExpenses']) {
            $pdo->exec("CREATE TABLE client_expenses (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $changes[] = 'client_expenses';
        }
        if (!$state['clientParticipants']) {
            $pdo->exec("CREATE TABLE client_participants (
                client_id BINARY(16) NOT NULL,
                user_id BINARY(16) NOT NULL,
                PRIMARY KEY (client_id,user_id),
                INDEX idx_client_participants_user (user_id),
                CONSTRAINT fk_client_participant_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
                CONSTRAINT fk_client_participant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            $changes[] = 'client_participants';
        }
        if (!$state['clientFinalizedStatus']) {
            $pdo->exec("ALTER TABLE clients MODIFY COLUMN status ENUM('ACTIVE','INACTIVE','NEW','REVIEW_REQUIRED','FINALIZED') NOT NULL DEFAULT 'NEW'");
            $changes[] = 'clients.status.FINALIZED';
        }
    } finally {
        $release = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $release->execute([$lockName]);
    }
    return $changes;
}
function client_select(): string {
    return 'SELECT ' . uuid_sql('c.id') . ' id,' . uuid_sql('c.property_id') . ' property_id,c.first_name,c.last_name,c.phone,c.secondary_phone,c.email,c.address,c.city,c.county,c.postal_code,c.notes,c.status,' . uuid_sql('c.collaborator_id') . ' collaborator_id,c.commission_type,c.commission_value,c.is_active,c.created_at,c.updated_at,' . uuid_sql('c.created_by') . ' created_by,' . uuid_sql('c.updated_by') . ' updated_by,(SELECT COUNT(*) FROM service_sheets ss WHERE ss.client_id=c.id AND ss.is_active=1) service_sheets_count,c.updated_at last_activity_at,' . uuid_sql('q.id') . ' qr_id,' . uuid_sql('q.token') . ' qr_token,q.status qr_status,q.generated_at qr_generated_at,q.sent_at qr_sent_at,q.opened_at qr_opened_at,q.used_at qr_used_at,q.expires_at qr_expires_at,q.invalidated_at qr_invalidated_at,' . uuid_sql('q.generated_by') . ' qr_generated_by FROM clients c LEFT JOIN client_qr q ON q.client_id=c.id AND q.is_active=1';
}
function map_client(array $row): array {
    $qrId = $row['qr_id'] ?? null;
    $clientFields = $row;
    foreach (array_keys($clientFields) as $key) if (str_starts_with($key, 'qr_')) unset($clientFields[$key]);
    $client = entity_base($clientFields);
    $client['serviceSheetsCount'] = (int)$client['serviceSheetsCount'];
    $client['commissionValue'] = $client['commissionValue'] !== null ? (float)$client['commissionValue'] : null;
    if ($qrId) {
        $token = (string)$row['qr_token'];
        $client['qr'] = ['id' => $qrId, 'clientId' => $client['id'], 'propertyId' => $client['propertyId'], 'token' => $token, 'publicUrl' => public_base_url() . '/client-form.php?token=' . rawurlencode($token), 'status' => $row['qr_status'], 'generatedAt' => iso_date($row['qr_generated_at']), 'sentAt' => iso_date($row['qr_sent_at']), 'openedAt' => iso_date($row['qr_opened_at']), 'usedAt' => iso_date($row['qr_used_at']), 'expiresAt' => iso_date($row['qr_expires_at']), 'invalidatedAt' => iso_date($row['qr_invalidated_at']), 'generatedBy' => $row['qr_generated_by'], 'isActive' => true, 'createdAt' => iso_date($row['qr_generated_at']), 'updatedAt' => iso_date($row['qr_used_at'] ?: $row['qr_generated_at']), 'createdBy' => $row['qr_generated_by'], 'updatedBy' => $row['qr_generated_by']];
    }
    return $client;
}
function get_client(string $id): array {
    $stmt = db()->prepare(client_select() . ' WHERE c.id=? LIMIT 1'); $stmt->execute([uuid_bin($id)]); $row = $stmt->fetch();
    if (!$row) fail('Clientul nu există.', 404);
    return map_client($row);
}
function create_client_qr(PDO $pdo, string $clientId, string $propertyId, string $userId, ?string $createdAt = null): array {
    $id = uuid_v4();
    $token = uuid_v4();
    $createdAt = $createdAt ?? now_utc();
    $stmt = $pdo->prepare("INSERT INTO client_qr (id,client_id,property_id,token,status,generated_at,expires_at,generated_by,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?, 'GENERATED',?,NULL,?,1,?,?,?,?)");
    $stmt->execute([uuid_bin($id),uuid_bin($clientId),uuid_bin($propertyId),uuid_bin($token),$createdAt,uuid_bin($userId),$createdAt,$createdAt,uuid_bin($userId),uuid_bin($userId)]);
    return ['id'=>$id,'clientId'=>$clientId,'propertyId'=>$propertyId,'status'=>'GENERATED','generatedAt'=>iso_date($createdAt),'expiresAt'=>null];
}
function client_audit_snapshot(array $client): array {
    $hasQr = !empty($client['qr']);
    unset($client['qr']);
    $client['qrGenerated'] = $hasQr;
    return $client;
}
function user_has_permission(array $user, string $permission): bool {
    return $user['role'] === 'ADMIN' || in_array($permission, $user['permissions'], true);
}
function client_for_user(array $client, array $user): array {
    if (!empty($client['qr']) && !user_has_permission($user, 'qr.share')) {
        unset($client['qr']['token'], $client['qr']['publicUrl']);
    }
    return $client;
}
function sheet_select(): string {
    return 'SELECT ' . uuid_sql('s.id') . ' id,' . uuid_sql('s.property_id') . ' property_id,' . uuid_sql('s.client_id') . ' client_id,s.number,s.equipment,s.brand,s.model,s.serial_number,s.accessories,s.reported_issue,s.technical_assessment,s.work_performed,s.parts_used,s.parts_cost,s.labor_cost,s.total_cost,s.direct_costs,s.net_value,' . uuid_sql('s.technician_id') . ' technician_id,' . uuid_sql('s.collaborator_id') . ' collaborator_id,s.collaborator_commission,s.internal_notes,s.signature_path,s.signed_at,s.received_at,s.estimated_at,s.completed_at,s.status,COALESCE(cf.currency_code,\'RON\') currency_code,s.is_active,s.created_at,s.updated_at,' . uuid_sql('s.created_by') . ' created_by,' . uuid_sql('s.updated_by') . ' updated_by,' . uuid_sql('c.id') . ' c_id,c.first_name c_first_name,c.last_name c_last_name,c.phone c_phone FROM service_sheets s JOIN clients c ON c.id=s.client_id LEFT JOIN client_financials cf ON cf.client_id=s.client_id';
}
function map_sheet(array $row): array {
    $client = ['id' => $row['c_id'], 'firstName' => $row['c_first_name'], 'lastName' => $row['c_last_name'], 'phone' => $row['c_phone']];
    foreach (array_keys($row) as $key) if (str_starts_with($key, 'c_')) unset($row[$key]);
    $sheet = entity_base($row);
    foreach (['partsCost','laborCost','totalCost','directCosts','netValue','collaboratorCommission'] as $key) $sheet[$key] = $sheet[$key] !== null ? (float)$sheet[$key] : null;
    $sheet['signatureUrl'] = $sheet['signaturePath'] ? public_base_url() . '/' . ltrim($sheet['signaturePath'], '/') : null;
    unset($sheet['signaturePath']); $sheet['client'] = $client;
    return $sheet;
}
function get_sheet(string $id): array { $stmt = db()->prepare(sheet_select() . ' WHERE s.id=? LIMIT 1'); $stmt->execute([uuid_bin($id)]); $row = $stmt->fetch(); if (!$row) fail('Fișa nu există.', 404); return map_sheet($row); }

function collaborator_select(string $extraColumns = ''): string {
    return 'SELECT ' . uuid_sql('c.id') . ' id,c.name,c.phone,c.email,c.role,c.default_commission_type,c.default_commission_value,c.bank_account,c.notes,c.is_active,c.created_at,c.updated_at,' . uuid_sql('c.created_by') . ' created_by,' . uuid_sql('c.updated_by') . ' updated_by' . $extraColumns . ' FROM collaborators c';
}
function map_collaborator(array $row, ?string $propertyId = null): array {
    $collaborator = entity_base($row);
    $collaborator['defaultCommissionValue'] = (float)$collaborator['defaultCommissionValue'];
    $stmt = db()->prepare('SELECT ' . uuid_sql('property_id') . ' id FROM collaborator_properties WHERE collaborator_id=? ORDER BY property_id');
    $stmt->execute([uuid_bin($collaborator['id'])]);
    $collaborator['propertyIds'] = array_column($stmt->fetchAll(), 'id');
    if ($propertyId !== null && !array_key_exists('is_preset', $row)) {
        $preset = db()->prepare('SELECT COALESCE(is_preset,0) FROM collaborator_properties WHERE collaborator_id=? AND property_id=? LIMIT 1');
        $preset->execute([uuid_bin($collaborator['id']), uuid_bin($propertyId)]);
        $collaborator['isPreset'] = (bool)$preset->fetchColumn();
    } else {
        $collaborator['isPreset'] = (bool)($row['is_preset'] ?? false);
    }
    return $collaborator;
}
function get_collaborator(string $id, ?string $propertyId = null): array {
    $where = ['c.id=?']; $args = [uuid_bin($id)];
    if ($propertyId !== null) {
        $where[] = 'EXISTS (SELECT 1 FROM collaborator_properties cp WHERE cp.collaborator_id=c.id AND cp.property_id=?)';
        $args[] = uuid_bin($propertyId);
    }
    $stmt = db()->prepare(collaborator_select() . ' WHERE ' . implode(' AND ', $where) . ' LIMIT 1');
    $stmt->execute($args); $row = $stmt->fetch();
    if (!$row) fail('Colaboratorul nu există.', 404);
    return map_collaborator($row, $propertyId);
}
function ensure_existing_property(string $propertyId): void {
    $stmt = db()->prepare('SELECT 1 FROM properties WHERE id=? AND is_active=1 LIMIT 1');
    $stmt->execute([uuid_bin($propertyId)]);
    if (!$stmt->fetchColumn()) fail('Proprietatea nu există sau este inactivă.', 422);
}
function collaborator_for_property(string $collaboratorId, string $propertyId): array {
    $sql = 'SELECT ' . uuid_sql('c.id') . ' id,c.name,c.default_commission_type,c.default_commission_value FROM collaborators c JOIN collaborator_properties cp ON cp.collaborator_id=c.id WHERE c.id=? AND cp.property_id=? AND c.is_active=1 LIMIT 1';
    $stmt = db()->prepare($sql);
    $stmt->execute([uuid_bin($collaboratorId), uuid_bin($propertyId)]);
    $row = $stmt->fetch();
    if (!$row) fail('Colaboratorul nu este activ pentru această proprietate.', 422);
    $item = entity_base($row);
    $item['defaultCommissionValue'] = (float)$item['defaultCommissionValue'];
    return $item;
}
function preset_collaborator_for_property(string $propertyId): ?array {
    $sql = 'SELECT ' . uuid_sql('c.id') . ' id,c.name,c.default_commission_type,c.default_commission_value FROM collaborator_properties cp JOIN collaborators c ON c.id=cp.collaborator_id WHERE cp.property_id=? AND cp.is_preset=1 AND c.is_active=1 LIMIT 1';
    $stmt = db()->prepare($sql);
    $stmt->execute([uuid_bin($propertyId)]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $item = entity_base($row);
    $item['defaultCommissionValue'] = (float)$item['defaultCommissionValue'];
    return $item;
}
function property_preset_collaborator_id(string $propertyId): ?string {
    $stmt = db()->prepare('SELECT ' . uuid_sql('collaborator_id') . ' id FROM collaborator_properties WHERE property_id=? AND is_preset=1 LIMIT 1');
    $stmt->execute([uuid_bin($propertyId)]);
    $value = $stmt->fetchColumn();
    return $value !== false ? (string)$value : null;
}
function set_collaborator_preset(PDO $pdo, string $collaboratorId, string $propertyId, bool $isPreset): void {
    if ($isPreset) {
        $pdo->prepare('UPDATE collaborator_properties SET is_preset=NULL WHERE property_id=? AND is_preset=1 AND collaborator_id<>?')->execute([uuid_bin($propertyId), uuid_bin($collaboratorId)]);
        $stmt = $pdo->prepare('UPDATE collaborator_properties SET is_preset=1 WHERE collaborator_id=? AND property_id=?');
        $stmt->execute([uuid_bin($collaboratorId), uuid_bin($propertyId)]);
        if ($stmt->rowCount() === 0) {
            $exists = $pdo->prepare('SELECT 1 FROM collaborator_properties WHERE collaborator_id=? AND property_id=? LIMIT 1');
            $exists->execute([uuid_bin($collaboratorId), uuid_bin($propertyId)]);
            if (!$exists->fetchColumn()) fail('Colaboratorul nu aparține proprietății selectate.', 422);
        }
    } else {
        $pdo->prepare('UPDATE collaborator_properties SET is_preset=NULL WHERE collaborator_id=? AND property_id=? AND is_preset=1')->execute([uuid_bin($collaboratorId), uuid_bin($propertyId)]);
    }
}
function validate_commission_settings(string $type, mixed $value): float {
    if (!in_array($type, ['PERCENT_NET','PERCENT_TOTAL','FIXED'], true)) fail('Tipul comisionului nu este valid.', 422);
    if (!is_numeric($value) || (float)$value < 0 || ($type !== 'FIXED' && (float)$value > 100)) fail('Valoarea comisionului nu este validă.', 422);
    return (float)$value;
}
function validated_client_status(mixed $value): string {
    if(!is_string($value)||!in_array($value,['ACTIVE','INACTIVE','NEW','REVIEW_REQUIRED','FINALIZED'],true))fail('Statusul clientului nu este valid.',422);
    return $value;
}
function commission_amount(float $totalValue, float $netValue, string $type, float $rateOrAmount): float {
    $totalValue = max(0, $totalValue);
    $netValue = max(0, $netValue);
    $rateOrAmount = max(0, $rateOrAmount);
    if ($type === 'PERCENT_NET') return round($netValue * $rateOrAmount / 100, 2);
    if ($type === 'PERCENT_TOTAL') return round($totalValue * $rateOrAmount / 100, 2);
    return round($rateOrAmount, 2);
}
function require_financial_write(): array {
    $user = current_user();
    if ($user['role'] !== 'ADMIN' && (!in_array('financials.view', $user['permissions'], true) || !in_array('clients.update', $user['permissions'], true))) {
        fail('Nu ai permisiunea necesară pentru modificarea datelor financiare.', 403);
    }
    return $user;
}
function require_admin(): array {
    $user = current_user();
    if ($user['role'] !== 'ADMIN') fail('Această acțiune este disponibilă numai administratorilor.', 403);
    return $user;
}
function validated_uuid(mixed $value, string $label): string {
    if (!is_string($value) || preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', trim($value)) !== 1) fail($label . ' nu este valid.', 422);
    return strtolower(trim($value));
}
function validated_amount(mixed $value, string $label, float $max = 9999999999.99, bool $allowZero = true, int $scale = 2): float {
    if (!is_int($value) && !is_float($value) && !is_string($value)) fail($label . ' nu este o valoare numerică validă.', 422);
    $normalized = is_string($value) ? str_replace(',', '.', trim($value)) : $value;
    if ($normalized === '' || !is_numeric($normalized)) fail($label . ' nu este o valoare numerică validă.', 422);
    $amount = (float)$normalized;
    if (!is_finite($amount) || $amount < 0 || (!$allowZero && $amount <= 0) || $amount > $max) fail($label . ' este în afara limitelor permise.', 422);
    return round($amount, $scale);
}
function validated_currency(mixed $value): string {
    if (!is_string($value)) fail('Moneda nu este validă.', 422);
    $currency = strtoupper(trim($value));
    if (preg_match('/^[A-Z]{3}$/', $currency) !== 1) fail('Moneda trebuie să fie un cod ISO din 3 litere.', 422);
    return $currency;
}
function validated_exchange_rate(mixed $value, string $currency): float {
    $rate = validated_amount($value, 'Cursul de schimb', 99999999.999999, false, 6);
    if ($currency === 'RON' && abs($rate - 1.0) > 0.000001) fail('Pentru RON cursul trebuie să fie 1.', 422);
    return $rate;
}
function financial_default(array $client): array {
    return [
        'clientId'=>$client['id'],'propertyId'=>$client['propertyId'],'currencyCode'=>'RON','exchangeRateToRon'=>1.0,
        'workPrice'=>0.0,'diagnosticFee'=>0.0,'advancePaid'=>0.0,'discountPercent'=>0.0,'actualPartsCost'=>0.0,
        'displayedPartsCost'=>0.0,'displayedLaborCost'=>0.0,'paymentStatus'=>'UNPAID','persisted'=>false,'updatedAt'=>null,'updatedBy'=>null,
    ];
}
function client_financial_record(array $client): array {
    $sql = 'SELECT cf.currency_code,cf.exchange_rate_to_ron,cf.work_price,cf.diagnostic_fee,cf.advance_paid,cf.discount_percent,cf.actual_parts_cost,cf.displayed_parts_cost,cf.displayed_labor_cost,cf.payment_status,cf.updated_at,' . uuid_sql('cf.updated_by') . ' updated_by FROM client_financials cf WHERE cf.client_id=? LIMIT 1';
    $stmt = db()->prepare($sql); $stmt->execute([uuid_bin($client['id'])]); $row = $stmt->fetch();
    if (!$row) return financial_default($client);
    $record = entity_base($row);
    foreach (['exchangeRateToRon','workPrice','diagnosticFee','advancePaid','discountPercent','actualPartsCost','displayedPartsCost','displayedLaborCost'] as $key) $record[$key] = (float)$record[$key];
    return array_merge(['clientId'=>$client['id'],'propertyId'=>$client['propertyId']],$record,['persisted'=>true]);
}
function ensure_client_financial_shell(PDO $pdo, array $client, array $user, string $now): void {
    $stmt=$pdo->prepare('INSERT INTO client_financials (client_id,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE client_id=VALUES(client_id)');
    $stmt->execute([uuid_bin($client['id']),$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
}
function financial_mutable_snapshot(array $financial): array {
    return [
        'currencyCode'=>$financial['currencyCode'],'exchangeRateToRon'=>(float)$financial['exchangeRateToRon'],
        'workPrice'=>(float)$financial['workPrice'],'diagnosticFee'=>(float)$financial['diagnosticFee'],'advancePaid'=>(float)$financial['advancePaid'],
        'discountPercent'=>(float)$financial['discountPercent'],'actualPartsCost'=>(float)$financial['actualPartsCost'],
        'displayedPartsCost'=>(float)$financial['displayedPartsCost'],'displayedLaborCost'=>(float)$financial['displayedLaborCost'],'paymentStatus'=>$financial['paymentStatus'],
    ];
}
function financial_has_data(array $financial): bool {
    foreach (['workPrice','diagnosticFee','advancePaid','discountPercent','actualPartsCost','displayedPartsCost','displayedLaborCost'] as $key) if ((float)$financial[$key] > 0) return true;
    return $financial['currencyCode'] !== 'RON' || (float)$financial['exchangeRateToRon'] !== 1.0 || $financial['paymentStatus'] !== 'UNPAID';
}
function map_client_expense(array $row): array {
    $expense = entity_base($row); $expense['amount'] = (float)$expense['amount']; return $expense;
}
function client_expenses(string $clientId): array {
    $sql = 'SELECT ' . uuid_sql('e.id') . ' id,' . uuid_sql('e.client_id') . ' client_id,e.description,e.amount,e.created_at,e.updated_at,' . uuid_sql('e.created_by') . ' created_by,' . uuid_sql('e.updated_by') . ' updated_by FROM client_expenses e WHERE e.client_id=? ORDER BY e.created_at DESC,e.id';
    $stmt = db()->prepare($sql); $stmt->execute([uuid_bin($clientId)]); return array_map('map_client_expense',$stmt->fetchAll());
}
function get_client_expense(string $clientId, string $expenseId): array {
    $sql = 'SELECT ' . uuid_sql('e.id') . ' id,' . uuid_sql('e.client_id') . ' client_id,e.description,e.amount,e.created_at,e.updated_at,' . uuid_sql('e.created_by') . ' created_by,' . uuid_sql('e.updated_by') . ' updated_by FROM client_expenses e WHERE e.client_id=? AND e.id=? LIMIT 1';
    $stmt = db()->prepare($sql); $stmt->execute([uuid_bin($clientId),uuid_bin($expenseId)]); $row=$stmt->fetch();
    if(!$row) fail('Cheltuiala nu există.',404); return map_client_expense($row);
}
function expense_audit_snapshot(array $expense): array {
    return ['id'=>$expense['id'],'description'=>$expense['description'],'amount'=>(float)$expense['amount']];
}
function financial_summary(array $client, array $financial, array $expenses): array {
    $subtotal = round((float)$financial['workPrice'] + (float)$financial['diagnosticFee'], 2);
    $discountAmount = round($subtotal * (float)$financial['discountPercent'] / 100, 2);
    $totalDue = round(max(0, $subtotal - $discountAmount), 2);
    $receivedAmount = $financial['paymentStatus'] === 'PAID' ? $totalDue : round(min((float)$financial['advancePaid'], $totalDue), 2);
    $remainingDue = round(max(0, $totalDue - $receivedAmount), 2);
    $additionalExpenses = round(array_sum(array_map(fn($expense)=>(float)$expense['amount'],$expenses)),2);
    $internalCosts = round((float)$financial['actualPartsCost'] + $additionalExpenses,2);
    $commissionType = (string)($client['commissionType'] ?? '');
    $commissionValue = max(0,(float)($client['commissionValue'] ?? 0));
    if ($commissionType === 'PERCENT_TOTAL') $collaboratorCost = round($totalDue * $commissionValue / 100,2);
    elseif ($commissionType === 'PERCENT_NET') $collaboratorCost = round(max(0,$totalDue-$internalCosts) * $commissionValue / 100,2);
    elseif ($commissionType === 'FIXED') $collaboratorCost = round($commissionValue,2);
    else $collaboratorCost = 0.0;
    return [
        'subtotal'=>$subtotal,'discountAmount'=>$discountAmount,'totalDue'=>$totalDue,'receivedAmount'=>$receivedAmount,'remainingDue'=>$remainingDue,
        'additionalExpenses'=>$additionalExpenses,'internalCosts'=>$internalCosts,'collaboratorCost'=>$collaboratorCost,
        'gshopNet'=>round($receivedAmount-$internalCosts-$collaboratorCost,2),
    ];
}
function client_collaborator_finance(array $client, array $summary): ?array {
    $collaboratorId = (string)($client['collaboratorId'] ?? '');
    if ($collaboratorId === '') return null;
    $collaboratorStmt = db()->prepare('SELECT name,role FROM collaborators WHERE id=? LIMIT 1');
    $collaboratorStmt->execute([uuid_bin($collaboratorId)]);
    $collaborator = $collaboratorStmt->fetch();
    if (!$collaborator) return null;
    $totalsStmt = db()->prepare("SELECT COUNT(*) active_count,COALESCE(SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN commission_value ELSE 0 END),0) paid,COALESCE(SUM(CASE WHEN status IN ('ESTIMATED','CALCULATED','APPROVED') OR (status='PAID' AND paid_at IS NULL) THEN commission_value ELSE 0 END),0) due,COALESCE(SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN 1 ELSE 0 END),0) paid_count FROM commissions WHERE client_id=? AND collaborator_id=? AND is_active=1 AND status<>'CANCELLED'");
    $totalsStmt->execute([uuid_bin($client['id']),uuid_bin($collaboratorId)]);
    $totals = $totalsStmt->fetch();
    $count = (int)($totals['active_count'] ?? 0);
    $paid = round((float)($totals['paid'] ?? 0),2);
    $due = round((float)($totals['due'] ?? 0),2);
    $hasCommission = $count > 0;
    if (!$hasCommission) $due = round((float)$summary['collaboratorCost'],2);
    return [
        'id'=>$collaboratorId,
        'name'=>(string)$collaborator['name'],
        'role'=>$collaborator['role']?:null,
        'commissionType'=>$client['commissionType']??null,
        'commissionValue'=>$client['commissionValue']!==null?(float)$client['commissionValue']:null,
        'amount'=>round($paid+$due,2),
        'paid'=>$paid,
        'due'=>$due,
        'status'=>$hasCommission && (int)$totals['paid_count']===$count?'PAID':'UNPAID',
        'hasCommission'=>$hasCommission,
    ];
}
function sync_client_commission(PDO $pdo, array $client, array $financial, array $expenses, array $user, bool $recreate): array {
    $sheetStmt = $pdo->prepare('SELECT ' . uuid_sql('id') . ' id FROM service_sheets WHERE client_id=? AND is_active=1 ORDER BY updated_at DESC,created_at DESC LIMIT 1 FOR UPDATE');
    $sheetStmt->execute([uuid_bin($client['id'])]);
    $serviceSheetId = $sheetStmt->fetchColumn() ?: null;
    $commissionStmt = $pdo->prepare('SELECT ' . uuid_sql('id') . ' id,' . uuid_sql('collaborator_id') . " collaborator_id,status,paid_at,total_value,direct_costs,net_value,type,rate_or_amount,commission_value FROM commissions WHERE client_id=? AND is_active=1 AND status<>'CANCELLED' ORDER BY created_at FOR UPDATE");
    $commissionStmt->execute([uuid_bin($client['id'])]);
    $existing = $commissionStmt->fetchAll();
    $paid = array_values(array_filter($existing,fn($row)=>$row['status']==='PAID'&&!empty($row['paid_at'])));
    if ($paid) return ['changed'=>false,'paid'=>true];

    $collaboratorId = (string)($client['collaboratorId'] ?? '');
    if ($serviceSheetId===null || $collaboratorId==='') {
        $changed = (bool)$existing;
        if ($existing) $pdo->prepare("UPDATE commissions SET status='CANCELLED',is_active=0,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1 AND status<>'CANCELLED'")->execute([now_utc(),uuid_bin($user['id']),uuid_bin($client['id'])]);
        $sheetUpdate=$pdo->prepare('UPDATE service_sheets SET collaborator_id=NULL,collaborator_commission=NULL,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1');
        $sheetUpdate->execute([now_utc(),uuid_bin($user['id']),uuid_bin($client['id'])]);
        return ['changed'=>$changed||$sheetUpdate->rowCount()>0,'paid'=>false];
    }

    $summary = financial_summary($client,$financial,$expenses);
    $totalValue = round((float)$summary['totalDue'],2);
    $directCosts = round((float)$summary['internalCosts'],2);
    $netValue = round(max(0,$totalValue-$directCosts),2);
    $type = (string)$client['commissionType'];
    $rateOrAmount = (float)$client['commissionValue'];
    $amount = commission_amount($totalValue,$netValue,$type,$rateOrAmount);
    $now = now_utc();
    $single = count($existing)===1?$existing[0]:null;
    $canUpdate = !$recreate && $single!==null && $single['collaborator_id']===$collaboratorId;
    if ($canUpdate) {
        $changed = (float)$single['total_value']!==$totalValue || (float)$single['direct_costs']!==$directCosts || (float)$single['net_value']!==$netValue || $single['type']!==$type || (float)$single['rate_or_amount']!==$rateOrAmount || (float)$single['commission_value']!==$amount;
        if ($changed) {
            $update=$pdo->prepare("UPDATE commissions SET total_value=?,direct_costs=?,net_value=?,type=?,rate_or_amount=?,commission_value=?,status='APPROVED',paid_at=NULL,updated_at=?,updated_by=? WHERE id=?");
            $update->execute([$totalValue,$directCosts,$netValue,$type,$rateOrAmount,$amount,$now,uuid_bin($user['id']),uuid_bin($single['id'])]);
        }
    } else {
        if ($existing) $pdo->prepare("UPDATE commissions SET status='CANCELLED',is_active=0,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1 AND status<>'CANCELLED'")->execute([$now,uuid_bin($user['id']),uuid_bin($client['id'])]);
        $commissionId=uuid_v4();
        $insert=$pdo->prepare("INSERT INTO commissions (id,collaborator_id,client_id,service_sheet_id,property_id,total_value,direct_costs,net_value,type,rate_or_amount,commission_value,status,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,'APPROVED',1,?,?,?,?)");
        $insert->execute([uuid_bin($commissionId),uuid_bin($collaboratorId),uuid_bin($client['id']),uuid_bin($serviceSheetId),uuid_bin($client['propertyId']),$totalValue,$directCosts,$netValue,$type,$rateOrAmount,$amount,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
        $changed = true;
    }
    $sheetUpdate=$pdo->prepare('UPDATE service_sheets SET collaborator_id=?,collaborator_commission=?,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1');
    $sheetUpdate->execute([uuid_bin($collaboratorId),$amount,$now,uuid_bin($user['id']),uuid_bin($client['id'])]);
    return ['changed'=>$changed,'paid'=>false,'amount'=>$amount];
}
function client_financial_bundle(array $client): array {
    $financial = client_financial_record($client); $expenses = client_expenses($client['id']);
    $summary=financial_summary($client,$financial,$expenses);
    return ['financials'=>$financial,'summary'=>$summary,'expenses'=>$expenses,'collaborator'=>client_collaborator_finance($client,$summary)];
}
function validated_expense_description(mixed $value): string {
    if (!is_string($value)) fail('Descrierea cheltuielii este obligatorie.',422);
    $description=preg_replace('/\s+/u',' ',trim($value));$length=$description===null?false:(function_exists('mb_strlen')?mb_strlen($description,'UTF-8'):preg_match_all('/./u',$description,$characters));
    if($description===null||$length===false||$length<1||$length>120||preg_match('/[\x00-\x1F\x7F]/u',$description))fail('Descrierea trebuie să aibă între 1 și 120 de caractere.',422);
    return $description;
}
function client_participant_users(array $client): array {
    $sql='SELECT DISTINCT '.uuid_sql('u.id').' id,u.username,u.first_name,u.last_name,u.role,EXISTS(SELECT 1 FROM client_participants cp WHERE cp.client_id=? AND cp.user_id=u.id) is_assigned FROM users u JOIN user_properties up ON up.user_id=u.id WHERE up.property_id=? AND u.is_active=1 ORDER BY u.first_name,u.last_name,u.username';
    $stmt=db()->prepare($sql);$stmt->execute([uuid_bin($client['id']),uuid_bin($client['propertyId'])]);$data=[];
    foreach($stmt->fetchAll()as$row){$item=entity_base($row);$item['isAssigned']=(bool)$item['isAssigned'];$data[]=$item;}return $data;
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = route_path();
$params = [];

try {
    if ($method === 'GET' && $path === '/') respond(['name' => 'G-Shop API', 'status' => 'online', 'version' => '1.0.0', 'time' => gmdate('c')]);

    if ($method === 'POST' && $path === '/auth/login') {
        $body = json_body(); $username = trim((string)($body['username'] ?? '')); $password = (string)($body['password'] ?? '');
        if ($username === '' || $password === '') fail('Completează utilizatorul și parola.', 422);
        $stmt = db()->prepare('SELECT ' . uuid_sql('id') . ' id,password_hash FROM users WHERE username=? AND is_active=1 LIMIT 1'); $stmt->execute([$username]); $row = $stmt->fetch();
        if (!$row || !password_verify($password, $row['password_hash'])) { audit_log('LOGIN_FAILED','auth','Tentativă de autentificare eșuată pentru ' . $username,null,null,null,null,['username'=>$username],['id'=>null,'device'=>(string)($body['device']??'')]); fail('Utilizator sau parolă incorectă.', 401); }
        db()->prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?')->execute([now_utc(), now_utc(), uuid_bin($row['id'])]);
        $user = user_record($row['id']); $user['device'] = (string)($body['device'] ?? '');
        audit_log('LOGIN','auth','Autentificare reușită', 'User', $user['id'], null, null, null, $user);
        respond(auth_session($user, (string)($body['device'] ?? 'Unknown device')));
    }
    if ($method === 'POST' && $path === '/auth/refresh') {
        $body = json_body(); $refresh = (string)($body['refreshToken'] ?? '');
        if ($refresh === '') fail('Refresh token lipsește.', 401);
        $stmt = db()->prepare('SELECT ' . uuid_sql('id') . ' id,' . uuid_sql('user_id') . ' user_id,device FROM refresh_sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>? LIMIT 1'); $stmt->execute([hash('sha256', $refresh, true), now_utc()]); $session = $stmt->fetch();
        if (!$session) fail('Sesiunea nu mai este validă.', 401);
        db()->prepare('UPDATE refresh_sessions SET revoked_at=? WHERE id=?')->execute([now_utc(), uuid_bin($session['id'])]);
        respond(auth_session(user_record($session['user_id']), (string)$session['device']));
    }
    if ($method === 'GET' && $path === '/auth/me') respond(current_user());
    if ($method === 'PUT' && $path === '/auth/profile') {
        $user = current_user();
        $body = json_body();
        $firstName = validated_person_name($body['firstName'] ?? null, 'Prenumele');
        $lastName = validated_person_name($body['lastName'] ?? null, 'Numele');
        $before = user_record($user['id']);
        if ($firstName === $before['firstName'] && $lastName === $before['lastName']) respond($before);
        $now = now_utc();
        db()->prepare('UPDATE users SET first_name=?,last_name=?,updated_at=?,updated_by=? WHERE id=? AND is_active=1')->execute([$firstName,$lastName,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
        $after = user_record($user['id']);
        $profileBefore = ['firstName'=>$before['firstName'],'lastName'=>$before['lastName']];
        $profileAfter = ['firstName'=>$after['firstName'],'lastName'=>$after['lastName']];
        audit_log('USER_PROFILE_UPDATED','users','Numele propriu a fost actualizat','User',$user['id'],$after['propertyIds'][0]??null,$profileBefore,$profileAfter,$user);
        respond($after);
    }
    if ($method === 'POST' && $path === '/auth/logout') { $user = current_user(); db()->prepare('UPDATE refresh_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')->execute([now_utc(), uuid_bin($user['id'])]); audit_log('LOGOUT','auth','Deconectare din aplicație','User',$user['id'],null,null,null,$user); respond(['loggedOut'=>true]); }
    if ($method === 'POST' && $path === '/auth/forgot-password') { $body=json_body(); $email=trim((string)($body['email']??'')); if (!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Email invalid.',422); db()->prepare('INSERT INTO password_reset_requests (id,email,ip_address,created_at) VALUES (?,?,?,?)')->execute([uuid_bin(uuid_v4()),$email,request_ip(),now_utc()]); respond(['requested'=>true]); }
    if ($method === 'POST' && $path === '/auth/change-password') { $user=current_user(); $body=json_body(); $stmt=db()->prepare('SELECT password_hash FROM users WHERE id=?');$stmt->execute([uuid_bin($user['id'])]);$hash=$stmt->fetchColumn(); if (!$hash || !password_verify((string)($body['currentPassword']??''),$hash)) fail('Parola curentă este incorectă.',422);$next=(string)($body['newPassword']??'');if(strlen($next)<8)fail('Parola nouă trebuie să aibă minimum 8 caractere.',422);db()->prepare('UPDATE users SET password_hash=?,updated_at=?,updated_by=? WHERE id=?')->execute([password_hash($next,PASSWORD_DEFAULT),now_utc(),uuid_bin($user['id']),uuid_bin($user['id'])]);audit_log('PASSWORD_CHANGED','users','Parola proprie a fost schimbată','User',$user['id']);respond(['changed'=>true]); }

    if ($method === 'POST' && $path === '/admin/migrations/collaborator-presets') {
        $user = require_permission('settings.manage');
        $changes = migrate_collaborator_presets(db());
        if ($changes) audit_log('SCHEMA_MIGRATION_APPLIED','settings','Migrare aplicată pentru colaboratorul presetat și comisioane','Database',null,null,null,['migration'=>'collaborator-presets-v1','changes'=>$changes],$user);
        respond(['migration'=>'collaborator-presets-v1','applied'=>(bool)$changes,'changes'=>$changes,'ready'=>true]);
    }
    if ($method === 'POST' && $path === '/admin/migrations/client-finance') {
        $user = require_permission('settings.manage');
        $changes = migrate_client_finance(db());
        if ($changes) audit_log('SCHEMA_MIGRATION_APPLIED','settings','Migrare aplicată pentru finanțele clienților','Database',null,null,null,['migration'=>'client-finance-v1','changes'=>$changes],$user);
        respond(['migration'=>'client-finance-v1','applied'=>(bool)$changes,'changes'=>$changes,'ready'=>true]);
    }

    if ($method === 'GET' && $path === '/properties') {
        $user = current_user(); $sql = 'SELECT ' . uuid_sql('p.id') . ' id,p.name,p.domain,p.type,p.enabled_modules,p.is_active,p.created_at,p.updated_at,' . uuid_sql('p.created_by') . ' created_by,' . uuid_sql('p.updated_by') . ' updated_by FROM properties p';
        $args=[]; if ($user['role'] !== 'ADMIN') { $sql .= ' JOIN user_properties up ON up.property_id=p.id WHERE up.user_id=?'; $args[] = uuid_bin($user['id']); } else $sql .= ' WHERE 1=1';
        $sql .= ' AND p.is_active=1 ORDER BY p.type,p.name'; $stmt=db()->prepare($sql);$stmt->execute($args);$rows=[];foreach($stmt->fetchAll() as $row){$item=entity_base($row);$item['enabledModules']=json_decode((string)$row['enabled_modules'],true)?:[];unset($item['enabledModules'][0]);$item['enabledModules']=json_decode((string)$row['enabled_modules'],true)?:[];$rows[]=$item;}respond($rows);
    }

    if ($method === 'GET' && $path === '/dashboard') {
        $user=require_permission('dashboard.view');$propertyId=(string)($_GET['propertyId']??'');ensure_property($propertyId,$user);$p=uuid_bin($propertyId);$pdo=db();
        $scalar=function(string $sql,array $args=[])use($pdo){$stmt=$pdo->prepare($sql);$stmt->execute($args);return $stmt->fetchColumn();};
        $clients=(int)$scalar('SELECT COUNT(*) FROM clients WHERE property_id=? AND is_active=1',[$p]);$clientsNew=(int)$scalar('SELECT COUNT(*) FROM clients WHERE property_id=? AND is_active=1 AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)',[$p]);
        $open=(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS')",[$p]);$progress=(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status='IN_PROGRESS'",[$p]);$completed=(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('COMPLETED','DELIVERED')",[$p]);
        $users=(int)$scalar('SELECT COUNT(*) FROM user_properties up JOIN users u ON u.id=up.user_id WHERE up.property_id=? AND u.is_active=1',[$p]);$collabs=(int)$scalar('SELECT COUNT(*) FROM collaborator_properties cp JOIN collaborators c ON c.id=cp.collaborator_id WHERE cp.property_id=? AND c.is_active=1',[$p]);
        $qrGenerated=(int)$scalar("SELECT COUNT(*) FROM client_qr WHERE property_id=? AND is_active=1 AND status IN ('GENERATED','SENT')",[$p]);$qrUsed=(int)$scalar("SELECT COUNT(*) FROM client_qr WHERE property_id=? AND is_active=1 AND status='USED'",[$p]);
        $financeSql="SELECT COALESCE(cf.currency_code,'RON') currency_code,COALESCE(cf.exchange_rate_to_ron,1) exchange_rate_to_ron,COALESCE(cf.work_price,0) work_price,COALESCE(cf.diagnostic_fee,0) diagnostic_fee,COALESCE(cf.advance_paid,0) advance_paid,COALESCE(cf.discount_percent,0) discount_percent,COALESCE(cf.actual_parts_cost,0) actual_parts_cost,COALESCE(cf.payment_status,'UNPAID') payment_status,c.commission_type,c.commission_value,COALESCE(ex.total_expenses,0) total_expenses,COALESCE(cm.commission_count,0) commission_count,COALESCE(cm.commission_total,0) commission_total FROM clients c LEFT JOIN client_financials cf ON cf.client_id=c.id LEFT JOIN (SELECT client_id,SUM(amount) total_expenses FROM client_expenses GROUP BY client_id) ex ON ex.client_id=c.id LEFT JOIN (SELECT client_id,COUNT(*) commission_count,SUM(commission_value) commission_total FROM commissions WHERE is_active=1 AND status<>'CANCELLED' GROUP BY client_id) cm ON cm.client_id=c.id WHERE c.property_id=? AND c.is_active=1 AND (cf.client_id IS NOT NULL OR ex.client_id IS NOT NULL)";
        $financeStmt=$pdo->prepare($financeSql);$financeStmt->execute([$p]);$financeRevenueRon=0.0;$financeHoldRon=0.0;$financeNetRon=0.0;$financeWaiting=0;
        foreach($financeStmt->fetchAll()as$row){
            $rate=(float)$row['exchange_rate_to_ron'];$subtotal=(float)$row['work_price']+(float)$row['diagnostic_fee'];$total=max(0,$subtotal-($subtotal*(float)$row['discount_percent']/100));
            $received=$row['payment_status']==='PAID'?$total:min((float)$row['advance_paid'],$total);$remaining=max(0,$total-$received);$internal=(float)$row['actual_parts_cost']+(float)$row['total_expenses'];
            $commissionValue=max(0,(float)($row['commission_value']??0));$commissionType=(string)($row['commission_type']??'');
            if((int)$row['commission_count']>0)$commission=(float)$row['commission_total'];elseif($commissionType==='PERCENT_TOTAL')$commission=$total*$commissionValue/100;elseif($commissionType==='PERCENT_NET')$commission=max(0,$total-$internal)*$commissionValue/100;elseif($commissionType==='FIXED')$commission=$commissionValue;else$commission=0.0;
            $financeRevenueRon+=$received*$rate;$financeHoldRon+=$remaining*$rate;$financeNetRon+=($received-$internal-$commission)*$rate;if($remaining>0.004)$financeWaiting++;
        }
        $legacyStmt=$pdo->prepare("SELECT COALESCE(SUM(CASE WHEN s.status IN ('COMPLETED','DELIVERED') THEN s.total_cost ELSE 0 END),0) total_revenue,COALESCE(SUM(CASE WHEN s.status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS') THEN s.total_cost ELSE 0 END),0) revenue_on_hold,COALESCE(SUM(s.direct_costs),0) direct_costs,COUNT(DISTINCT CASE WHEN s.status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS') THEN s.client_id END) clients_waiting FROM service_sheets s JOIN clients c ON c.id=s.client_id LEFT JOIN client_financials cf ON cf.client_id=c.id WHERE s.property_id=? AND c.is_active=1 AND cf.client_id IS NULL AND NOT EXISTS(SELECT 1 FROM client_expenses e WHERE e.client_id=c.id) AND s.is_active=1 AND s.status<>'CANCELLED'");$legacyStmt->execute([$p]);$legacy=$legacyStmt->fetch();
        $legacyCommission=(float)$scalar("SELECT COALESCE(SUM(co.commission_value),0) FROM commissions co JOIN clients c ON c.id=co.client_id LEFT JOIN client_financials cf ON cf.client_id=c.id WHERE co.property_id=? AND c.is_active=1 AND cf.client_id IS NULL AND NOT EXISTS(SELECT 1 FROM client_expenses e WHERE e.client_id=c.id) AND co.is_active=1 AND co.status<>'CANCELLED'",[$p]);
        $legacyRevenue=(float)$legacy['total_revenue'];$legacyDirectCosts=(float)$legacy['direct_costs'];$totalRevenue=$financeRevenueRon+$legacyRevenue;$revenueOnHold=$financeHoldRon+(float)$legacy['revenue_on_hold'];$clientsWaiting=$financeWaiting+(int)$legacy['clients_waiting'];
        $commissionStmt=$pdo->prepare("SELECT COALESCE(SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN commission_value ELSE 0 END),0) paid,COALESCE(SUM(CASE WHEN status IN ('ESTIMATED','CALCULATED','APPROVED') OR (status='PAID' AND paid_at IS NULL) THEN commission_value ELSE 0 END),0) on_hold FROM commissions WHERE property_id=? AND is_active=1 AND status<>'CANCELLED'");$commissionStmt->execute([$p]);$commissionSummary=$commissionStmt->fetch();
        $collaboratorPaid=(float)$commissionSummary['paid'];$collaboratorOnHold=(float)$commissionSummary['on_hold'];$collaboratorTotal=$collaboratorPaid+$collaboratorOnHold;$gshopNet=$financeNetRon+($legacyRevenue-$legacyDirectCosts-$legacyCommission);
        respond(['clientsTotal'=>$clients,'totalRevenue'=>round($totalRevenue,2),'clientsWaiting'=>$clientsWaiting,'revenueOnHold'=>round($revenueOnHold,2),'gshopNet'=>round($gshopNet,2),'collaboratorTotal'=>round($collaboratorTotal,2),'collaboratorPaid'=>round($collaboratorPaid,2),'collaboratorOnHold'=>round($collaboratorOnHold,2),'clientsNew'=>$clientsNew,'serviceSheetsOpen'=>$open,'serviceSheetsInProgress'=>$progress,'serviceSheetsCompleted'=>$completed,'usersActive'=>$users,'collaboratorsActive'=>$collabs,'qrGenerated'=>$qrGenerated,'qrUsed'=>$qrUsed,'estimatedRevenue'=>round($totalRevenue,2),'collaboratorCommissions'=>round($collaboratorTotal,2),'collaboratorPayments'=>round($collaboratorPaid,2)]);
    }

    if ($method === 'GET' && $path === '/clients') {
        $user=require_permission('clients.view');$propertyId=(string)($_GET['propertyId']??'');ensure_property($propertyId,$user);$query=trim((string)($_GET['query']??''));$qrStatus=trim((string)($_GET['qrStatus']??''));$page=max(1,(int)($_GET['page']??1));$pageSize=min(100,max(1,(int)($_GET['pageSize']??50)));$where=['c.property_id=?','c.is_active=1'];$args=[uuid_bin($propertyId)];
        if($query!==''){$where[]='(c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)';$like='%'.$query.'%';array_push($args,$like,$like,$like,$like);} if($qrStatus==='NOT_GENERATED')$where[]='q.id IS NULL';elseif($qrStatus!==''){$where[]='q.status=?';$args[]=$qrStatus;}
        $sql=client_select().' WHERE '.implode(' AND ',$where).' ORDER BY c.updated_at DESC LIMIT '.$pageSize.' OFFSET '.(($page-1)*$pageSize);$stmt=db()->prepare($sql);$stmt->execute($args);$data=array_map(fn($row)=>client_for_user(map_client($row),$user),$stmt->fetchAll());
        $countSql='SELECT COUNT(DISTINCT c.id) FROM clients c LEFT JOIN client_qr q ON q.client_id=c.id AND q.is_active=1 WHERE '.implode(' AND ',$where);$count=db()->prepare($countSql);$count->execute($args);$total=(int)$count->fetchColumn();respond(['data'=>$data,'page'=>$page,'pageSize'=>$pageSize,'total'=>$total,'totalPages'=>(int)ceil($total/$pageSize)]);
    }
    if ($method === 'GET' && path_match('/clients/{id}', $path, $params)) { $user=require_permission('clients.view');$client=get_client($params['id']);ensure_property($client['propertyId'],$user);respond(client_for_user($client,$user)); }
    if ($method === 'GET' && path_match('/clients/{id}/financials',$path,$params)) {
        $user=require_permission('financials.view');$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);respond(client_financial_bundle($client));
    }
    if ($method === 'PUT' && path_match('/clients/{id}/financials',$path,$params)) {
        $user=require_financial_write();$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);$body=json_body();$before=client_financial_record($client);$next=$before;
        $currency=array_key_exists('currencyCode',$body)?validated_currency($body['currencyCode']):$before['currencyCode'];$next['currencyCode']=$currency;
        if($currency==='RON')$next['exchangeRateToRon']=array_key_exists('exchangeRateToRon',$body)?validated_exchange_rate($body['exchangeRateToRon'],$currency):1.0;
        else{if(!array_key_exists('exchangeRateToRon',$body)&&(!$before['persisted']||$currency!==$before['currencyCode']))fail('Cursul de schimb este obligatoriu pentru moneda selectată.',422);$next['exchangeRateToRon']=array_key_exists('exchangeRateToRon',$body)?validated_exchange_rate($body['exchangeRateToRon'],$currency):(float)$before['exchangeRateToRon'];}
        $amountFields=['workPrice'=>'Prețul lucrării','diagnosticFee'=>'Taxa de diagnostic','advancePaid'=>'Avansul','actualPartsCost'=>'Costul efectiv al pieselor','displayedPartsCost'=>'Costul afișat al pieselor','displayedLaborCost'=>'Manopera afișată'];
        foreach($amountFields as$key=>$label)if(array_key_exists($key,$body))$next[$key]=validated_amount($body[$key],$label);
        if(array_key_exists('discountPercent',$body))$next['discountPercent']=validated_amount($body['discountPercent'],'Reducerea',100,true,2);
        if(array_key_exists('paymentStatus',$body)){if(!is_string($body['paymentStatus'])||!in_array($body['paymentStatus'],['UNPAID','PAID'],true))fail('Statusul plății nu este valid.',422);$next['paymentStatus']=$body['paymentStatus'];}
        $pdo=db();$pdo->beginTransaction();
        $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($client['id'])]);
        $lockedBefore=client_financial_record($client);$lockedNext=$lockedBefore;
        foreach(['currencyCode','exchangeRateToRon','workPrice','diagnosticFee','advancePaid','discountPercent','actualPartsCost','displayedPartsCost','displayedLaborCost','paymentStatus']as$key)if(array_key_exists($key,$body))$lockedNext[$key]=$next[$key];
        if(array_key_exists('currencyCode',$body)&&$lockedNext['currencyCode']==='RON'&&!array_key_exists('exchangeRateToRon',$body))$lockedNext['exchangeRateToRon']=1.0;
        $before=$lockedBefore;$next=$lockedNext;$beforeSnapshot=financial_mutable_snapshot($before);$nextSnapshot=financial_mutable_snapshot($next);
        $expenseCountStmt=$pdo->prepare('SELECT COUNT(*) FROM client_expenses WHERE client_id=?');$expenseCountStmt->execute([uuid_bin($client['id'])]);$expenseCount=(int)$expenseCountStmt->fetchColumn();
        if(!financial_has_data($next)&&$expenseCount===0){
            $syncResult=sync_client_commission($pdo,$client,$next,[],$user,false);
            if($before['persisted'])$pdo->prepare('DELETE FROM client_financials WHERE client_id=?')->execute([uuid_bin($client['id'])]);
            $pdo->commit();
            if($before['persisted'])audit_log('CLIENT_FINANCIALS_CLEARED','financials','Datele financiare ale clientului au fost golite','Client',$client['id'],$client['propertyId'],$beforeSnapshot,null,$user);
            if($syncResult['changed'])audit_log('CLIENT_COMMISSION_RECALCULATED','commissions','Comisionul colaboratorului a fost recalculat din finanțele clientului','Client',$client['id'],$client['propertyId'],null,client_financial_bundle($client)['collaborator'],$user);
            respond(client_financial_bundle($client));
        }
        if($before['persisted']&&$beforeSnapshot===$nextSnapshot){$pdo->rollBack();respond(client_financial_bundle($client));}
        $now=now_utc();
        if($before['persisted']){
            $stmt=$pdo->prepare('UPDATE client_financials SET currency_code=?,exchange_rate_to_ron=?,work_price=?,diagnostic_fee=?,advance_paid=?,discount_percent=?,actual_parts_cost=?,displayed_parts_cost=?,displayed_labor_cost=?,payment_status=?,updated_at=?,updated_by=? WHERE client_id=?');
            $stmt->execute([$next['currencyCode'],$next['exchangeRateToRon'],$next['workPrice'],$next['diagnosticFee'],$next['advancePaid'],$next['discountPercent'],$next['actualPartsCost'],$next['displayedPartsCost'],$next['displayedLaborCost'],$next['paymentStatus'],$now,uuid_bin($user['id']),uuid_bin($client['id'])]);
        }else{
            $stmt=$pdo->prepare('INSERT INTO client_financials (client_id,currency_code,exchange_rate_to_ron,work_price,diagnostic_fee,advance_paid,discount_percent,actual_parts_cost,displayed_parts_cost,displayed_labor_cost,payment_status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
            $stmt->execute([uuid_bin($client['id']),$next['currencyCode'],$next['exchangeRateToRon'],$next['workPrice'],$next['diagnosticFee'],$next['advancePaid'],$next['discountPercent'],$next['actualPartsCost'],$next['displayedPartsCost'],$next['displayedLaborCost'],$next['paymentStatus'],$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
        }
        $after=client_financial_record($client);$expenses=client_expenses($client['id']);$beforeCollaborator=client_collaborator_finance($client,financial_summary($client,$before,$expenses));$syncResult=sync_client_commission($pdo,$client,$after,$expenses,$user,false);$pdo->commit();
        $afterSnapshot=financial_mutable_snapshot($after);audit_log($before['persisted']?'CLIENT_FINANCIALS_UPDATED':'CLIENT_FINANCIALS_CREATED','financials','Datele financiare ale clientului au fost salvate','Client',$client['id'],$client['propertyId'],$before['persisted']?$beforeSnapshot:null,$afterSnapshot,$user);
        if($syncResult['changed'])audit_log('CLIENT_COMMISSION_RECALCULATED','commissions','Comisionul colaboratorului a fost recalculat din finanțele clientului','Client',$client['id'],$client['propertyId'],$beforeCollaborator,client_financial_bundle($client)['collaborator'],$user);
        respond(client_financial_bundle($client));
    }
    if ($method === 'GET' && path_match('/clients/{id}/expenses',$path,$params)) {
        $user=require_permission('financials.view');$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);respond(client_expenses($client['id']));
    }
    if ($method === 'POST' && path_match('/clients/{id}/expenses',$path,$params)) {
        $user=require_financial_write();$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);$body=json_body();$description=validated_expense_description($body['description']??null);$amount=validated_amount($body['amount']??null,'Valoarea cheltuielii',9999999999.99,false);$id=uuid_v4();$now=now_utc();
        $pdo=db();$pdo->beginTransaction();try{ensure_client_financial_shell($pdo,$client,$user,$now);$pdo->prepare('INSERT INTO client_expenses (id,client_id,description,amount,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)')->execute([uuid_bin($id),uuid_bin($client['id']),$description,$amount,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);$pdo->commit();}catch(Throwable$e){$pdo->rollBack();throw$e;}$expense=get_client_expense($client['id'],$id);audit_log('CLIENT_EXPENSE_CREATED','financials','Cheltuială adăugată clientului','Client',$client['id'],$client['propertyId'],null,expense_audit_snapshot($expense),$user);respond($expense,201);
    }
    if ($method === 'PUT' && path_match('/clients/{id}/expenses/{expenseId}',$path,$params)) {
        $user=require_financial_write();$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);$expenseId=validated_uuid($params['expenseId'],'Cheltuiala');$before=get_client_expense($client['id'],$expenseId);$body=json_body();$description=array_key_exists('description',$body)?validated_expense_description($body['description']):$before['description'];$amount=array_key_exists('amount',$body)?validated_amount($body['amount'],'Valoarea cheltuielii',9999999999.99,false):(float)$before['amount'];$beforeSnapshot=expense_audit_snapshot($before);$nextSnapshot=['id'=>$expenseId,'description'=>$description,'amount'=>$amount];if($beforeSnapshot===$nextSnapshot)respond($before);
        db()->prepare('UPDATE client_expenses SET description=?,amount=?,updated_at=?,updated_by=? WHERE id=? AND client_id=?')->execute([$description,$amount,now_utc(),uuid_bin($user['id']),uuid_bin($expenseId),uuid_bin($client['id'])]);$after=get_client_expense($client['id'],$expenseId);audit_log('CLIENT_EXPENSE_UPDATED','financials','Cheltuială actualizată pentru client','Client',$client['id'],$client['propertyId'],$beforeSnapshot,expense_audit_snapshot($after),$user);respond($after);
    }
    if ($method === 'DELETE' && path_match('/clients/{id}/expenses/{expenseId}',$path,$params)) {
        $user=require_financial_write();$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);$expenseId=validated_uuid($params['expenseId'],'Cheltuiala');$before=get_client_expense($client['id'],$expenseId);$pdo=db();$pdo->beginTransaction();try{$pdo->prepare('DELETE FROM client_expenses WHERE id=? AND client_id=?')->execute([uuid_bin($expenseId),uuid_bin($client['id'])]);$remaining=$pdo->prepare('SELECT COUNT(*) FROM client_expenses WHERE client_id=?');$remaining->execute([uuid_bin($client['id'])]);if((int)$remaining->fetchColumn()===0){$financial=client_financial_record($client);if($financial['persisted']&&!financial_has_data($financial))$pdo->prepare('DELETE FROM client_financials WHERE client_id=?')->execute([uuid_bin($client['id'])]);}$pdo->commit();}catch(Throwable$e){$pdo->rollBack();throw$e;}audit_log('CLIENT_EXPENSE_DELETED','financials','Cheltuială ștearsă de la client','Client',$client['id'],$client['propertyId'],expense_audit_snapshot($before),null,$user);respond(['deleted'=>true,'id'=>$expenseId]);
    }
    if ($method === 'GET' && path_match('/clients/{id}/participants',$path,$params)) {
        $user=require_admin();$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);respond(client_participant_users($client));
    }
    if ($method === 'PUT' && path_match('/clients/{id}/participants',$path,$params)) {
        $user=require_admin();$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);$body=json_body();$rawIds=$body['userIds']??null;if(!is_array($rawIds)||count($rawIds)>100)fail('Lista participanților este invalidă.',422);$userIds=[];foreach($rawIds as$value)$userIds[]=validated_uuid($value,'Participantul');$userIds=array_values(array_unique($userIds));sort($userIds);
        if($userIds){$placeholders=implode(',',array_fill(0,count($userIds),'?'));$args=[uuid_bin($client['propertyId'])];foreach($userIds as$id)$args[]=uuid_bin($id);$check=db()->prepare('SELECT COUNT(DISTINCT u.id) FROM users u JOIN user_properties up ON up.user_id=u.id WHERE up.property_id=? AND u.is_active=1 AND u.id IN ('.$placeholders.')');$check->execute($args);if((int)$check->fetchColumn()!==count($userIds))fail('Unul sau mai mulți participanți nu sunt utilizatori activi ai proprietății.',422);}
        $beforeStmt=db()->prepare('SELECT '.uuid_sql('user_id').' id FROM client_participants WHERE client_id=? ORDER BY user_id');$beforeStmt->execute([uuid_bin($client['id'])]);$beforeIds=array_column($beforeStmt->fetchAll(),'id');sort($beforeIds);if($beforeIds===$userIds)respond(client_participant_users($client));
        $pdo=db();$pdo->beginTransaction();try{$pdo->prepare('DELETE FROM client_participants WHERE client_id=?')->execute([uuid_bin($client['id'])]);if($userIds){$insert=$pdo->prepare('INSERT INTO client_participants (client_id,user_id) VALUES (?,?)');foreach($userIds as$id)$insert->execute([uuid_bin($client['id']),uuid_bin($id)]);}$pdo->commit();}catch(Throwable$e){$pdo->rollBack();throw$e;}
        $auditBefore=['userIds'=>implode(',',$beforeIds)];$auditAfter=['userIds'=>implode(',',$userIds)];audit_log('CLIENT_PARTICIPANTS_UPDATED','clients','Participanții clientului au fost actualizați','Client',$client['id'],$client['propertyId'],$auditBefore,$auditAfter,$user);respond(client_participant_users($client));
    }
    if ($method === 'POST' && $path === '/clients') {
        $user=require_permission('clients.create');$body=json_body();$propertyId=trim((string)($body['propertyId']??''));ensure_property($propertyId,$user);
        foreach(['firstName','lastName','phone']as$key)if(trim((string)($body[$key]??''))==='')fail('Câmpuri obligatorii lipsă.',422);
        $clientStatus=validated_client_status($body['status']??'NEW');
        $hasExplicitCollaborator=array_key_exists('collaboratorId',$body);$collaboratorId=$hasExplicitCollaborator?trim((string)($body['collaboratorId']??'')):'';$commissionType=null;$commissionValue=null;
        if(!$hasExplicitCollaborator){
            $collaborator=preset_collaborator_for_property($propertyId);
            if($collaborator!==null){$collaboratorId=$collaborator['id'];$commissionType=$collaborator['defaultCommissionType'];$commissionValue=validate_commission_settings($commissionType,$collaborator['defaultCommissionValue']);}
        }elseif($collaboratorId!==''){
            $collaborator=collaborator_for_property($collaboratorId,$propertyId);$commissionType=(string)($body['commissionType']??$collaborator['defaultCommissionType']);$commissionValue=validate_commission_settings($commissionType,$body['commissionValue']??$collaborator['defaultCommissionValue']);
        }
        $id=uuid_v4();$now=now_utc();$pdo=db();$pdo->beginTransaction();
        try{
            $stmt=$pdo->prepare('INSERT INTO clients (id,property_id,first_name,last_name,phone,secondary_phone,email,address,city,county,postal_code,notes,status,collaborator_id,commission_type,commission_value,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)');
            $stmt->execute([uuid_bin($id),uuid_bin($propertyId),trim($body['firstName']),trim($body['lastName']),trim($body['phone']),$body['secondaryPhone']??null,$body['email']??null,$body['address']??null,$body['city']??null,$body['county']??null,$body['postalCode']??null,$body['notes']??null,$clientStatus,$collaboratorId!==''?uuid_bin($collaboratorId):null,$commissionType,$commissionValue,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
            $qr=create_client_qr($pdo,$id,$propertyId,$user['id'],$now);
            $pdo->commit();
        }catch(Throwable$e){$pdo->rollBack();throw$e;}
        $created=get_client($id);audit_log('CLIENT_CREATED','clients','Client creat: '.trim($body['firstName'].' '.$body['lastName']),'Client',$id,$propertyId,null,client_audit_snapshot($created),$user);audit_log('QR_GENERATED','qr','QR generat automat pentru '.$created['firstName'].' '.$created['lastName'],'ClientQR',$qr['id'],$propertyId,null,$qr,$user);respond(client_for_user($created,$user),201);
    }
    if ($method === 'PUT' && path_match('/clients/{id}', $path, $params)) {
        $user=require_permission('clients.update');$before=get_client($params['id']);ensure_property($before['propertyId'],$user);$body=json_body();
        if(array_key_exists('status',$body))$body['status']=validated_client_status($body['status']);
        $assignmentTouched=count(array_intersect(array_keys($body),['collaboratorId','commissionType','commissionValue']))>0;
        $removeCollaborator=array_key_exists('collaboratorId',$body)&&trim((string)($body['collaboratorId']??''))==='';
        if($removeCollaborator){unset($body['commissionType'],$body['commissionValue']);}
        if(array_key_exists('collaboratorId',$body)&&trim((string)($body['collaboratorId']??''))!==''){
            $nextCollaboratorId=validated_uuid(trim((string)$body['collaboratorId']),'Colaboratorul');$body['collaboratorId']=$nextCollaboratorId;$collaborator=collaborator_for_property($nextCollaboratorId,$before['propertyId']);$changedCollaborator=($before['collaboratorId']??null)!==$nextCollaboratorId;
            if(!array_key_exists('commissionType',$body)&&($changedCollaborator||empty($before['commissionType'])))$body['commissionType']=$collaborator['defaultCommissionType'];
            if(!array_key_exists('commissionValue',$body)&&($changedCollaborator||$before['commissionValue']===null))$body['commissionValue']=$collaborator['defaultCommissionValue'];
        }
        if(count(array_intersect(array_keys($body),['collaboratorId','commissionType','commissionValue']))>0){
            $effectiveCollaboratorId=array_key_exists('collaboratorId',$body)?trim((string)($body['collaboratorId']??'')):(string)($before['collaboratorId']??'');
            if($effectiveCollaboratorId!==''){$effectiveType=(string)($body['commissionType']??$before['commissionType']??'');$effectiveValue=$body['commissionValue']??$before['commissionValue'];$body['commissionValue']=validate_commission_settings($effectiveType,$effectiveValue);}
            elseif(array_key_exists('commissionType',$body)||array_key_exists('commissionValue',$body))fail('O regulă de comision necesită un colaborator atribuit.',422);
        }
        $map=['firstName'=>'first_name','lastName'=>'last_name','phone'=>'phone','secondaryPhone'=>'secondary_phone','email'=>'email','address'=>'address','city'=>'city','county'=>'county','postalCode'=>'postal_code','notes'=>'notes','status'=>'status','commissionType'=>'commission_type','commissionValue'=>'commission_value'];
        $sets=[];$args=[];
        foreach($map as$key=>$column)if(array_key_exists($key,$body)){
            if($key==='commissionType')validate_commission_settings((string)$body[$key],$body['commissionValue']??$before['commissionValue']);
            if($key==='commissionValue')validate_commission_settings((string)($body['commissionType']??$before['commissionType']),$body[$key]);
            $sets[]="$column=?";$args[]=$body[$key]!==''?$body[$key]:null;
        }
        if(array_key_exists('collaboratorId',$body)){
            $collaboratorId=trim((string)($body['collaboratorId']??''));
            if($collaboratorId!=='')collaborator_for_property($collaboratorId,$before['propertyId']);
            $sets[]='collaborator_id=?';$args[]=$collaboratorId!==''?uuid_bin($collaboratorId):null;
            if($collaboratorId===''){
                if(!array_key_exists('commissionType',$body)){$sets[]='commission_type=NULL';}
                if(!array_key_exists('commissionValue',$body)){$sets[]='commission_value=NULL';}
            }
        }
        if(!$sets)fail('Nu există date de actualizat.',422);
        $nextCollaboratorId=array_key_exists('collaboratorId',$body)?(trim((string)($body['collaboratorId']??''))?:null):($before['collaboratorId']??null);
        $nextCommissionType=$nextCollaboratorId!==null?($body['commissionType']??$before['commissionType']??null):null;
        $nextCommissionValue=$nextCollaboratorId!==null?($body['commissionValue']??$before['commissionValue']??null):null;
        $assignmentChanged=$assignmentTouched&&(($before['collaboratorId']??null)!==$nextCollaboratorId||($before['commissionType']??null)!==$nextCommissionType||(float)($before['commissionValue']??0)!==(float)($nextCommissionValue??0));
        $now=now_utc();$sets[]='updated_at=?';$args[]=$now;$sets[]='updated_by=?';$args[]=uuid_bin($user['id']);$args[]=uuid_bin($params['id']);$pdo=db();$pdo->beginTransaction();
        $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($params['id'])]);$lockedBefore=get_client($params['id']);
        if($assignmentTouched&&(($lockedBefore['collaboratorId']??null)!==($before['collaboratorId']??null)||($lockedBefore['commissionType']??null)!==($before['commissionType']??null)||(float)($lockedBefore['commissionValue']??0)!==(float)($before['commissionValue']??0))){$pdo->rollBack();fail('Atribuirea colaboratorului a fost modificată între timp. Reîncarcă clientul.',409,['code'=>'CLIENT_COLLABORATOR_CHANGED']);}
        if($assignmentChanged){$paidStmt=$pdo->prepare("SELECT 1 FROM commissions WHERE client_id=? AND is_active=1 AND status='PAID' AND paid_at IS NOT NULL LIMIT 1");$paidStmt->execute([uuid_bin($params['id'])]);if($paidStmt->fetchColumn()){$pdo->rollBack();fail('Comisionul colaboratorului este achitat. Marchează-l neachitat înainte să schimbi sau să ștergi atribuirea.',409,['code'=>'COLLABORATOR_COMMISSION_PAID']);}}
        $beforeFinancial=client_financial_record($before);$expenses=client_expenses($before['id']);$beforeCollaborator=client_collaborator_finance($before,financial_summary($before,$beforeFinancial,$expenses));
        try{$pdo->prepare('UPDATE clients SET '.implode(',',$sets).' WHERE id=?')->execute($args);$after=get_client($params['id']);if($assignmentChanged)sync_client_commission($pdo,$after,$beforeFinancial,$expenses,$user,true);$pdo->commit();}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        audit_log('CLIENT_UPDATED','clients','Client actualizat: '.$after['firstName'].' '.$after['lastName'],'Client',$params['id'],$after['propertyId'],client_audit_snapshot($before),client_audit_snapshot($after),$user);
        if($assignmentChanged)audit_log('CLIENT_COLLABORATOR_SYNCED','commissions','Atribuirea și comisionul colaboratorului au fost sincronizate','Client',$after['id'],$after['propertyId'],$beforeCollaborator,client_financial_bundle($after)['collaborator'],$user);
        respond(client_for_user($after,$user));
    }
    if ($method === 'DELETE' && path_match('/clients/{id}', $path, $params)) {
        $user=require_permission('clients.update');$clientId=validated_uuid($params['id'],'Clientul');$before=get_client($clientId);ensure_property($before['propertyId'],$user);
        if(empty($before['isActive']))respond(['deleted'=>true,'id'=>$clientId]);
        $pdo=db();$pdo->beginTransaction();$now=now_utc();
        $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($clientId)]);$locked=get_client($clientId);
        if(empty($locked['isActive'])){$pdo->rollBack();respond(['deleted'=>true,'id'=>$clientId]);}
        $paidStmt=$pdo->prepare("SELECT 1 FROM commissions WHERE client_id=? AND is_active=1 AND status='PAID' AND paid_at IS NOT NULL LIMIT 1");$paidStmt->execute([uuid_bin($clientId)]);
        if($paidStmt->fetchColumn()){$pdo->rollBack();fail('Clientul are un comision de colaborator achitat. Marchează-l neachitat înainte să ștergi clientul.',409,['code'=>'COLLABORATOR_COMMISSION_PAID']);}
        $sheetsStmt=$pdo->prepare('SELECT '.uuid_sql('id').' id,status FROM service_sheets WHERE client_id=? AND is_active=1 ORDER BY created_at FOR UPDATE');$sheetsStmt->execute([uuid_bin($clientId)]);$activeSheets=$sheetsStmt->fetchAll();
        try{
            $pdo->prepare("UPDATE clients SET status='INACTIVE',is_active=0,updated_at=?,updated_by=? WHERE id=?")->execute([$now,uuid_bin($user['id']),uuid_bin($clientId)]);
            $pdo->prepare("UPDATE client_qr SET status='INVALIDATED',invalidated_at=COALESCE(invalidated_at,?),is_active=0,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1")->execute([$now,$now,uuid_bin($user['id']),uuid_bin($clientId)]);
            $sheetUpdate=$pdo->prepare("UPDATE service_sheets SET status='CANCELLED',is_active=0,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1");$sheetUpdate->execute([$now,uuid_bin($user['id']),uuid_bin($clientId)]);
            $historyInsert=$pdo->prepare("INSERT INTO service_sheet_status_history (id,service_sheet_id,old_status,new_status,changed_by,created_at) VALUES (?,?,?,'CANCELLED',?,?)");foreach($activeSheets as$sheet)if($sheet['status']!=='CANCELLED')$historyInsert->execute([uuid_bin(uuid_v4()),uuid_bin($sheet['id']),$sheet['status'],uuid_bin($user['id']),$now]);
            $pdo->prepare("UPDATE commissions SET status='CANCELLED',is_active=0,paid_at=NULL,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1")->execute([$now,uuid_bin($user['id']),uuid_bin($clientId)]);
            $pdo->commit();
        }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        $after=get_client($clientId);audit_log('CLIENT_DELETED','clients','Client șters: '.$after['firstName'].' '.$after['lastName'],'Client',$clientId,$after['propertyId'],client_audit_snapshot($before),client_audit_snapshot($after),$user);respond(['deleted'=>true,'id'=>$clientId]);
    }
    if ($method === 'POST' && path_match('/clients/{id}/qr', $path, $params)) {
        $user=require_permission('qr.generate');$client=get_client($params['id']);ensure_property($client['propertyId'],$user);
        if(!empty($client['qr'])){
            $legacyStatuses=['EXPIRED','INVALIDATED','REGENERATED'];
            $needsNormalization=$client['qr']['expiresAt']!==null||$client['qr']['invalidatedAt']!==null||in_array($client['qr']['status'],$legacyStatuses,true);
            if($needsNormalization){
                $normalizedStatus=!empty($client['qr']['usedAt'])?'USED':(in_array($client['qr']['status'],$legacyStatuses,true)?'GENERATED':$client['qr']['status']);
                $now=now_utc();
                db()->prepare('UPDATE client_qr SET status=?,expires_at=NULL,invalidated_at=NULL,updated_at=?,updated_by=? WHERE id=?')->execute([$normalizedStatus,$now,uuid_bin($user['id']),uuid_bin($client['qr']['id'])]);
                $before=['status'=>$client['qr']['status'],'expiresAt'=>$client['qr']['expiresAt']];
                $client=get_client($client['id']);
                $after=['status'=>$client['qr']['status'],'expiresAt'=>$client['qr']['expiresAt']];
                audit_log('QR_MADE_PERMANENT','qr','Cod QR legacy convertit în cod permanent','ClientQR',$client['qr']['id'],$client['propertyId'],$before,$after,$user);
            }
            respond(client_for_user($client,$user));
        }
        $pdo=db();$pdo->beginTransaction();$createdQr=null;
        try{
            $lock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$lock->execute([uuid_bin($client['id'])]);
            $current=get_client($client['id']);
            if(empty($current['qr']))$createdQr=create_client_qr($pdo,$client['id'],$client['propertyId'],$user['id']);
            $pdo->commit();
        }catch(Throwable$e){$pdo->rollBack();throw$e;}
        $client=get_client($client['id']);
        if($createdQr!==null)audit_log('QR_GENERATED','qr','QR generat pentru client legacy: '.$client['firstName'].' '.$client['lastName'],'ClientQR',$createdQr['id'],$client['propertyId'],null,$createdQr,$user);
        respond(client_for_user($client,$user));
    }
    if ($method === 'POST' && path_match('/clients/{id}/qr/share', $path, $params)) { $user=require_permission('qr.share');$client=get_client($params['id']);ensure_property($client['propertyId'],$user);if(empty($client['qr']))fail('Clientul nu are un QR activ.',422);$body=json_body();$methodName=strtoupper((string)($body['method']??'NATIVE'));$allowed=['WHATSAPP','EMAIL','SMS','COPY','NATIVE'];if(!in_array($methodName,$allowed,true))$methodName='NATIVE';$now=now_utc();db()->prepare("UPDATE client_qr SET status=IF(status='USED','USED','SENT'),sent_at=?,updated_at=?,updated_by=? WHERE id=?")->execute([$now,$now,uuid_bin($user['id']),uuid_bin($client['qr']['id'])]);db()->prepare("INSERT INTO qr_shares (id,qr_id,client_id,property_id,user_id,method,status,sent_at) VALUES (?,?,?,?,?,?, 'SENT',?)")->execute([uuid_bin(uuid_v4()),uuid_bin($client['qr']['id']),uuid_bin($client['id']),uuid_bin($client['propertyId']),uuid_bin($user['id']),$methodName,$now]);audit_log('QR_SHARED','qr','Cod QR trimis prin '.$methodName,'ClientQR',$client['qr']['id'],$client['propertyId'],null,['method'=>$methodName],$user);respond(['shared'=>true]); }
    if ($method === 'POST' && path_match('/clients/{id}/qr/use', $path, $params)) { $user=require_permission('qr.generate');$client=get_client($params['id']);ensure_property($client['propertyId'],$user);if(empty($client['qr']))fail('QR inexistent.',404);$now=now_utc();db()->prepare("UPDATE client_qr SET status='USED',used_at=?,updated_at=?,updated_by=? WHERE id=?")->execute([$now,$now,uuid_bin($user['id']),uuid_bin($client['qr']['id'])]);audit_log('QR_MARKED_USED','qr','Cod QR marcat ca folosit','ClientQR',$client['qr']['id'],$client['propertyId'],null,null,$user);respond(client_for_user(get_client($client['id']),$user)); }
    if ($method === 'GET' && path_match('/clients/{id}/intake', $path, $params)) { $user=require_permission('clients.view');$client=get_client($params['id']);ensure_property($client['propertyId'],$user);$stmt=db()->prepare('SELECT payload FROM client_intakes WHERE client_id=? AND is_active=1 ORDER BY submitted_at DESC LIMIT 1');$stmt->execute([uuid_bin($client['id'])]);$payload=$stmt->fetchColumn();respond($payload?json_decode($payload,true):null); }

    if (($method==='GET'||$method==='POST') && path_match('/public/client-form/{token}', $path, $params)) {
        $token=$params['token'];
        $stmt=db()->prepare('SELECT '.uuid_sql('q.id').' id,'.uuid_sql('q.client_id').' client_id,'.uuid_sql('q.property_id').' property_id,q.status,c.first_name,p.name property_name FROM client_qr q JOIN clients c ON c.id=q.client_id JOIN properties p ON p.id=q.property_id WHERE q.token=? AND q.is_active=1 LIMIT 1');
        $stmt->execute([uuid_bin($token)]);
        $qr=$stmt->fetch();
        if(!$qr)fail('Linkul este invalid.',404);
        if($method==='GET'){
            if($qr['status']!=='USED')db()->prepare('UPDATE client_qr SET opened_at=COALESCE(opened_at,?),updated_at=? WHERE id=?')->execute([now_utc(),now_utc(),uuid_bin($qr['id'])]);
            respond(['clientFirstName'=>$qr['first_name'],'propertyName'=>$qr['property_name'],'expiresAt'=>null,'used'=>$qr['status']==='USED']);
        }

        $body=json_body();
        if(strlen(trim((string)($body['fullName']??'')))<3||strlen(preg_replace('/\D/','',(string)($body['phone']??'')))<9||strlen(trim((string)($body['problem']??'')))<10)fail('Completează numele, telefonul și problema.',422);
        if(empty($body['gdpr'])||empty($body['accuracy'])||empty($body['terms']))fail('Acordurile sunt obligatorii.',422);

        $pdo=db();
        $pdo->beginTransaction();
        try{
            $lock=$pdo->prepare('SELECT status FROM client_qr WHERE id=? AND is_active=1 FOR UPDATE');
            $lock->execute([uuid_bin($qr['id'])]);
            $lockedStatus=$lock->fetchColumn();
            if($lockedStatus===false){
                $pdo->rollBack();
                fail('Linkul este invalid.',404);
            }
            if($lockedStatus==='USED'){
                $pdo->rollBack();
                fail('Formularul a fost deja trimis pentru acest cod QR.',409);
            }

            $now=now_utc();
            $intakeId=uuid_v4();
            $pdo->prepare('INSERT INTO client_intakes (id,client_id,qr_id,property_id,payload,submitted_at,is_active) VALUES (?,?,?,?,?,?,1)')->execute([uuid_bin($intakeId),uuid_bin($qr['client_id']),uuid_bin($qr['id']),uuid_bin($qr['property_id']),json_encode($body,JSON_UNESCAPED_UNICODE),$now]);
            $pdo->prepare("UPDATE client_qr SET status='USED',used_at=?,updated_at=? WHERE id=?")->execute([$now,$now,uuid_bin($qr['id'])]);
            $nameParts=explode(' ',trim($body['fullName']),2);
            $pdo->prepare("UPDATE clients SET first_name=?,last_name=?,phone=?,email=?,address=?,city=?,county=?,status='REVIEW_REQUIRED',updated_at=? WHERE id=?")->execute([$nameParts[0],$nameParts[1]??'',trim($body['phone']),$body['email']??null,$body['address']??null,$body['city']??null,$body['county']??null,$now,uuid_bin($qr['client_id'])]);
            $requestId=uuid_v4();
            $pdo->prepare("INSERT INTO service_requests (id,property_id,client_id,intake_id,status,created_at,updated_at) VALUES (?,?,?,?, 'NEW',?,?)")->execute([uuid_bin($requestId),uuid_bin($qr['property_id']),uuid_bin($qr['client_id']),uuid_bin($intakeId),$now,$now]);

            $recipients=$pdo->prepare('SELECT user_id FROM user_properties WHERE property_id=?');
            $recipients->execute([uuid_bin($qr['property_id'])]);
            $notification=$pdo->prepare("INSERT INTO notifications (id,user_id,property_id,title,message,type,created_at) VALUES (?,?,?,'Solicitare nouă','Un client a completat formularul QR.','INFO',?)");
            foreach($recipients->fetchAll(PDO::FETCH_COLUMN) as $recipientId){
                $notification->execute([uuid_bin(uuid_v4()),$recipientId,uuid_bin($qr['property_id']),$now]);
            }

            $pdo->commit();
            audit_log('PUBLIC_FORM_SUBMITTED','qr','Clientul a completat formularul public','Client',$qr['client_id'],$qr['property_id'],null,['requestId'=>$requestId],[]);
            respond(['submitted'=>true,'requestId'=>$requestId],201);
        }catch(PDOException$e){
            if($pdo->inTransaction())$pdo->rollBack();
            if((int)($e->errorInfo[1]??0)===1062)fail('Formularul a fost deja trimis pentru acest cod QR.',409);
            throw$e;
        }catch(Throwable$e){
            if($pdo->inTransaction())$pdo->rollBack();
            throw$e;
        }
    }
    if ($method==='POST'&&$path==='/qr/resolve') { $user=require_permission('qr.scan');$body=json_body();$raw=(string)($body['data']??'');if(!preg_match('/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})/',$raw,$match))fail('Cod QR G-Shop invalid.',422);$stmt=db()->prepare('SELECT '.uuid_sql('q.id').' id,'.uuid_sql('q.client_id').' client_id,'.uuid_sql('q.property_id').' property_id,q.status,c.first_name,c.last_name FROM client_qr q JOIN clients c ON c.id=q.client_id WHERE q.token=? AND q.is_active=1 LIMIT 1');$stmt->execute([uuid_bin($match[1])]);$qr=$stmt->fetch();if(!$qr)fail('Codul este invalid.',404);ensure_property($qr['property_id'],$user);$requestedPropertyId=trim((string)($body['propertyId']??''));if($requestedPropertyId!==''&&$requestedPropertyId!==$qr['property_id'])fail('Codul QR nu aparține proprietății selectate.',422);$action=(string)($body['action']??'OPEN_PROFILE');if(!in_array($action,['OPEN_PROFILE','CHECK_IN','DROP_OFF','PICK_UP'],true))$action='OPEN_PROFILE';db()->prepare('INSERT INTO qr_scan_logs (id,qr_id,client_id,property_id,scanned_by,action,device,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')->execute([uuid_bin(uuid_v4()),uuid_bin($qr['id']),uuid_bin($qr['client_id']),uuid_bin($qr['property_id']),uuid_bin($user['id']),$action,substr((string)($body['device']??''),0,100),'VALID',now_utc()]);audit_log('QR_SCANNED','qr','QR scanat: '.$action,'ClientQR',$qr['id'],$qr['property_id'],null,['action'=>$action,'device'=>$body['device']??null],$user);respond(['clientId'=>$qr['client_id'],'clientName'=>$qr['first_name'].' '.$qr['last_name']]); }

    if ($method==='GET'&&$path==='/service-sheets') { $user=require_permission('service_sheets.view');$propertyId=(string)($_GET['propertyId']??'');ensure_property($propertyId,$user);$stmt=db()->prepare(sheet_select().' WHERE s.property_id=? AND s.is_active=1 ORDER BY s.created_at DESC LIMIT 100');$stmt->execute([uuid_bin($propertyId)]);$data=array_map('map_sheet',$stmt->fetchAll());respond(['data'=>$data,'page'=>1,'pageSize'=>100,'total'=>count($data),'totalPages'=>1]); }
    if ($method==='GET'&&path_match('/service-sheets/{id}',$path,$params)) { $user=require_permission('service_sheets.view');$sheet=get_sheet($params['id']);ensure_property($sheet['propertyId'],$user);respond($sheet); }
    if ($method==='POST'&&$path==='/service-sheets') {
        $user=require_permission('service_sheets.create');$body=json_body();$propertyId=(string)($body['propertyId']??'');ensure_property($propertyId,$user);
        if(empty($body['clientId'])||empty($body['equipment'])||empty($body['reportedIssue']))fail('Clientul, echipamentul și problema sunt obligatorii.',422);
        $clientId=(string)$body['clientId'];$client=get_client($clientId);
        if($client['propertyId']!==$propertyId)fail('Clientul nu aparține proprietății selectate.',422);
        $partsCost=max(0,(float)($body['partsCost']??0));$laborCost=max(0,(float)($body['laborCost']??0));$totalCost=max(0,(float)($body['totalCost']??($partsCost+$laborCost)));$directCosts=max(0,(float)($body['directCosts']??0));$netValue=max(0,$totalCost-$directCosts);
        if(!empty($client['collaboratorId']))collaborator_for_property((string)$client['collaboratorId'],$propertyId);
        $id=uuid_v4();$now=now_utc();$pdo=db();$pdo->beginTransaction();$commissionCreated=false;
        try{
            $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($clientId)]);
            $client=get_client($clientId);$financial=client_financial_record($client);$expenses=client_expenses($clientId);$financeSummary=financial_summary($client,$financial,$expenses);$collaboratorId=!empty($client['collaboratorId'])?(string)$client['collaboratorId']:null;$commissionValue=$collaboratorId!==null?(float)$financeSummary['collaboratorCost']:null;
            $existingStmt=$pdo->prepare('SELECT '.uuid_sql('id').' id FROM service_sheets WHERE client_id=? AND is_active=1 ORDER BY updated_at DESC,created_at DESC LIMIT 1 FOR UPDATE');$existingStmt->execute([uuid_bin($clientId)]);$existingId=$existingStmt->fetchColumn();
            if($existingId){$pdo->rollBack();fail('Clientul are deja o fișă de service.',409,['code'=>'SERVICE_SHEET_ALREADY_EXISTS','serviceSheetId'=>$existingId]);}
            $seq=(int)$pdo->query("SELECT COUNT(*)+1 FROM service_sheets WHERE YEAR(created_at)=YEAR(UTC_TIMESTAMP())")->fetchColumn();$number='GS-'.gmdate('Y').'-'.str_pad((string)$seq,5,'0',STR_PAD_LEFT);
            $stmt=$pdo->prepare("INSERT INTO service_sheets (id,property_id,client_id,number,equipment,brand,model,serial_number,accessories,reported_issue,technical_assessment,work_performed,parts_used,parts_cost,labor_cost,total_cost,direct_costs,net_value,technician_id,collaborator_id,collaborator_commission,internal_notes,received_at,estimated_at,status,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'NEW',1,?,?,?,?)");
            $stmt->execute([uuid_bin($id),uuid_bin($propertyId),uuid_bin($clientId),$number,$body['equipment'],$body['brand']??null,$body['model']??null,$body['serialNumber']??null,$body['accessories']??null,$body['reportedIssue'],$body['technicalAssessment']??null,$body['workPerformed']??null,$body['partsUsed']??null,$partsCost,$laborCost,$totalCost,$directCosts,$netValue,!empty($body['technicianId'])?uuid_bin($body['technicianId']):null,$collaboratorId?uuid_bin($collaboratorId):null,$commissionValue,$body['internalNotes']??null,!empty($body['receivedAt'])?gmdate('Y-m-d H:i:s',strtotime((string)$body['receivedAt'])):$now,!empty($body['estimatedAt'])?gmdate('Y-m-d H:i:s',strtotime((string)$body['estimatedAt'])):null,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
            $pdo->prepare("INSERT INTO service_sheet_status_history (id,service_sheet_id,old_status,new_status,changed_by,created_at) VALUES (?,?,NULL,'NEW',?,?)")->execute([uuid_bin(uuid_v4()),uuid_bin($id),uuid_bin($user['id']),$now]);
            $syncResult=sync_client_commission($pdo,$client,$financial,$expenses,$user,false);$commissionCreated=!empty($syncResult['changed'])&&$collaboratorId!==null;
            $pdo->commit();
        }catch(Throwable$e){$pdo->rollBack();throw$e;}
        audit_log('SERVICE_SHEET_CREATED','service_sheets','Fișă creată: '.$number,'ServiceSheet',$id,$propertyId,null,$body,$user);
        if($commissionCreated)audit_log('COMMISSION_CREATED','commissions','Comision aprobat automat pentru fișa '.$number,'Client',$clientId,$propertyId,null,client_financial_bundle($client)['collaborator'],$user);
        respond(get_sheet($id),201);
    }
    if ($method==='PUT'&&path_match('/service-sheets/{id}',$path,$params)) {
        $user=require_permission('service_sheets.update');$before=get_sheet($params['id']);ensure_property($before['propertyId'],$user);$body=json_body();
        $financeChanged=count(array_intersect(array_keys($body),['partsCost','laborCost','totalCost','directCosts','netValue']))>0;
        if($financeChanged){
            $nextParts=array_key_exists('partsCost',$body)?max(0,(float)$body['partsCost']):(float)$before['partsCost'];$nextLabor=array_key_exists('laborCost',$body)?max(0,(float)$body['laborCost']):(float)$before['laborCost'];
            $nextTotal=array_key_exists('totalCost',$body)?max(0,(float)$body['totalCost']):((array_key_exists('partsCost',$body)||array_key_exists('laborCost',$body))?$nextParts+$nextLabor:(float)$before['totalCost']);$nextDirect=array_key_exists('directCosts',$body)?max(0,(float)$body['directCosts']):(float)$before['directCosts'];
            $body['partsCost']=$nextParts;$body['laborCost']=$nextLabor;$body['totalCost']=$nextTotal;$body['directCosts']=$nextDirect;$body['netValue']=max(0,$nextTotal-$nextDirect);
        }
        $map=['equipment'=>'equipment','brand'=>'brand','model'=>'model','serialNumber'=>'serial_number','accessories'=>'accessories','reportedIssue'=>'reported_issue','technicalAssessment'=>'technical_assessment','workPerformed'=>'work_performed','partsUsed'=>'parts_used','partsCost'=>'parts_cost','laborCost'=>'labor_cost','totalCost'=>'total_cost','directCosts'=>'direct_costs','netValue'=>'net_value','internalNotes'=>'internal_notes','estimatedAt'=>'estimated_at','completedAt'=>'completed_at','status'=>'status'];$sets=[];$args=[];
        foreach($map as$key=>$column)if(array_key_exists($key,$body)){$sets[]="$column=?";$value=$body[$key];if(in_array($key,['estimatedAt','completedAt'],true))$value=$value?gmdate('Y-m-d H:i:s',strtotime((string)$value)):null;elseif($value==='')$value=null;$args[]=$value;}
        if(!$sets)fail('Nu există date de actualizat.',422);$now=now_utc();$sets[]='updated_at=?';$args[]=$now;$sets[]='updated_by=?';$args[]=uuid_bin($user['id']);$args[]=uuid_bin($params['id']);$pdo=db();$pdo->beginTransaction();
        try{
            $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($before['clientId'])]);
            $pdo->prepare('UPDATE service_sheets SET '.implode(',',$sets).' WHERE id=?')->execute($args);
            if(isset($body['status'])&&$body['status']!==$before['status'])$pdo->prepare('INSERT INTO service_sheet_status_history (id,service_sheet_id,old_status,new_status,changed_by,created_at) VALUES (?,?,?,?,?,?)')->execute([uuid_bin(uuid_v4()),uuid_bin($params['id']),$before['status'],$body['status'],uuid_bin($user['id']),$now]);
            $after=get_sheet($params['id']);$recalculated=0;
            if($financeChanged){
                $client=get_client($before['clientId']);$syncResult=sync_client_commission($pdo,$client,client_financial_record($client),client_expenses($client['id']),$user,false);$recalculated=!empty($syncResult['changed'])?1:0;
            }
            $pdo->commit();
        }catch(Throwable$e){$pdo->rollBack();throw$e;}
        $after=get_sheet($params['id']);audit_log('SERVICE_SHEET_UPDATED','service_sheets','Fișă actualizată: '.$after['number'],'ServiceSheet',$params['id'],$after['propertyId'],$before,$after,$user);
        if($financeChanged&&$recalculated>0)audit_log('COMMISSION_RECALCULATED','commissions','Comision recalculat pentru fișa '.$after['number'],'ServiceSheet',$params['id'],$after['propertyId'],['totalCost'=>$before['totalCost'],'directCosts'=>$before['directCosts'],'netValue'=>$before['netValue'],'collaboratorCommission'=>$before['collaboratorCommission']],['totalCost'=>$after['totalCost'],'directCosts'=>$after['directCosts'],'netValue'=>$after['netValue'],'collaboratorCommission'=>$after['collaboratorCommission']],$user);
        respond($after);
    }
    if ($method==='DELETE'&&path_match('/service-sheets/{id}',$path,$params)) {
        $user=require_permission('service_sheets.update');$before=get_sheet($params['id']);ensure_property($before['propertyId'],$user);
        if(empty($before['isActive']))respond(['deleted'=>true,'id'=>$before['id']]);
        $pdo=db();$pdo->beginTransaction();$now=now_utc();
        $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($before['clientId'])]);
        $paidStmt=$pdo->prepare("SELECT 1 FROM commissions WHERE service_sheet_id=? AND is_active=1 AND status='PAID' AND paid_at IS NOT NULL LIMIT 1");$paidStmt->execute([uuid_bin($before['id'])]);
        if($paidStmt->fetchColumn()){$pdo->rollBack();fail('Fișa are un comision de colaborator achitat. Marchează-l neachitat înainte să ștergi fișa.',409,['code'=>'COLLABORATOR_COMMISSION_PAID']);}
        try{
            $pdo->prepare("UPDATE service_sheets SET is_active=0,status='CANCELLED',updated_at=?,updated_by=? WHERE id=?")->execute([$now,uuid_bin($user['id']),uuid_bin($before['id'])]);
            if($before['status']!=='CANCELLED')$pdo->prepare("INSERT INTO service_sheet_status_history (id,service_sheet_id,old_status,new_status,changed_by,created_at) VALUES (?,?,?,'CANCELLED',?,?)")->execute([uuid_bin(uuid_v4()),uuid_bin($before['id']),$before['status'],uuid_bin($user['id']),$now]);
            $pdo->prepare("UPDATE commissions SET status='CANCELLED',is_active=0,paid_at=NULL,updated_at=?,updated_by=? WHERE service_sheet_id=? AND is_active=1")->execute([$now,uuid_bin($user['id']),uuid_bin($before['id'])]);
            $pdo->commit();
        }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        $after=get_sheet($before['id']);audit_log('SERVICE_SHEET_DELETED','service_sheets','Fișă ștearsă: '.$before['number'],'ServiceSheet',$before['id'],$before['propertyId'],$before,$after,$user);
        respond(['deleted'=>true,'id'=>$before['id']]);
    }
    if ($method==='POST'&&path_match('/service-sheets/{id}/signature',$path,$params)) { $user=require_permission('service_sheets.sign');$sheet=get_sheet($params['id']);ensure_property($sheet['propertyId'],$user);$body=json_body();$data=(string)($body['signature']??'');if(!preg_match('#^data:image/png;base64,(.+)$#',$data,$match))fail('Formatul semnăturii nu este valid.',422);$binary=base64_decode($match[1],true);if($binary===false||strlen($binary)<100||strlen($binary)>1500000)fail('Semnătura este invalidă sau prea mare.',422);$directory=__DIR__.'/uploads/signatures';if(!is_dir($directory)&&!mkdir($directory,0755,true)&&!is_dir($directory))throw new RuntimeException('Directorul pentru semnături nu poate fi creat.');$filename=$sheet['id'].'.png';if(file_put_contents($directory.'/'.$filename,$binary,LOCK_EX)===false)throw new RuntimeException('Semnătura nu poate fi salvată.');$pathValue='uploads/signatures/'.$filename;$now=now_utc();db()->prepare('UPDATE service_sheets SET signature_path=?,signed_at=?,updated_at=?,updated_by=? WHERE id=?')->execute([$pathValue,$now,$now,uuid_bin($user['id']),uuid_bin($sheet['id'])]);audit_log('SERVICE_SHEET_SIGNED','service_sheets','Semnătură client salvată pentru '.$sheet['number'],'ServiceSheet',$sheet['id'],$sheet['propertyId'],null,['signedAt'=>$now],$user);respond(get_sheet($sheet['id'])); }

    if ($method==='GET'&&$path==='/interventions') { $user=require_permission('interventions.view');$propertyId=(string)($_GET['propertyId']??'');ensure_property($propertyId,$user);$sql='SELECT '.uuid_sql('i.id').' id,'.uuid_sql('i.property_id').' property_id,'.uuid_sql('i.client_id').' client_id,'.uuid_sql('i.service_sheet_id').' service_sheet_id,'.uuid_sql('i.technician_id').' technician_id,'.uuid_sql('i.collaborator_id').' collaborator_id,i.title,i.description,i.scheduled_at,i.estimated_minutes,i.status,i.cost,i.direct_costs,i.net_value,i.location,i.notes,i.is_active,i.created_at,i.updated_at,'.uuid_sql('i.created_by').' created_by,'.uuid_sql('i.updated_by').' updated_by,'.uuid_sql('c.id').' c_id,c.first_name c_first_name,c.last_name c_last_name FROM interventions i JOIN clients c ON c.id=i.client_id WHERE i.property_id=? AND i.is_active=1 ORDER BY i.scheduled_at DESC LIMIT 100';$stmt=db()->prepare($sql);$stmt->execute([uuid_bin($propertyId)]);$data=[];foreach($stmt->fetchAll()as$row){$client=['id'=>$row['c_id'],'firstName'=>$row['c_first_name'],'lastName'=>$row['c_last_name']];foreach(array_keys($row)as$key)if(str_starts_with($key,'c_'))unset($row[$key]);$item=entity_base($row);foreach(['cost','directCosts','netValue']as$key)$item[$key]=(float)$item[$key];$item['estimatedMinutes']=$item['estimatedMinutes']!==null?(int)$item['estimatedMinutes']:null;$item['client']=$client;$data[]=$item;}respond(['data'=>$data,'page'=>1,'pageSize'=>100,'total'=>count($data),'totalPages'=>1]); }
    if ($method==='POST'&&$path==='/interventions') { $user=require_permission('interventions.manage');$body=json_body();$propertyId=(string)($body['propertyId']??'');ensure_property($propertyId,$user);if(empty($body['clientId'])||empty($body['title'])||empty($body['scheduledAt']))fail('Date obligatorii lipsă.',422);$id=uuid_v4();$now=now_utc();$stmt=db()->prepare('INSERT INTO interventions (id,property_id,client_id,service_sheet_id,technician_id,collaborator_id,title,description,scheduled_at,estimated_minutes,status,cost,direct_costs,net_value,location,notes,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)');$stmt->execute([uuid_bin($id),uuid_bin($propertyId),uuid_bin($body['clientId']),!empty($body['serviceSheetId'])?uuid_bin($body['serviceSheetId']):null,!empty($body['technicianId'])?uuid_bin($body['technicianId']):null,!empty($body['collaboratorId'])?uuid_bin($body['collaboratorId']):null,$body['title'],$body['description']??null,gmdate('Y-m-d H:i:s',strtotime($body['scheduledAt'])),$body['estimatedMinutes']??null,$body['status']??'SCHEDULED',(float)($body['cost']??0),(float)($body['directCosts']??0),(float)($body['netValue']??0),$body['location']??null,$body['notes']??null,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);audit_log('INTERVENTION_CREATED','interventions','Intervenție creată: '.$body['title'],'Intervention',$id,$propertyId,null,$body,$user);respond(['id'=>$id],201); }

    if ($method==='GET'&&$path==='/collaborators') {
        $user=require_permission('collaborators.view');$propertyId=trim((string)($_GET['propertyId']??''));ensure_property($propertyId,$user);ensure_existing_property($propertyId);
        $sql=collaborator_select(',cp.is_preset').' JOIN collaborator_properties cp ON cp.collaborator_id=c.id WHERE cp.property_id=? AND c.is_active=1 ORDER BY c.name';$stmt=db()->prepare($sql);$stmt->execute([uuid_bin($propertyId)]);$data=[];
        foreach($stmt->fetchAll()as$row){$item=entity_base($row);$item['defaultCommissionValue']=(float)$item['defaultCommissionValue'];$item['propertyIds']=[$propertyId];$item['isPreset']=(bool)($row['is_preset']??false);$data[]=$item;}
        respond($data);
    }
    if ($method==='GET'&&path_match('/collaborators/{id}',$path,$params)) {
        $user=require_permission('collaborators.view');$propertyId=trim((string)($_GET['propertyId']??''));if($propertyId==='')fail('Proprietatea este obligatorie.',422);ensure_property($propertyId,$user);ensure_existing_property($propertyId);respond(get_collaborator($params['id'],$propertyId));
    }
    if ($method==='POST'&&$path==='/collaborators') {
        $user=require_permission('collaborators.manage');$body=json_body();$name=trim((string)($body['name']??''));if(strlen($name)<3)fail('Numele trebuie să aibă minimum 3 caractere.',422);
        $propertyIds=$body['propertyIds']??null;if(!is_array($propertyIds)||!$propertyIds)fail('Alege cel puțin o proprietate.',422);$propertyIds=array_values(array_unique(array_map(fn($value)=>trim((string)$value),$propertyIds)));
        foreach($propertyIds as$propertyId){if($propertyId==='')fail('Lista proprietăților este invalidă.',422);ensure_property($propertyId,$user);ensure_existing_property($propertyId);}
        $type=(string)($body['defaultCommissionType']??'PERCENT_NET');$value=validate_commission_settings($type,$body['defaultCommissionValue']??0);
        $isPreset=$body['isPreset']??false;if(!is_bool($isPreset))fail('Starea colaboratorului presetat trebuie să fie booleană.',422);
        $email=trim((string)($body['email']??''));if($email!==''&&!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Adresa de email nu este validă.',422);
        $previousPresets=[];if($isPreset)foreach($propertyIds as$propertyId)$previousPresets[$propertyId]=property_preset_collaborator_id($propertyId);
        $id=uuid_v4();$now=now_utc();$pdo=db();$pdo->beginTransaction();
        try{
            $pdo->prepare('INSERT INTO collaborators (id,name,phone,email,role,default_commission_type,default_commission_value,bank_account,notes,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)')->execute([uuid_bin($id),$name,trim((string)($body['phone']??''))?:null,$email?:null,trim((string)($body['role']??''))?:null,$type,$value,trim((string)($body['bankAccount']??''))?:null,trim((string)($body['notes']??''))?:null,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
            $link=$pdo->prepare('INSERT INTO collaborator_properties (collaborator_id,property_id) VALUES (?,?)');foreach($propertyIds as$propertyId){$link->execute([uuid_bin($id),uuid_bin($propertyId)]);if($isPreset)set_collaborator_preset($pdo,$id,$propertyId,true);}$pdo->commit();
        }catch(Throwable$e){$pdo->rollBack();throw$e;}
        $created=get_collaborator($id,$propertyIds[0]);audit_log('COLLABORATOR_CREATED','collaborators','Colaborator creat: '.$created['name'],'Collaborator',$id,$propertyIds[0],null,$created,$user);
        if($isPreset)foreach($propertyIds as$propertyId)audit_log('COLLABORATOR_PRESET_CHANGED','collaborators','Colaborator presetat schimbat: '.$created['name'],'Property',$propertyId,$propertyId,['collaboratorId'=>$previousPresets[$propertyId]],['collaboratorId'=>$id],$user);
        respond($created,201);
    }
    if ($method==='PUT'&&path_match('/collaborators/{id}',$path,$params)) {
        $user=require_permission('collaborators.manage');$body=json_body();$propertyId=trim((string)($body['propertyId']??''));if($propertyId==='')fail('Proprietatea este obligatorie.',422);ensure_property($propertyId,$user);$before=get_collaborator($params['id'],$propertyId);if(!$before['isActive'])fail('Colaboratorul este deja dezactivat.',409);
        $allowed=['name'=>'name','phone'=>'phone','email'=>'email','role'=>'role','defaultCommissionType'=>'default_commission_type','defaultCommissionValue'=>'default_commission_value','bankAccount'=>'bank_account','notes'=>'notes'];$sets=[];$args=[];
        $hasGlobalChange=false;foreach($allowed as$key=>$column){if(!array_key_exists($key,$body))continue;$incoming=$body[$key];$current=$before[$key]??null;if(in_array($key,['name','phone','email','role','bankAccount','notes'],true)){$incoming=trim((string)$incoming);$current=trim((string)$current);}elseif($key==='defaultCommissionValue'){$incoming=(float)$incoming;$current=(float)$current;}else{$incoming=(string)$incoming;$current=(string)$current;}if($incoming!==$current){$hasGlobalChange=true;break;}}if($hasGlobalChange)foreach($before['propertyIds']as$linkedPropertyId)ensure_property($linkedPropertyId,$user);
        $nextType=(string)($body['defaultCommissionType']??$before['defaultCommissionType']);$nextValue=$body['defaultCommissionValue']??$before['defaultCommissionValue'];
        validate_commission_settings($nextType,$nextValue);
        $hasPresetChange=array_key_exists('isPreset',$body);if($hasPresetChange&&!is_bool($body['isPreset']))fail('Starea colaboratorului presetat trebuie să fie booleană.',422);$previousPresetId=$hasPresetChange?property_preset_collaborator_id($propertyId):null;
        if(array_key_exists('name',$body)&&strlen(trim((string)$body['name']))<3)fail('Numele trebuie să aibă minimum 3 caractere.',422);
        if(array_key_exists('email',$body)&&trim((string)$body['email'])!==''&&!filter_var(trim((string)$body['email']),FILTER_VALIDATE_EMAIL))fail('Adresa de email nu este validă.',422);
        foreach($allowed as$key=>$column)if(array_key_exists($key,$body)){$value=$body[$key];if(in_array($key,['name','phone','email','role','bankAccount','notes'],true))$value=trim((string)$value);if($key==='defaultCommissionValue')$value=(float)$value;$sets[]="$column=?";$args[]=$value===''?null:$value;}
        if(!$sets&&!$hasPresetChange)fail('Nu există date de actualizat.',422);$pdo=db();$pdo->beginTransaction();
        try{
            if($sets){$sets[]='updated_at=?';$args[]=now_utc();$sets[]='updated_by=?';$args[]=uuid_bin($user['id']);$args[]=uuid_bin($params['id']);$pdo->prepare('UPDATE collaborators SET '.implode(',',$sets).' WHERE id=?')->execute($args);}
            if($hasPresetChange)set_collaborator_preset($pdo,$params['id'],$propertyId,(bool)$body['isPreset']);
            $pdo->commit();
        }catch(Throwable$e){$pdo->rollBack();throw$e;}
        $after=get_collaborator($params['id'],$propertyId);$auditBefore=$before;$auditAfter=$after;unset($auditBefore['propertyIds'],$auditAfter['propertyIds']);audit_log('COLLABORATOR_UPDATED','collaborators','Colaborator actualizat: '.$after['name'],'Collaborator',$after['id'],$propertyId,$auditBefore,$auditAfter,$user);
        if($hasPresetChange){$nextPresetId=property_preset_collaborator_id($propertyId);if($previousPresetId!==$nextPresetId)audit_log('COLLABORATOR_PRESET_CHANGED','collaborators','Colaborator presetat schimbat pentru proprietate','Property',$propertyId,$propertyId,['collaboratorId'=>$previousPresetId],['collaboratorId'=>$nextPresetId],$user);}
        respond($after);
    }
    if ($method==='DELETE'&&path_match('/collaborators/{id}',$path,$params)) {
        $user=require_permission('collaborators.manage');$propertyId=trim((string)($_GET['propertyId']??''));if($propertyId==='')fail('Proprietatea este obligatorie.',422);ensure_property($propertyId,$user);$before=get_collaborator($params['id'],$propertyId);
        foreach($before['propertyIds']as$linkedPropertyId)ensure_property($linkedPropertyId,$user);
        if(!$before['isActive'])respond(['deleted'=>true]);
        $pId=uuid_bin($params['id']);$clientsStmt=db()->prepare('SELECT COUNT(*) FROM clients WHERE collaborator_id=? AND is_active=1');$clientsStmt->execute([$pId]);$assignedClients=(int)$clientsStmt->fetchColumn();
        $dueStmt=db()->prepare("SELECT COALESCE(SUM(commission_value),0) FROM commissions WHERE collaborator_id=? AND is_active=1 AND (status IN ('ESTIMATED','CALCULATED','APPROVED') OR (status='PAID' AND paid_at IS NULL))");$dueStmt->execute([$pId]);$dueAmount=(float)$dueStmt->fetchColumn();
        if($assignedClients>0||$dueAmount>0)fail('Colaboratorul nu poate fi șters până când clienții sunt realocați și comisioanele sunt achitate.',409,['assignedClients'=>$assignedClients,'dueAmount'=>round($dueAmount,2)]);
        $presetStmt=db()->prepare('SELECT '.uuid_sql('property_id').' id FROM collaborator_properties WHERE collaborator_id=? AND is_preset=1');$presetStmt->execute([$pId]);$presetPropertyIds=array_column($presetStmt->fetchAll(),'id');$pdo=db();$pdo->beginTransaction();
        try{$pdo->prepare('UPDATE collaborator_properties SET is_preset=NULL WHERE collaborator_id=? AND is_preset=1')->execute([$pId]);$pdo->prepare('UPDATE collaborators SET is_active=0,updated_at=?,updated_by=? WHERE id=?')->execute([now_utc(),uuid_bin($user['id']),$pId]);$pdo->commit();}catch(Throwable$e){$pdo->rollBack();throw$e;}
        $after=get_collaborator($params['id'],$propertyId);$auditBefore=$before;$auditAfter=$after;unset($auditBefore['propertyIds'],$auditAfter['propertyIds']);audit_log('COLLABORATOR_DELETED','collaborators','Colaborator șters: '.$after['name'],'Collaborator',$after['id'],$propertyId,$auditBefore,$auditAfter,$user);
        foreach($presetPropertyIds as$presetPropertyId)audit_log('COLLABORATOR_PRESET_CHANGED','collaborators','Colaborator presetat eliminat prin ștergere: '.$after['name'],'Property',$presetPropertyId,$presetPropertyId,['collaboratorId'=>$after['id']],['collaboratorId'=>null],$user);
        respond(['deleted'=>true]);
    }

    if ($method==='GET'&&$path==='/collaborator-finances') {
        $user=require_permission('collaborators.view');$propertyId=(string)($_GET['propertyId']??'');ensure_property($propertyId,$user);$p=uuid_bin($propertyId);
        $pairs="SELECT DISTINCT property_id,collaborator_id,client_id FROM commissions WHERE is_active=1 AND status<>'CANCELLED'";
        $totals="SELECT property_id,collaborator_id,client_id,COUNT(DISTINCT service_sheet_id) service_sheets_count,COALESCE(SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN commission_value ELSE 0 END),0) paid,COALESCE(SUM(CASE WHEN status IN ('ESTIMATED','CALCULATED','APPROVED') OR (status='PAID' AND paid_at IS NULL) THEN commission_value ELSE 0 END),0) due,MAX(updated_at) last_activity_at FROM commissions WHERE is_active=1 AND status<>'CANCELLED' GROUP BY property_id,collaborator_id,client_id";
        $sql='SELECT '.uuid_sql('co.id').' collaborator_id,co.name collaborator_name,co.role,'.uuid_sql('cl.id').' client_id,CONCAT(cl.first_name,\' \',cl.last_name) client_name,COALESCE(fin.service_sheets_count,0) service_sheets_count,COALESCE(fin.paid,0) paid,COALESCE(fin.due,0) due,COALESCE(fin.last_activity_at,cl.updated_at) last_activity_at FROM collaborator_properties cp JOIN collaborators co ON co.id=cp.collaborator_id JOIN ('.$pairs.') pair ON pair.collaborator_id=co.id AND pair.property_id=cp.property_id JOIN clients cl ON cl.id=pair.client_id AND cl.property_id=pair.property_id LEFT JOIN ('.$totals.') fin ON fin.property_id=pair.property_id AND fin.collaborator_id=pair.collaborator_id AND fin.client_id=pair.client_id WHERE cp.property_id=? AND pair.property_id=? ORDER BY co.name,cl.first_name,cl.last_name';
        $stmt=db()->prepare($sql);$stmt->execute([$p,$p]);$groups=[];$paid=0.0;$due=0.0;
        foreach($stmt->fetchAll()as$row){
            $collaboratorId=(string)$row['collaborator_id'];$clientPaid=(float)$row['paid'];$clientDue=(float)$row['due'];$clientTotal=$clientPaid+$clientDue;
            if(!isset($groups[$collaboratorId]))$groups[$collaboratorId]=['collaboratorId'=>$collaboratorId,'collaboratorName'=>$row['collaborator_name'],'role'=>$row['role']?:null,'total'=>0.0,'paid'=>0.0,'due'=>0.0,'clientsCount'=>0,'clients'=>[]];
            $groups[$collaboratorId]['paid']+=$clientPaid;$groups[$collaboratorId]['due']+=$clientDue;$groups[$collaboratorId]['total']+=$clientTotal;$groups[$collaboratorId]['clientsCount']++;
            $groups[$collaboratorId]['clients'][]=['clientId'=>$row['client_id'],'clientName'=>$row['client_name'],'serviceSheetsCount'=>(int)$row['service_sheets_count'],'lastActivityAt'=>iso_date($row['last_activity_at']),'paid'=>round($clientPaid,2),'due'=>round($clientDue,2),'total'=>round($clientTotal,2)];
            $paid+=$clientPaid;$due+=$clientDue;
        }
        foreach($groups as&$group){$group['paid']=round($group['paid'],2);$group['due']=round($group['due'],2);$group['total']=round($group['total'],2);}unset($group);
        respond(['paid'=>round($paid,2),'due'=>round($due,2),'total'=>round($paid+$due,2),'collaborators'=>array_values($groups)]);
    }

    if ($method==='PUT'&&$path==='/commissions/client-status') {
        $user=require_permission('collaborators.manage');$body=json_body();$propertyId=trim((string)($body['propertyId']??''));$collaboratorId=trim((string)($body['collaboratorId']??''));$clientId=trim((string)($body['clientId']??''));
        if($propertyId===''||$collaboratorId===''||$clientId===''||!array_key_exists('paid',$body)||!is_bool($body['paid']))fail('Proprietatea, colaboratorul, clientul și starea plății sunt obligatorii.',422);
        ensure_property($propertyId,$user);$client=get_client($clientId);if($client['propertyId']!==$propertyId)fail('Clientul nu aparține proprietății selectate.',422);
        $link=db()->prepare('SELECT c.name FROM collaborators c JOIN collaborator_properties cp ON cp.collaborator_id=c.id WHERE c.id=? AND cp.property_id=? LIMIT 1');$link->execute([uuid_bin($collaboratorId),uuid_bin($propertyId)]);$collaboratorName=$link->fetchColumn();if(!$collaboratorName)fail('Colaboratorul nu aparține proprietății selectate.',422);
        $pdo=db();$pdo->beginTransaction();$clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($clientId)]);
        $client=get_client($clientId);$select=$pdo->prepare('SELECT '.uuid_sql('id').' id,status,commission_value,paid_at FROM commissions WHERE property_id=? AND collaborator_id=? AND client_id=? AND is_active=1 AND status<>\'CANCELLED\' FOR UPDATE');$select->execute([uuid_bin($propertyId),uuid_bin($collaboratorId),uuid_bin($clientId)]);$before=$select->fetchAll();
        if(!$before&&($client['collaboratorId']??null)===$collaboratorId){sync_client_commission($pdo,$client,client_financial_record($client),client_expenses($clientId),$user,false);$select->execute([uuid_bin($propertyId),uuid_bin($collaboratorId),uuid_bin($clientId)]);$before=$select->fetchAll();}
        if(!$before){$pdo->rollBack();fail('Nu există o fișă activă cu un comision pentru acest colaborator și client.',404);}
        $paid=(bool)$body['paid'];$status=$paid?'PAID':'APPROVED';$now=now_utc();
        try{if($paid){$update=$pdo->prepare("UPDATE commissions SET status='PAID',paid_at=COALESCE(paid_at,?),updated_at=?,updated_by=? WHERE property_id=? AND collaborator_id=? AND client_id=? AND is_active=1 AND status<>'CANCELLED'");$update->execute([$now,$now,uuid_bin($user['id']),uuid_bin($propertyId),uuid_bin($collaboratorId),uuid_bin($clientId)]);}else{$update=$pdo->prepare("UPDATE commissions SET status='APPROVED',paid_at=NULL,updated_at=?,updated_by=? WHERE property_id=? AND collaborator_id=? AND client_id=? AND is_active=1 AND status<>'CANCELLED'");$update->execute([$now,uuid_bin($user['id']),uuid_bin($propertyId),uuid_bin($collaboratorId),uuid_bin($clientId)]);}$pdo->commit();}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        $amount=(float)array_sum(array_map(fn($row)=>(float)$row['commission_value'],$before));$beforeStatuses=implode(',',array_values(array_unique(array_column($before,'status'))));
        audit_log($paid?'COLLABORATOR_PAYMENT_MARKED_PAID':'COLLABORATOR_PAYMENT_MARKED_DUE','commissions',($paid?'Comisioane marcate achitate':'Comisioane marcate de achitat').' pentru '.$client['firstName'].' '.$client['lastName'].' / '.$collaboratorName,'Client',$clientId,$propertyId,['status'=>$beforeStatuses,'amount'=>$amount,'affectedCount'=>count($before)],['status'=>$status,'amount'=>$amount,'affectedCount'=>count($before)],$user);
        respond(['updated'=>$update->rowCount(),'status'=>$status,'paid'=>$paid,'paidAt'=>$paid?iso_date($now):null]);
    }

    if ($method==='GET'&&$path==='/users') { $user=require_permission('users.view');$propertyId=(string)($_GET['propertyId']??'');ensure_property($propertyId,$user);$sql='SELECT '.uuid_sql('u.id').' id,u.username,u.first_name,u.last_name,u.email,u.phone,u.role,u.permissions,u.is_active,u.last_login_at,u.created_at,u.updated_at,'.uuid_sql('u.created_by').' created_by,'.uuid_sql('u.updated_by').' updated_by FROM users u JOIN user_properties up ON up.user_id=u.id WHERE up.property_id=? ORDER BY u.is_active DESC,u.first_name,u.last_name';$stmt=db()->prepare($sql);$stmt->execute([uuid_bin($propertyId)]);$data=[];foreach($stmt->fetchAll()as$row){$item=entity_base($row);$item['permissions']=json_decode((string)$row['permissions'],true)?:[];$item['propertyIds']=[];$pstmt=db()->prepare('SELECT '.uuid_sql('property_id').' id FROM user_properties WHERE user_id=?');$pstmt->execute([uuid_bin($item['id'])]);$item['propertyIds']=array_column($pstmt->fetchAll(),'id');$data[]=$item;}respond($data); }
    if ($method==='POST'&&$path==='/users') { $admin=require_permission('users.manage');$body=json_body();if(strlen(trim((string)($body['username']??'')))<3||strlen((string)($body['password']??''))<8)fail('Utilizator invalid sau parolă prea scurtă.',422);$propertyIds=$body['propertyIds']??[];foreach($propertyIds as$propertyId)ensure_property($propertyId,$admin);$id=uuid_v4();$now=now_utc();$pdo=db();$pdo->beginTransaction();try{$pdo->prepare('INSERT INTO users (id,username,password_hash,first_name,last_name,email,phone,role,permissions,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)')->execute([uuid_bin($id),trim($body['username']),password_hash($body['password'],PASSWORD_DEFAULT),trim((string)$body['firstName']),trim((string)$body['lastName']),$body['email']??null,$body['phone']??null,$body['role']??'OPERATOR',json_encode($body['permissions']??[]),$now,$now,uuid_bin($admin['id']),uuid_bin($admin['id'])]);$link=$pdo->prepare('INSERT INTO user_properties (user_id,property_id) VALUES (?,?)');foreach($propertyIds as$propertyId)$link->execute([uuid_bin($id),uuid_bin($propertyId)]);$pdo->commit();audit_log('USER_CREATED','users','Utilizator creat: '.$body['username'],'User',$id,$propertyIds[0]??null,null,array_diff_key($body,['password'=>true]),$admin);respond(user_record($id),201);}catch(PDOException$e){$pdo->rollBack();if((int)$e->errorInfo[1]===1062)fail('Numele de utilizator există deja.',409);throw$e;} }
    if ($method==='PUT'&&path_match('/users/{id}/permissions',$path,$params)) { $admin=require_permission('roles.manage');$body=json_body();$permissions=$body['permissions']??null;if(!is_array($permissions))fail('Lista permisiunilor este invalidă.',422);$before=user_record($params['id']);db()->prepare('UPDATE users SET permissions=?,updated_at=?,updated_by=? WHERE id=?')->execute([json_encode(array_values(array_unique($permissions))),now_utc(),uuid_bin($admin['id']),uuid_bin($params['id'])]);$after=user_record($params['id']);audit_log('USER_PERMISSIONS_UPDATED','users','Permisiuni actualizate pentru @'.$after['username'],'User',$after['id'],$after['propertyIds'][0]??null,$before,$after,$admin);respond($after); }
    if ($method==='PUT'&&path_match('/users/{id}/password',$path,$params)) { $admin=require_permission('users.manage');$body=json_body();$password=(string)($body['password']??'');if(strlen($password)<8)fail('Parola trebuie să aibă minimum 8 caractere.',422);$target=user_record($params['id']);db()->prepare('UPDATE users SET password_hash=?,updated_at=?,updated_by=? WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),now_utc(),uuid_bin($admin['id']),uuid_bin($params['id'])]);db()->prepare('UPDATE refresh_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')->execute([now_utc(),uuid_bin($params['id'])]);audit_log('USER_PASSWORD_RESET','users','Parolă resetată pentru @'.$target['username'],'User',$target['id'],$target['propertyIds'][0]??null,null,null,$admin);respond(['changed'=>true]); }
    if ($method==='DELETE'&&path_match('/users/{id}',$path,$params)) { $admin=require_permission('users.manage');if($params['id']===$admin['id'])fail('Nu îți poți dezactiva propriul cont.',422);$target=user_record($params['id']);db()->prepare('UPDATE users SET is_active=0,updated_at=?,updated_by=? WHERE id=?')->execute([now_utc(),uuid_bin($admin['id']),uuid_bin($params['id'])]);db()->prepare('UPDATE refresh_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')->execute([now_utc(),uuid_bin($params['id'])]);audit_log('USER_DEACTIVATED','users','Utilizator dezactivat: @'.$target['username'],'User',$target['id'],$target['propertyIds'][0]??null,$target,['isActive'=>false],$admin);respond(['deleted'=>true]); }

    if ($method==='GET'&&$path==='/audit-logs') { $user=require_permission('audit.view');$propertyId=(string)($_GET['propertyId']??'');if($propertyId)ensure_property($propertyId,$user);$where=[];$args=[];if($propertyId){$where[]='a.property_id=?';$args[]=uuid_bin($propertyId);}if(!empty($_GET['entityId'])){$where[]='a.entity_id=?';$args[]=uuid_bin((string)$_GET['entityId']);}$sql='SELECT '.uuid_sql('a.id').' id,'.uuid_sql('a.user_id').' user_id,CONCAT(u.first_name,\' \',u.last_name) user_name,'.uuid_sql('a.property_id').' property_id,a.action,a.module,a.entity_type,'.uuid_sql('a.entity_id').' entity_id,a.summary,a.before_data,a.after_data,a.ip_address,a.device,a.created_at FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id'.($where?' WHERE '.implode(' AND ',$where):'').' ORDER BY a.created_at DESC LIMIT 200';$stmt=db()->prepare($sql);$stmt->execute($args);$data=[];foreach($stmt->fetchAll()as$row){$ip=$row['ip_address'];unset($row['ip_address']);$item=entity_base($row);$item['before']=$row['before_data']?json_decode($row['before_data'],true):null;$item['after']=$row['after_data']?json_decode($row['after_data'],true):null;unset($item['beforeData'],$item['afterData']);$item['ipAddress']=$ip?inet_ntop($ip):null;$item['updatedAt']=$item['createdAt'];$item['createdBy']=$item['userId']??'00000000-0000-4000-8000-000000000001';$item['updatedBy']=$item['createdBy'];$item['isActive']=true;$data[]=$item;}respond(['data'=>$data,'page'=>1,'pageSize'=>200,'total'=>count($data),'totalPages'=>1]); }

    if ($method==='GET'&&$path==='/reports') {
        $user=require_permission('reports.view');$propertyId=(string)($_GET['propertyId']??'');ensure_property($propertyId,$user);$p=uuid_bin($propertyId);$pdo=db();
        $scalar=function(string$sql,array$args=[])use($pdo){$s=$pdo->prepare($sql);$s->execute($args);return$s->fetchColumn();};
        $clients=(int)$scalar('SELECT COUNT(*) FROM clients WHERE property_id=? AND is_active=1',[$p]);
        $generated=(int)$scalar("SELECT COUNT(*) FROM client_qr WHERE property_id=? AND is_active=1 AND status IN ('GENERATED','SENT')",[$p]);$used=(int)$scalar("SELECT COUNT(*) FROM client_qr WHERE property_id=? AND is_active=1 AND status='USED'",[$p]);
        $revenue=(float)$scalar("SELECT COALESCE(SUM(total_cost),0) FROM service_sheets WHERE property_id=? AND is_active=1 AND status<>'CANCELLED'",[$p]);$costs=(float)$scalar("SELECT COALESCE(SUM(direct_costs),0) FROM service_sheets WHERE property_id=? AND is_active=1 AND status<>'CANCELLED'",[$p]);
        $commissionTotal=(float)$scalar("SELECT COALESCE(SUM(commission_value),0) FROM commissions WHERE property_id=? AND is_active=1 AND status<>'CANCELLED'",[$p]);$payments=(float)$scalar("SELECT COALESCE(SUM(commission_value),0) FROM commissions WHERE property_id=? AND is_active=1 AND status='PAID' AND paid_at IS NOT NULL",[$p]);
        $clientsWaiting=(int)$scalar("SELECT COUNT(DISTINCT client_id) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS')",[$p]);
        $revenueOnHold=(float)$scalar("SELECT COALESCE(SUM(total_cost),0) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS')",[$p]);
        $collaboratorOnHold=(float)$scalar("SELECT COALESCE(SUM(commission_value),0) FROM commissions WHERE property_id=? AND is_active=1 AND (status IN ('ESTIMATED','CALCULATED','APPROVED') OR (status='PAID' AND paid_at IS NULL))",[$p]);$collaboratorTotal=$payments+$collaboratorOnHold;$gshopNet=$revenue-$costs-$collaboratorTotal;
        $metrics=['clientsTotal'=>$clients,'totalRevenue'=>round($revenue,2),'clientsWaiting'=>$clientsWaiting,'revenueOnHold'=>round($revenueOnHold,2),'gshopNet'=>round($gshopNet,2),'collaboratorTotal'=>round($collaboratorTotal,2),'collaboratorPaid'=>round($payments,2),'collaboratorOnHold'=>round($collaboratorOnHold,2),'clientsNew'=>(int)$scalar('SELECT COUNT(*) FROM clients WHERE property_id=? AND is_active=1 AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)',[$p]),'serviceSheetsOpen'=>(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS')",[$p]),'serviceSheetsInProgress'=>(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status='IN_PROGRESS'",[$p]),'serviceSheetsCompleted'=>(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('COMPLETED','DELIVERED')",[$p]),'usersActive'=>(int)$scalar('SELECT COUNT(*) FROM user_properties up JOIN users u ON u.id=up.user_id WHERE up.property_id=? AND u.is_active=1',[$p]),'collaboratorsActive'=>(int)$scalar('SELECT COUNT(*) FROM collaborator_properties cp JOIN collaborators c ON c.id=cp.collaborator_id WHERE cp.property_id=? AND c.is_active=1',[$p]),'qrGenerated'=>$generated,'qrUsed'=>$used,'estimatedRevenue'=>$revenue,'collaboratorCommissions'=>$commissionTotal,'collaboratorPayments'=>$payments];
        $months=[];for($i=5;$i>=0;$i--){$start=gmdate('Y-m-01 00:00:00',strtotime("-{$i} months"));$end=gmdate('Y-m-01 00:00:00',strtotime($start.' +1 month'));$months[]=['label'=>strftime('%b',strtotime($start)),'value'=>(float)$scalar("SELECT COALESCE(SUM(total_cost),0) FROM service_sheets WHERE property_id=? AND is_active=1 AND status<>'CANCELLED' AND created_at>=? AND created_at<?",[$p,$start,$end])];}
        $stmt=$pdo->prepare('SELECT '.uuid_sql('id').' id,'.uuid_sql('collaborator_id').' collaborator_id,'.uuid_sql('client_id').' client_id,'.uuid_sql('service_sheet_id').' service_sheet_id,'.uuid_sql('intervention_id').' intervention_id,'.uuid_sql('property_id').' property_id,total_value,direct_costs,net_value,type,rate_or_amount,commission_value,status,paid_at,is_active,created_at,updated_at,'.uuid_sql('created_by').' created_by,'.uuid_sql('updated_by').' updated_by FROM commissions WHERE property_id=? AND is_active=1 ORDER BY created_at DESC LIMIT 100');$stmt->execute([$p]);
        $commissions=array_map(function($row){$item=entity_base($row);foreach(['totalValue','directCosts','netValue','rateOrAmount','commissionValue']as$key)$item[$key]=(float)$item[$key];return$item;},$stmt->fetchAll());
        respond(['metrics'=>$metrics,'commissions'=>$commissions,'revenueByMonth'=>$months,'totalCosts'=>$costs,'netProfit'=>max(0,$revenue-$costs-$commissionTotal)]);
    }

    fail('Endpoint inexistent.', 404);
} catch (InvalidArgumentException $error) {
    fail($error->getMessage(), 422);
} catch (PDOException $error) {
    error_log('[G-Shop DB] ' . $error->getMessage());
    fail('Baza de date nu a putut procesa cererea.', 500);
} catch (Throwable $error) {
    error_log('[G-Shop API] ' . $error->getMessage());
    fail('A apărut o eroare internă.', 500);
}
