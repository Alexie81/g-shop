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
function migrate_client_collaborators(PDO $pdo): array {
    $lockName = 'gshop_client_collaborators_v1';
    $lock = $pdo->prepare('SELECT GET_LOCK(?,10)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('Migrarea colaboratorilor multipli nu a putut obține blocarea bazei de date.');
    $changes = [];
    try {
        $exists = (bool)$pdo->query("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='client_collaborators' LIMIT 1")->fetchColumn();
        if (!$exists) {
            $pdo->exec("CREATE TABLE client_collaborators (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            $changes[] = 'client_collaborators';
        }
        $backfilled = $pdo->exec("INSERT IGNORE INTO client_collaborators (client_id,collaborator_id,commission_type,commission_value,sort_order,created_at,updated_at,created_by,updated_by)
            SELECT id,collaborator_id,commission_type,commission_value,1,created_at,updated_at,created_by,updated_by
            FROM clients WHERE collaborator_id IS NOT NULL AND commission_type IS NOT NULL AND commission_value IS NOT NULL");
        if ($backfilled > 0) $changes[] = 'client_collaborators.backfill:' . $backfilled;
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
function resequence_whatsapp_messages(PDO $pdo, string $propertyId, string $userId, ?string $movingId = null, ?int $targetPosition = null): int {
    $stmt = $pdo->prepare('SELECT '.uuid_sql('id').' id,sort_order FROM whatsapp_messages WHERE property_id=? AND user_id=? AND is_active=1 ORDER BY sort_order,title,created_at,id');
    $stmt->execute([uuid_bin($propertyId),uuid_bin($userId)]);
    $rows = $stmt->fetchAll();
    if ($movingId !== null) {
        $moving = null;
        $remaining = [];
        foreach ($rows as $row) {
            if ($row['id'] === $movingId) $moving = $row;
            else $remaining[] = $row;
        }
        if ($moving !== null) {
            $position = max(1,min(count($remaining)+1,$targetPosition ?? count($remaining)+1));
            array_splice($remaining,$position-1,0,[$moving]);
            $rows = $remaining;
        }
    }
    $update = $pdo->prepare('UPDATE whatsapp_messages SET sort_order=? WHERE id=?');
    $changed = 0;
    foreach ($rows as $index => $row) {
        $position = $index + 1;
        if ((int)$row['sort_order'] === $position) continue;
        $update->execute([$position,uuid_bin($row['id'])]);
        $changed++;
    }
    return $changed;
}
function migrate_whatsapp_messages(PDO $pdo): array {
    $lockName = 'gshop_whatsapp_messages_v1';
    $lock = $pdo->prepare('SELECT GET_LOCK(?,10)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('Migrarea mesajelor WhatsApp nu a putut obține blocarea bazei de date.');
    $changes = [];
    try {
        $exists = (bool)$pdo->query("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='whatsapp_messages' LIMIT 1")->fetchColumn();
        if (!$exists) {
            $pdo->exec("CREATE TABLE whatsapp_messages (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $changes[] = 'whatsapp_messages';

            $owners = $pdo->query("SELECT " . uuid_sql('up.property_id') . " property_id," . uuid_sql('up.user_id') . " user_id FROM user_properties up JOIN properties p ON p.id=up.property_id JOIN users u ON u.id=up.user_id WHERE p.type='SERVICE' AND p.is_active=1 AND u.is_active=1")->fetchAll();
            $defaults = [
                ['Actualizare reparație', 'Bună ziua, {prenume}! Vă contactăm din partea {proprietate} cu o actualizare privind reparația dumneavoastră.', 1],
                ['Reparație finalizată', 'Bună ziua, {prenume}! Reparația dumneavoastră este finalizată și poate fi ridicată. Vă mulțumim, {proprietate}!', 2],
                ['Link status reparație', 'Bună ziua, {prenume}! Puteți urmări statusul reparației aici: {link_status}', 3],
            ];
            $insert = $pdo->prepare('INSERT INTO whatsapp_messages (id,property_id,user_id,title,message,sort_order,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,1,?,?,?,?)');
            $now = now_utc();
            foreach ($owners as $owner) foreach ($defaults as $default) $insert->execute([uuid_bin(uuid_v4()),uuid_bin($owner['property_id']),uuid_bin($owner['user_id']),$default[0],$default[1],$default[2],$now,$now,uuid_bin($owner['user_id']),uuid_bin($owner['user_id'])]);
            if ($owners) $changes[] = 'whatsapp_messages.defaults';
        }
        $owners = $pdo->query("SELECT DISTINCT " . uuid_sql('property_id') . " property_id," . uuid_sql('user_id') . " user_id FROM whatsapp_messages WHERE is_active=1")->fetchAll();
        $normalized = 0;
        foreach ($owners as $owner) $normalized += resequence_whatsapp_messages($pdo,$owner['property_id'],$owner['user_id']);
        if ($normalized > 0) $changes[] = 'whatsapp_messages.order';
    } finally {
        $release = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $release->execute([$lockName]);
    }
    return $changes;
}
function migrate_service_sheet_documents(PDO $pdo): array {
    $lockName = 'gshop_service_sheet_documents_v1';
    $lock = $pdo->prepare('SELECT GET_LOCK(?,10)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('Migrarea documentelor fișelor nu a putut obține blocarea bazei de date.');
    $changes = [];
    $columns = [
        'technician_name' => 'VARCHAR(120) NULL AFTER technician_id',
        'show_company_details' => 'TINYINT(1) NOT NULL DEFAULT 1 AFTER collaborator_commission',
        'warranty' => 'VARCHAR(120) NULL AFTER show_company_details',
        'storage_after' => 'VARCHAR(120) NULL AFTER warranty',
        'handover_notes' => 'TEXT NULL AFTER storage_after',
        'identity_document' => 'VARCHAR(120) NULL AFTER handover_notes',
        'approve_diagnostics' => 'TINYINT(1) NOT NULL DEFAULT 0 AFTER identity_document',
        'approve_repair' => 'TINYINT(1) NOT NULL DEFAULT 0 AFTER approve_diagnostics',
        'repair_refused' => 'TINYINT(1) NOT NULL DEFAULT 0 AFTER approve_repair',
        'product_delivered' => 'TINYINT(1) NOT NULL DEFAULT 0 AFTER repair_refused',
    ];
    try {
        $lookup = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='service_sheets' AND column_name=? LIMIT 1");
        foreach ($columns as $column => $definition) {
            $lookup->execute([$column]);
            if ($lookup->fetchColumn()) continue;
            $pdo->exec('ALTER TABLE service_sheets ADD COLUMN ' . $column . ' ' . $definition);
            $changes[] = 'service_sheets.' . $column;
        }
    } finally {
        $release = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $release->execute([$lockName]);
    }
    return $changes;
}
function validated_whatsapp_message_text(mixed $value, string $label, int $minimum, int $maximum): string {
    if (!is_string($value)) fail($label . ' este obligatoriu.',422);
    $text = trim(str_replace(["\r\n","\r"],"\n",$value));
    $length = function_exists('mb_strlen') ? mb_strlen($text,'UTF-8') : strlen($text);
    if ($length < $minimum || $length > $maximum || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u',$text)) fail($label . ' trebuie să aibă între ' . $minimum . ' și ' . $maximum . ' de caractere.',422);
    return $text;
}
function whatsapp_message_record(string $id): array {
    $stmt=db()->prepare('SELECT '.uuid_sql('id').' id,'.uuid_sql('property_id').' property_id,'.uuid_sql('user_id').' user_id,title,message,sort_order,is_active,created_at,updated_at,'.uuid_sql('created_by').' created_by,'.uuid_sql('updated_by').' updated_by FROM whatsapp_messages WHERE id=? LIMIT 1');
    $stmt->execute([uuid_bin($id)]);$row=$stmt->fetch();if(!$row)fail('Mesajul WhatsApp nu există.',404);$item=entity_base($row);$item['sortOrder']=(int)$item['sortOrder'];return$item;
}
function property_record(string $id): array {
    $stmt=db()->prepare('SELECT '.uuid_sql('id').' id,name,domain,type,enabled_modules,is_active,created_at,updated_at,'.uuid_sql('created_by').' created_by,'.uuid_sql('updated_by').' updated_by FROM properties WHERE id=? AND is_active=1 LIMIT 1');
    $stmt->execute([uuid_bin($id)]);$row=$stmt->fetch();if(!$row)fail('Proprietatea nu există.',404);$item=entity_base($row);$item['enabledModules']=json_decode((string)$row['enabled_modules'],true)?:[];return$item;
}
function ensure_company_details_table(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS property_company_details (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}
function ensure_property_companies_table(PDO $pdo): void {
    static $ready = false;
    if ($ready) return;
    ensure_company_details_table($pdo);
    $pdo->exec("CREATE TABLE IF NOT EXISTS property_companies (
        id BINARY(16) PRIMARY KEY,
        property_id BINARY(16) NOT NULL,
        is_default TINYINT(1) NOT NULL DEFAULT 0,
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
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        created_by BINARY(16) NULL,
        updated_by BINARY(16) NULL,
        INDEX idx_property_companies_property (property_id,is_active,is_default),
        CONSTRAINT fk_property_companies_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $legacy=$pdo->query('SELECT property_id,legal_name,tax_id,trade_register_number,vat_payer,address,city,county,postal_code,country,phone,email,website,bank_name,iban,representative_name,representative_role,stamp_path,created_at,updated_at,created_by,updated_by FROM property_company_details')->fetchAll();
    $exists=$pdo->prepare('SELECT 1 FROM property_companies WHERE property_id=? AND is_active=1 LIMIT 1');
    $migrationColumns=['id','property_id','is_default','legal_name','tax_id','trade_register_number','vat_payer','address','city','county','postal_code','country','phone','email','website','bank_name','iban','representative_name','representative_role','stamp_path','is_active','created_at','updated_at','created_by','updated_by'];
    $insert=$pdo->prepare('INSERT INTO property_companies ('.implode(',',$migrationColumns).') VALUES ('.implode(',',array_fill(0,count($migrationColumns),'?')).')');
    foreach($legacy as$row){$exists->execute([$row['property_id']]);if($exists->fetchColumn())continue;$insert->execute([uuid_bin(uuid_v4()),$row['property_id'],1,$row['legal_name'],$row['tax_id'],$row['trade_register_number'],$row['vat_payer'],$row['address'],$row['city'],$row['county'],$row['postal_code'],$row['country']?:'România',$row['phone'],$row['email'],$row['website'],$row['bank_name'],$row['iban'],$row['representative_name'],$row['representative_role'],$row['stamp_path'],1,$row['created_at'],$row['updated_at'],$row['created_by'],$row['updated_by']]);}

    $properties=$pdo->query('SELECT DISTINCT property_id FROM property_companies WHERE is_active=1')->fetchAll();
    $hasDefault=$pdo->prepare('SELECT 1 FROM property_companies WHERE property_id=? AND is_active=1 AND is_default=1 LIMIT 1');
    $first=$pdo->prepare('SELECT id FROM property_companies WHERE property_id=? AND is_active=1 ORDER BY created_at,id LIMIT 1');
    $makeDefault=$pdo->prepare('UPDATE property_companies SET is_default=1 WHERE id=?');
    foreach($properties as$row){$hasDefault->execute([$row['property_id']]);if($hasDefault->fetchColumn())continue;$first->execute([$row['property_id']]);$id=$first->fetchColumn();if($id)$makeDefault->execute([$id]);}

    $column=$pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='service_sheets' AND column_name=? LIMIT 1");
    $column->execute(['company_id']);$companyColumnExists=(bool)$column->fetchColumn();
    if(!$companyColumnExists)$pdo->exec('ALTER TABLE service_sheets ADD COLUMN company_id BINARY(16) NULL AFTER show_company_details');
    $column->execute(['company_snapshot']);if(!$column->fetchColumn())$pdo->exec('ALTER TABLE service_sheets ADD COLUMN company_snapshot LONGTEXT NULL AFTER company_id');
    if(!$companyColumnExists)$pdo->exec('UPDATE service_sheets SET show_company_details=1');
    $pdo->exec('UPDATE service_sheets s JOIN property_companies pc ON pc.property_id=s.property_id AND pc.is_active=1 AND pc.is_default=1 SET s.company_id=pc.id WHERE s.company_id IS NULL');
    $ready = true;
}
function ensure_service_documents_table(PDO $pdo): void {
    static $ready = false;
    if ($ready) return;
    ensure_property_companies_table($pdo);
    $pdo->exec("CREATE TABLE IF NOT EXISTS service_documents (
        id BINARY(16) PRIMARY KEY,
        service_sheet_id BINARY(16) NOT NULL,
        client_id BINARY(16) NOT NULL,
        property_id BINARY(16) NOT NULL,
        type ENUM('INTAKE','FINAL_ESTIMATE','EXIT') NOT NULL,
        number VARCHAR(40) NOT NULL,
        status ENUM('PUBLISHED') NOT NULL DEFAULT 'PUBLISHED',
        document_at DATETIME NOT NULL,
        agreement_at DATETIME NULL,
        agreement_status ENUM('ACCEPTED','REFUSED') NULL,
        estimated_repair_days SMALLINT UNSIGNED NULL,
        product_state ENUM('REPAIRED','INITIAL') NULL,
        defect_cause VARCHAR(40) NULL,
        final_notes TEXT NULL,
        parts_json LONGTEXT NULL,
        labor_json LONGTEXT NULL,
        snapshot_json LONGTEXT NOT NULL,
        signature_path VARCHAR(255) NULL,
        file_path VARCHAR(255) NULL,
        file_sha256 CHAR(64) NULL,
        generated_at DATETIME NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        created_by BINARY(16) NOT NULL,
        updated_by BINARY(16) NOT NULL,
        UNIQUE KEY uq_service_document_type (service_sheet_id,type),
        INDEX idx_service_documents_public (client_id,property_id,status,is_active),
        CONSTRAINT fk_service_document_sheet FOREIGN KEY (service_sheet_id) REFERENCES service_sheets(id) ON DELETE CASCADE,
        CONSTRAINT fk_service_document_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        CONSTRAINT fk_service_document_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $ready = true;
}
function company_detail_text(mixed $value, string $label, int $maximum, bool $required = false): ?string {
    if ($value === null || $value === '') {
        if ($required) fail($label . ' este obligatoriu.', 422);
        return null;
    }
    if (!is_string($value)) fail($label . ' nu este valid.', 422);
    $text = preg_replace('/\s+/u', ' ', trim($value));
    $length = $text === null ? false : (function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text));
    if ($text === null || $length === false || ($required && $length < 2) || $length > $maximum || preg_match('/[\x00-\x1F\x7F]/u', $text)) fail($label . ' nu este valid.', 422);
    return $text === '' ? null : $text;
}
function company_select(): string { return 'SELECT '.uuid_sql('id').' id,'.uuid_sql('property_id').' property_id,is_default,legal_name,tax_id,trade_register_number,vat_payer,address,city,county,postal_code,country,phone,email,website,bank_name,iban,representative_name,representative_role,stamp_path,created_at,updated_at,'.uuid_sql('created_by').' created_by,'.uuid_sql('updated_by').' updated_by FROM property_companies'; }
function map_company_details(array $row, bool $includeStampPath = false): array {
    $item=entity_base($row);$item['isDefault']=(bool)($item['isDefault']??false);$item['vatPayer']=(bool)($item['vatPayer']??false);foreach(['legalName','taxId','tradeRegisterNumber','address','city','county','postalCode','country','phone','email','website','bankName','iban','representativeName','representativeRole']as$key)$item[$key]=(string)($item[$key]??'');$item['stampUrl']=$item['stampPath']?public_base_url().'/'.ltrim((string)$item['stampPath'],'/').'?v='.rawurlencode((string)($item['updatedAt']??'')):null;if(!$includeStampPath)unset($item['stampPath']);return$item;
}
function empty_company_details(string $propertyId): array { return['id'=>'','propertyId'=>$propertyId,'isDefault'=>false,'legalName'=>'','taxId'=>'','tradeRegisterNumber'=>'','vatPayer'=>false,'address'=>'','city'=>'','county'=>'','postalCode'=>'','country'=>'România','phone'=>'','email'=>'','website'=>'','bankName'=>'','iban'=>'','representativeName'=>'','representativeRole'=>'','stampUrl'=>null,'createdAt'=>null,'updatedAt'=>null,'createdBy'=>null,'updatedBy'=>null]; }
function company_details_record(string $propertyId): array {
    ensure_property_companies_table(db());$stmt=db()->prepare(company_select().' WHERE property_id=? AND is_active=1 ORDER BY is_default DESC,created_at LIMIT 1');$stmt->execute([uuid_bin($propertyId)]);$row=$stmt->fetch();return$row?map_company_details($row):empty_company_details($propertyId);
}
function company_details_by_id(string $id, ?string $propertyId = null, bool $includeStampPath = false): array {
    ensure_property_companies_table(db());$sql=company_select().' WHERE id=? AND is_active=1';$args=[uuid_bin($id)];if($propertyId!==null){$sql.=' AND property_id=?';$args[]=uuid_bin($propertyId);}$sql.=' LIMIT 1';$stmt=db()->prepare($sql);$stmt->execute($args);$row=$stmt->fetch();if(!$row)fail('Firma nu există.',404);return map_company_details($row,$includeStampPath);
}
function company_details_list(string $propertyId): array {
    ensure_property_companies_table(db());$stmt=db()->prepare(company_select().' WHERE property_id=? AND is_active=1 ORDER BY is_default DESC,legal_name,created_at');$stmt->execute([uuid_bin($propertyId)]);return array_map('map_company_details',$stmt->fetchAll());
}
function company_sheet_snapshot(array $company): array {
    foreach(['stampUrl','createdAt','updatedAt','createdBy','updatedBy','isDefault']as$key)unset($company[$key]);return$company;
}
function validated_company_payload(array $body): array {
    $legalName=company_detail_text($body['legalName']??null,'Denumirea juridică',160,true);$taxId=company_detail_text($body['taxId']??null,'CUI / CIF',24);$tradeRegister=company_detail_text($body['tradeRegisterNumber']??null,'Numărul Registrului Comerțului',40);
    $address=company_detail_text($body['address']??null,'Adresa',220);$city=company_detail_text($body['city']??null,'Localitatea',80);$county=company_detail_text($body['county']??null,'Județul',80);$postalCode=company_detail_text($body['postalCode']??null,'Codul poștal',16);$country=company_detail_text($body['country']??'România','Țara',60)??'România';
    $phone=company_detail_text($body['phone']??null,'Telefonul',30);$email=company_detail_text($body['email']??null,'Emailul',140);if($email!==null&&!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Adresa de email nu este validă.',422);$website=company_detail_text($body['website']??null,'Website-ul',160);
    $bankName=company_detail_text($body['bankName']??null,'Banca',100);$iban=company_detail_text($body['iban']??null,'IBAN-ul',40);if($iban!==null){$iban=strtoupper(str_replace(' ','',$iban));if(!preg_match('/^[A-Z]{2}[A-Z0-9]{13,38}$/',$iban))fail('IBAN-ul nu este valid.',422);}
    $representativeName=company_detail_text($body['representativeName']??null,'Reprezentantul legal',120);$representativeRole=company_detail_text($body['representativeRole']??null,'Funcția reprezentantului',80);$vatPayer=(bool)($body['vatPayer']??false);
    return[$legalName,$taxId,$tradeRegister,$vatPayer?1:0,$address,$city,$county,$postalCode,$country,$phone,$email,$website,$bankName,$iban,$representativeName,$representativeRole];
}
function company_details_snapshot(array $details): array {
    unset($details['stampUrl'],$details['stampPath'],$details['createdAt'],$details['updatedAt'],$details['createdBy'],$details['updatedBy']);
    return $details;
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
    $client['collaborators'] = client_collaborator_assignments($client['id']);
    if (!$client['collaborators'] && !empty($client['collaboratorId']) && !empty($client['commissionType'])) {
        $client['collaborators'][] = ['collaboratorId'=>$client['collaboratorId'],'name'=>'Colaborator atribuit','role'=>null,'commissionType'=>$client['commissionType'],'commissionValue'=>(float)$client['commissionValue'],'sortOrder'=>1];
    }
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
    ensure_property_companies_table(db());return 'SELECT ' . uuid_sql('s.id') . ' id,' . uuid_sql('s.property_id') . ' property_id,' . uuid_sql('s.client_id') . ' client_id,s.number,s.equipment,s.brand,s.model,s.serial_number,s.accessories,s.reported_issue,s.technical_assessment,s.work_performed,s.parts_used,s.parts_cost,s.labor_cost,s.total_cost,s.direct_costs,s.net_value,' . uuid_sql('s.technician_id') . ' technician_id,s.technician_name,' . uuid_sql('s.collaborator_id') . ' collaborator_id,s.collaborator_commission,s.show_company_details,' . uuid_sql('s.company_id') . ' company_id,s.company_snapshot,pc.legal_name company_name,s.warranty,s.storage_after,s.handover_notes,s.identity_document,s.approve_diagnostics,s.approve_repair,s.repair_refused,s.product_delivered,s.internal_notes,s.signature_path,s.signed_at,s.received_at,s.estimated_at,s.completed_at,s.status,COALESCE(cf.currency_code,\'RON\') currency_code,s.is_active,s.created_at,s.updated_at,' . uuid_sql('s.created_by') . ' created_by,' . uuid_sql('s.updated_by') . ' updated_by,' . uuid_sql('c.id') . ' c_id,c.first_name c_first_name,c.last_name c_last_name,c.phone c_phone,COALESCE(NULLIF(TRIM(s.technician_name),\'\'),TRIM(CONCAT(COALESCE(t.first_name,\'\'),\' \',COALESCE(t.last_name,\'\')))) t_name FROM service_sheets s JOIN clients c ON c.id=s.client_id LEFT JOIN client_financials cf ON cf.client_id=s.client_id LEFT JOIN users t ON t.id=s.technician_id LEFT JOIN property_companies pc ON pc.id=s.company_id';
}
function map_sheet(array $row): array {
    $client = ['id' => $row['c_id'], 'firstName' => $row['c_first_name'], 'lastName' => $row['c_last_name'], 'phone' => $row['c_phone']];
    $technicianName = trim((string)($row['t_name'] ?? ''));
    foreach (array_keys($row) as $key) if (str_starts_with($key, 'c_') || str_starts_with($key, 't_')) unset($row[$key]);
    $sheet = entity_base($row);
    foreach (['partsCost','laborCost','totalCost','directCosts','netValue','collaboratorCommission'] as $key) $sheet[$key] = $sheet[$key] !== null ? (float)$sheet[$key] : null;
    foreach (['showCompanyDetails','approveDiagnostics','approveRepair','repairRefused','productDelivered'] as $key) $sheet[$key] = (bool)$sheet[$key];
    $sheet['companySnapshot']=is_string($sheet['companySnapshot']??null)?(json_decode($sheet['companySnapshot'],true)?:null):($sheet['companySnapshot']??null);$sheet['companyName']=(string)($sheet['companySnapshot']['legalName']??$sheet['companyName']??'');
    $sheet['technicianName'] = $technicianName !== '' ? $technicianName : null;
    $signatureVersion = (string)($sheet['signedAt'] ?? $sheet['updatedAt'] ?? '');
    $sheet['signatureUrl'] = $sheet['signaturePath']
        ? public_base_url() . '/' . ltrim($sheet['signaturePath'], '/') . ($signatureVersion !== '' ? '?v=' . rawurlencode($signatureVersion) : '')
        : null;
    unset($sheet['signaturePath']); $sheet['client'] = $client;
    return $sheet;
}
function get_sheet(string $id): array { $stmt = db()->prepare(sheet_select() . ' WHERE s.id=? LIMIT 1'); $stmt->execute([uuid_bin($id)]); $row = $stmt->fetch(); if (!$row) fail('Fișa nu există.', 404); return map_sheet($row); }
function company_for_service_sheet(array $sheet): array {
    $company=is_array($sheet['companySnapshot']??null)?$sheet['companySnapshot']:null;
    $liveCompany=null;if(!empty($sheet['companyId'])){$stmt=db()->prepare(company_select().' WHERE id=? AND property_id=? AND is_active=1 LIMIT 1');$stmt->execute([uuid_bin((string)$sheet['companyId']),uuid_bin((string)$sheet['propertyId'])]);$row=$stmt->fetch();if($row)$liveCompany=map_company_details($row,true);}
    if(!$company&&$liveCompany)$company=$liveCompany;
    if(!$company){$default=company_details_record((string)$sheet['propertyId']);$company=!empty($default['id'])?company_details_by_id((string)$default['id'],(string)$sheet['propertyId'],true):$default;}
    if($liveCompany&&!empty($liveCompany['stampPath']))$company['stampPath']=$liveCompany['stampPath'];
    $company['propertyName']=(string)property_record((string)$sheet['propertyId'])['name'];return$company;
}

function service_document_definitions(): array {
    return [
        'INTAKE'=>['label'=>'Fișă de intrare','slug'=>'intake','prefix'=>'IN'],
        'FINAL_ESTIMATE'=>['label'=>'Deviz final','slug'=>'final-estimate','prefix'=>'DV'],
        'EXIT'=>['label'=>'Fișă de ieșire','slug'=>'exit','prefix'=>'OUT'],
    ];
}
function validated_service_document_type(mixed $value): string {
    $normalized=strtoupper(str_replace('-','_',trim((string)$value)));
    if(!array_key_exists($normalized,service_document_definitions()))fail('Tipul documentului nu este valid.',422);
    return$normalized;
}
function service_document_select(): string {
    return 'SELECT '.uuid_sql('d.id').' id,'.uuid_sql('d.service_sheet_id').' service_sheet_id,'.uuid_sql('d.client_id').' client_id,'.uuid_sql('d.property_id').' property_id,d.type,d.number,d.status,d.document_at,d.agreement_at,d.agreement_status,d.estimated_repair_days,d.product_state,d.defect_cause,d.final_notes,d.parts_json,d.labor_json,d.snapshot_json,d.signature_path,d.file_path,d.file_sha256,d.generated_at,d.is_active,d.created_at,d.updated_at,'.uuid_sql('d.created_by').' created_by,'.uuid_sql('d.updated_by').' updated_by FROM service_documents d';
}
function service_document_absolute_path(?string $relativePath): ?string {
    if(!$relativePath)return null;$root=realpath(__DIR__.'/storage/service-documents');$candidate=realpath(__DIR__.'/'.ltrim($relativePath,'/\\'));
    $rootPrefix=$root===false?null:rtrim($root,'/\\').DIRECTORY_SEPARATOR;
    if($rootPrefix===null||$candidate===false||!str_starts_with($candidate,$rootPrefix)||!is_file($candidate))return null;return$candidate;
}
function remove_obsolete_service_document_file(?string $oldRelativePath, ?string $keepRelativePath = null): void {
    if(!$oldRelativePath||$oldRelativePath===$keepRelativePath)return;$path=service_document_absolute_path($oldRelativePath);if($path===null)return;foreach([$path,$path.'.sha256']as$file)if(is_file($file))@unlink($file);
}
function service_document_client_token(string $clientId): ?string {
    $stmt=db()->prepare('SELECT '.uuid_sql('token').' token FROM client_qr WHERE client_id=? AND is_active=1 ORDER BY created_at DESC LIMIT 1');$stmt->execute([uuid_bin($clientId)]);$token=$stmt->fetchColumn();return$token?(string)$token:null;
}
function service_document_snapshot_amount(mixed $value, float $fallback = 0): float {
    if(!is_int($value)&&!is_float($value)&&!is_string($value))return round(max(0,$fallback),2);$normalized=is_string($value)?str_replace(',','.',trim($value)):$value;if($normalized===''||!is_numeric($normalized))return round(max(0,$fallback),2);$number=(float)$normalized;return is_finite($number)?round(max(0,$number),2):round(max(0,$fallback),2);
}
function service_document_estimated_costs_from_snapshot(array $snapshot): array {
    $financials=is_array($snapshot['financials']??null)?$snapshot['financials']:[];$summary=is_array($snapshot['summary']??null)?$snapshot['summary']:[];$sheet=is_array($snapshot['sheet']??null)?$snapshot['sheet']:[];
    $diagnostic=service_document_snapshot_amount($financials['diagnosticFee']??0);$parts=service_document_snapshot_amount(array_key_exists('displayedPartsCost',$financials)?$financials['displayedPartsCost']:($sheet['partsCost']??0));$labor=service_document_snapshot_amount(array_key_exists('displayedLaborCost',$financials)?$financials['displayedLaborCost']:($sheet['laborCost']??0));$advance=service_document_snapshot_amount($financials['advancePaid']??0);$discount=min(100,service_document_snapshot_amount($financials['discountPercent']??0));
    $workPrice=service_document_snapshot_amount($financials['workPrice']??($parts+$labor));$calculatedSubtotal=round($workPrice+$diagnostic,2);$subtotal=service_document_snapshot_amount($summary['subtotal']??$calculatedSubtotal,$calculatedSubtotal);$calculatedDiscount=round($subtotal*$discount/100,2);$discountAmount=service_document_snapshot_amount($summary['discountAmount']??$calculatedDiscount,$calculatedDiscount);$calculatedTotal=round(max(0,$subtotal-$discountAmount),2);$total=service_document_snapshot_amount($summary['totalDue']??($sheet['estimatedTotal']??($sheet['totalCost']??$calculatedTotal)),$calculatedTotal);$calculatedReceived=round(min($advance,$total),2);$received=service_document_snapshot_amount($summary['receivedAmount']??$calculatedReceived,$calculatedReceived);$received=min($received,$total);$remaining=service_document_snapshot_amount($summary['remainingDue']??max(0,$total-$received),max(0,$total-$received));
    $currency=strtoupper(trim((string)($financials['currencyCode']??$sheet['currencyCode']??'RON')));if(preg_match('/^[A-Z]{3}$/',$currency)!==1)$currency='RON';
    return['diagnosticFee'=>$diagnostic,'partsCost'=>$parts,'laborCost'=>$labor,'advancePaid'=>$advance,'discountPercent'=>$discount,'currencyCode'=>$currency,'subtotal'=>$subtotal,'discountAmount'=>$discountAmount,'totalDue'=>$total,'receivedAmount'=>$received,'remainingDue'=>$remaining];
}
function validated_service_document_estimated_costs(mixed $value, array $base): array {
    if(!is_array($value))fail('Costurile estimative nu sunt valide.',422);$currency=validated_currency($value['currencyCode']??$base['currencyCode']??'RON');$diagnostic=validated_amount($value['diagnosticFee']??$base['diagnosticFee']??0,'Costul diagnosticării');$parts=validated_amount($value['partsCost']??$base['partsCost']??0,'Costul estimativ al pieselor');$labor=validated_amount($value['laborCost']??$base['laborCost']??0,'Costul estimativ al manoperei');$advance=validated_amount($value['advancePaid']??$base['advancePaid']??0,'Avansul');$discount=validated_amount($value['discountPercent']??$base['discountPercent']??0,'Reducerea',100);
    $subtotal=round($diagnostic+$parts+$labor,2);$discountAmount=round($subtotal*$discount/100,2);$total=round(max(0,$subtotal-$discountAmount),2);$received=round(min($advance,$total),2);$remaining=round(max(0,$total-$received),2);foreach([$subtotal,$discountAmount,$total,$received,$remaining]as$amount)if(!is_finite($amount)||$amount>9999999999.99)fail('Totalurile estimative depășesc limita permisă.',422);
    return['diagnosticFee'=>$diagnostic,'partsCost'=>$parts,'laborCost'=>$labor,'advancePaid'=>$advance,'discountPercent'=>$discount,'currencyCode'=>$currency,'subtotal'=>$subtotal,'discountAmount'=>$discountAmount,'totalDue'=>$total,'receivedAmount'=>$received,'remainingDue'=>$remaining];
}
function map_service_document(array $row, ?string $publicToken = null, bool $public = false): array {
    $item=entity_base($row);$definition=service_document_definitions()[$item['type']];
    $item['documentAt']=iso_date($row['document_at']??null);$item['agreementAt']=iso_date($row['agreement_at']??null);$item['generatedAt']=iso_date($row['generated_at']??null);
    $item['estimatedRepairDays']=$item['estimatedRepairDays']!==null?(int)$item['estimatedRepairDays']:null;
    $item['parts']=json_decode((string)($row['parts_json']??'[]'),true)?:[];$item['labor']=json_decode((string)($row['labor_json']??'[]'),true)?:[];
    $item['label']=$definition['label'];$item['available']=$item['status']==='PUBLISHED'&&service_document_absolute_path($row['file_path']??null)!==null;
    $token=$publicToken??service_document_client_token((string)$item['clientId']);$item['url']=$item['available']&&$token?public_base_url().'/index.php/public/client-form/'.rawurlencode($token).'/documents/'.$definition['slug']:null;
    if($public){return['type'=>$item['type'],'label'=>$item['label'],'status'=>$item['status'],'available'=>$item['available'],'number'=>$item['number']??null,'documentAt'=>$item['documentAt']??null,'generatedAt'=>$item['generatedAt']??null,'url'=>$item['url']??null];}
    $snapshot=json_decode((string)($row['snapshot_json']??''),true);if($item['type']==='INTAKE'&&is_array($snapshot))$item['estimatedCosts']=service_document_estimated_costs_from_snapshot($snapshot);
    foreach(['snapshotJson','partsJson','laborJson','signaturePath','filePath','fileSha256','isActive']as$key)unset($item[$key]);
    return$item;
}
function service_document_record(string $sheetId, string $type, bool $required = true, ?string $publicToken = null): ?array {
    ensure_service_documents_table(db());$stmt=db()->prepare(service_document_select().' WHERE d.service_sheet_id=? AND d.type=? AND d.is_active=1 LIMIT 1');$stmt->execute([uuid_bin($sheetId),$type]);$row=$stmt->fetch();
    if(!$row){if($required)fail('Documentul nu a fost încă generat.',404);return null;}return map_service_document($row,$publicToken);
}
function service_document_slots(string $sheetId, ?string $publicToken = null, bool $public = false): array {
    ensure_service_documents_table(db());$stmt=db()->prepare(service_document_select().' WHERE d.service_sheet_id=? AND d.is_active=1');$stmt->execute([uuid_bin($sheetId)]);$found=[];foreach($stmt->fetchAll()as$row)$found[$row['type']]=map_service_document($row,$publicToken,$public);
    if($public)return array_values(array_filter($found,fn($document)=>!empty($document['available'])));
    $slots=[];foreach(service_document_definitions()as$type=>$definition){$missing=['type'=>$type,'label'=>$definition['label'],'status'=>'MISSING','available'=>false,'parts'=>[],'labor'=>[],'url'=>null];if(!$public)$missing['serviceSheetId']=$sheetId;$slots[]=$found[$type]??$missing;}return$slots;
}
function service_document_db_date(mixed $value, string $fallback): string {
    $raw=trim((string)($value??''));if($raw==='')return$fallback;$timestamp=strtotime($raw);if($timestamp===false)fail('Data documentului nu este validă.',422);return gmdate('Y-m-d H:i:s',$timestamp);
}
function service_document_optional_db_date(mixed $value): ?string {
    $raw=trim((string)($value??''));if($raw==='')return null;$timestamp=strtotime($raw);if($timestamp===false)fail('Data documentului nu este validă.',422);return gmdate('Y-m-d H:i:s',$timestamp);
}
function service_document_item_number(mixed $value, string $label, float $maximum, bool $positive = false): float {
    if(!is_int($value)&&!is_float($value)&&!is_string($value))fail($label.' nu este o valoare numerică validă.',422);$normalized=is_string($value)?str_replace(',','.',trim($value)):$value;if($normalized===''||!is_numeric($normalized))fail($label.' nu este o valoare numerică validă.',422);$number=(float)$normalized;if(!is_finite($number)||$number<0||($positive&&$number<=0)||$number>$maximum)fail($label.' este în afara limitelor permise.',422);return round($number,2);
}
function service_document_items(mixed $value, string $fallbackName, float $fallbackDisplayed = 0, float $fallbackDirect = 0): array {
    if($value===null){if($fallbackDisplayed<=0&&$fallbackDirect<=0&&trim($fallbackName)==='')return[];$name=trim($fallbackName)!==''?trim($fallbackName):'Poziție service';return[['name'=>$name,'quantity'=>1.0,'unitPrice'=>round(max(0,$fallbackDisplayed),2),'totalPrice'=>round(max(0,$fallbackDisplayed),2),'directCost'=>round(max(0,$fallbackDirect),2)]];}
    if(!is_array($value))fail('Lista de poziții nu este validă.',422);if(count($value)>60)fail('Un document poate conține maximum 60 de poziții per categorie.',422);$items=[];
    foreach($value as$position){if(!is_array($position))fail('O poziție a documentului nu este validă.',422);$name=preg_replace('/\s+/u',' ',trim((string)($position['name']??'')))??'';$quantityRaw=$position['quantity']??null;$unitRaw=$position['unitPrice']??null;$directRaw=$position['directCost']??null;$totalRaw=$position['totalPrice']??null;$quantity=$quantityRaw===null||$quantityRaw===''?1.0:service_document_item_number($quantityRaw,'Cantitatea',100000,true);$unit=$unitRaw===null||$unitRaw===''?0.0:service_document_item_number($unitRaw,'Prețul unitar',999999999.99);$direct=$directRaw===null||$directRaw===''?0.0:service_document_item_number($directRaw,'Costul intern',999999999.99);$providedTotal=$totalRaw===null||$totalRaw===''?0.0:service_document_item_number($totalRaw,'Totalul poziției',999999999.99);if($name===''&&$unit<=0&&$direct<=0&&$providedTotal<=0)continue;if($name==='')fail('Denumirea fiecărei poziții cu valori este obligatorie.',422);$length=function_exists('mb_strlen')?mb_strlen($name,'UTF-8'):strlen($name);if($length<1||$length>180)fail('Denumirea unei poziții trebuie să aibă maximum 180 de caractere.',422);$total=round($quantity*$unit,2);if(!is_finite($total)||$total>999999999.99)fail('Totalul unei poziții este în afara limitelor permise.',422);$items[]=['name'=>$name,'quantity'=>$quantity,'unitPrice'=>$unit,'totalPrice'=>$total,'directCost'=>$direct];}
    return$items;
}
function service_document_existing_row(string $sheetId, string $type): ?array {
    ensure_service_documents_table(db());$stmt=db()->prepare(service_document_select().' WHERE d.service_sheet_id=? AND d.type=? AND d.is_active=1 LIMIT 1');$stmt->execute([uuid_bin($sheetId),$type]);$row=$stmt->fetch();return$row?:null;
}
function service_document_signature_path(string $sheetId): ?string {
    $stmt=db()->prepare('SELECT signature_path FROM service_sheets WHERE id=? LIMIT 1');$stmt->execute([uuid_bin($sheetId)]);return$stmt->fetchColumn()?:null;
}
function service_document_reference(string $sheetId, string $type): ?array {
    $row=service_document_existing_row($sheetId,$type);return$row?['number'=>$row['number'],'date'=>iso_date($row['document_at'])]:null;
}
function require_service_document_write(bool $existing = false): array {
    $user=current_user();
    $canUpdate=in_array('service_sheets.update',$user['permissions'],true);$canCreate=in_array('service_sheets.create',$user['permissions'],true);
    if($user['role']!=='ADMIN'&&($existing?!$canUpdate:!$canUpdate&&!$canCreate))fail('Nu ai permisiunea necesară pentru generarea documentelor.',403);
    return$user;
}
function stream_service_document_row(array $row): void {
    $path=service_document_absolute_path($row['file_path']??null);if($path===null)fail('Documentul nu este disponibil.',404);
    $definition=service_document_definitions()[$row['type']]??['slug'=>'document'];$safeNumber=preg_replace('/[^A-Za-z0-9_-]+/','-',(string)($row['number']??''))?:$definition['slug'];
    header('Content-Type: application/pdf');header('Content-Disposition: inline; filename="'.strtolower($safeNumber).'.pdf"');header('Content-Length: '.filesize($path));header('Cache-Control: private, no-store, max-age=0');header('X-Content-Type-Options: nosniff');readfile($path);exit;
}
function public_service_document_row(string $token, string $rawType): array {
    if(preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',$token)!==1)fail('Documentul nu este disponibil.',404);
    $type=strtoupper(str_replace('-','_',trim($rawType)));if(!array_key_exists($type,service_document_definitions()))fail('Documentul nu este disponibil.',404);
    ensure_service_documents_table(db());$sql=service_document_select().' JOIN service_sheets s ON s.id=d.service_sheet_id AND s.client_id=d.client_id AND s.property_id=d.property_id AND s.is_active=1 JOIN client_qr q ON q.client_id=d.client_id AND q.property_id=d.property_id AND q.is_active=1 JOIN clients c ON c.id=d.client_id AND c.is_active=1 WHERE q.token=? AND d.type=? AND d.status=\'PUBLISHED\' AND d.is_active=1 ORDER BY s.updated_at DESC,d.generated_at DESC LIMIT 1';$stmt=db()->prepare($sql);$stmt->execute([uuid_bin($token),$type]);$row=$stmt->fetch();if(!$row)fail('Documentul nu este disponibil.',404);return$row;
}
function regenerate_existing_service_documents(string $sheetId, array $user): void {
    ensure_service_documents_table(db());$sheet=get_sheet($sheetId);ensure_property((string)$sheet['propertyId'],$user);$signaturePath=service_document_signature_path($sheetId);$company=company_for_service_sheet($sheet);$stmt=db()->prepare(service_document_select().' WHERE d.service_sheet_id=? AND d.is_active=1 ORDER BY FIELD(d.type,\'INTAKE\',\'FINAL_ESTIMATE\',\'EXIT\')');$stmt->execute([uuid_bin($sheetId)]);$rows=$stmt->fetchAll();if(!$rows)return;require_once __DIR__.'/src/service_document_pdf.php';
    foreach($rows as$row){$snapshot=json_decode((string)$row['snapshot_json'],true);if(!is_array($snapshot))throw new RuntimeException('Snapshotul documentului nu este valid.');$rendered=generate_service_document_pdf((string)$row['type'],['id'=>$row['id'],'number'=>$row['number'],'documentAt'=>iso_date($row['document_at']),'agreementAt'=>iso_date($row['agreement_at'])],$snapshot,$signaturePath,$company['stampPath']??null);$generatedAt=service_document_db_date($rendered['generatedAt']??null,now_utc());db()->prepare('UPDATE service_documents SET signature_path=?,file_path=?,file_sha256=?,generated_at=?,updated_at=?,updated_by=? WHERE id=?')->execute([$signaturePath,$rendered['filePath'],$rendered['sha256'],$generatedAt,now_utc(),uuid_bin($user['id']),uuid_bin((string)$row['id'])]);remove_obsolete_service_document_file($row['file_path']??null,$rendered['filePath']);}
}
function sync_final_document_financials(array $sheet, array $parts, array $labor, array $user): array {
    $client=get_client((string)$sheet['clientId']);$partsDisplayed=round(array_sum(array_column($parts,'totalPrice')),2);$laborDisplayed=round(array_sum(array_column($labor,'totalPrice')),2);$internalParts=round(array_sum(array_column($parts,'directCost')),2);$workPrice=round($partsDisplayed+$laborDisplayed,2);foreach([$partsDisplayed,$laborDisplayed,$internalParts,$workPrice]as$total)if(!is_finite($total)||$total>9999999999.99)fail('Totalurile devizului depășesc limita permisă.',422);$now=now_utc();$pdo=db();$ownsTransaction=!$pdo->inTransaction();if($ownsTransaction)$pdo->beginTransaction();
    try{$lock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$lock->execute([uuid_bin($client['id'])]);ensure_client_financial_shell($pdo,$client,$user,$now);$pdo->prepare('UPDATE client_financials SET work_price=?,displayed_parts_cost=?,displayed_labor_cost=?,actual_parts_cost=?,updated_at=?,updated_by=? WHERE client_id=?')->execute([$workPrice,$partsDisplayed,$laborDisplayed,$internalParts,$now,uuid_bin($user['id']),uuid_bin($client['id'])]);$financial=client_financial_record($client);$expenses=client_expenses((string)$client['id']);sync_service_sheet_financials_from_client($pdo,$client,$financial,$expenses,$user);sync_client_commission($pdo,$client,$financial,$expenses,$user,false);if($ownsTransaction)$pdo->commit();}catch(Throwable$e){if($ownsTransaction&&$pdo->inTransaction())$pdo->rollBack();throw$e;}
    return get_sheet((string)$sheet['id']);
}
function generate_service_document_record(string $sheetId, string $type, array $body, array $user): array {
    $type=validated_service_document_type($type);ensure_service_documents_table(db());$sheet=get_sheet($sheetId);ensure_property((string)$sheet['propertyId'],$user);$existing=service_document_existing_row($sheetId,$type);$existingSnapshot=$existing?json_decode((string)$existing['snapshot_json'],true):null;$now=now_utc();
    if($type!=='INTAKE'&&array_key_exists('estimatedCosts',$body))fail('Costurile estimative pot fi modificate numai în fișa de intrare.',422);if($type==='INTAKE'&&$existing&&!is_array($existingSnapshot))throw new RuntimeException('Snapshotul fișei de intrare nu este valid.');
    $client=get_client((string)$sheet['clientId']);$bundle=client_financial_bundle($client);$expenseTotal=round(array_sum(array_map(fn($expense)=>(float)$expense['amount'],$bundle['expenses'])),2);$fallbackActualParts=!empty($bundle['financials']['persisted'])?(float)$bundle['financials']['actualPartsCost']:max(0,(float)($sheet['directCosts']??0)-$expenseTotal);
    $fallbackPartsName=trim((string)($sheet['partsUsed']??''));$fallbackLaborName=trim((string)($sheet['workPerformed']??''));
    $parts=service_document_items(array_key_exists('parts',$body)?$body['parts']:($existingSnapshot['parts']??null),$fallbackPartsName,(float)($sheet['partsCost']??0),$fallbackActualParts);
    $labor=service_document_items(array_key_exists('labor',$body)?$body['labor']:($existingSnapshot['labor']??null),$fallbackLaborName,(float)($sheet['laborCost']??0),0);
    if($type==='FINAL_ESTIMATE'&&(array_key_exists('parts',$body)||array_key_exists('labor',$body)))$sheet=sync_final_document_financials($sheet,$parts,$labor,$user);
    $client=get_client((string)$sheet['clientId']);$bundle=client_financial_bundle($client);$company=company_for_service_sheet($sheet);$definition=service_document_definitions()[$type];$number=$existing['number']??($definition['prefix'].'-'.$sheet['number']);
    $defaultDocumentAt=$type==='INTAKE'?gmdate('Y-m-d H:i:s',strtotime((string)$sheet['receivedAt'])):($type==='EXIT'&&!empty($sheet['completedAt'])?gmdate('Y-m-d H:i:s',strtotime((string)$sheet['completedAt'])):$now);$documentAt=service_document_db_date($body['documentAt']??null,$existing['document_at']??$defaultDocumentAt);
    $defaultAgreement=$type==='INTAKE'&&!empty($sheet['signedAt'])?gmdate('Y-m-d H:i:s',strtotime((string)$sheet['signedAt'])):($type==='EXIT'?$documentAt:$now);$agreementAt=array_key_exists('agreementAt',$body)?service_document_optional_db_date($body['agreementAt']):service_document_db_date($existing['agreement_at']??null,$defaultAgreement);
    $agreementStatus=strtoupper((string)($body['agreementStatus']??$existing['agreement_status']??(!empty($sheet['repairRefused'])?'REFUSED':'ACCEPTED')));if(!in_array($agreementStatus,['ACCEPTED','REFUSED'],true))fail('Starea acordului nu este validă.',422);
    $estimatedDaysProvided=array_key_exists('estimatedRepairDays',$body);$estimatedDays=(int)($body['estimatedRepairDays']??$existing['estimated_repair_days']??0);if($estimatedDays<0||$estimatedDays>730)fail('Termenul estimat trebuie să fie între 0 și 730 de zile.',422);if(!$estimatedDaysProvided&&$estimatedDays===0&&!empty($sheet['estimatedAt']))$estimatedDays=max(1,(int)ceil((strtotime((string)$sheet['estimatedAt'])-strtotime((string)$sheet['receivedAt']))/86400));
    $productState=strtoupper((string)($body['productState']??$existing['product_state']??(!empty($sheet['workPerformed'])?'REPAIRED':'INITIAL')));if(!in_array($productState,['REPAIRED','INITIAL'],true))fail('Starea produsului nu este validă.',422);
    $defectCause=company_detail_text($body['defectCause']??$existing['defect_cause']??null,'Cauza defectului',40);$finalNotes=company_detail_text($body['finalNotes']??$existing['final_notes']??null,'Observațiile finale',2000);
    $intake=service_document_reference($sheetId,'INTAKE');$estimate=service_document_reference($sheetId,'FINAL_ESTIMATE');$signaturePath=service_document_signature_path($sheetId);
    $snapshotSheet=array_merge($sheet,['estimatedRepairDays'=>$estimatedDays,'estimatedTotal'=>$bundle['summary']['totalDue'],'finalNotes'=>$finalNotes,'defectCause'=>$defectCause,'finalAgreementAt'=>iso_date($agreementAt),'deliveredAt'=>$type==='EXIT'?iso_date($documentAt):($sheet['completedAt']??null)]);$snapshotFinancials=$bundle['financials'];$snapshotSummary=$bundle['summary'];$snapshotEstimate=$estimate??['number'=>$type==='FINAL_ESTIMATE'?$number:'','date'=>$type==='FINAL_ESTIMATE'?iso_date($documentAt):'','total'=>$bundle['summary']['totalDue'],'remaining'=>$bundle['summary']['remainingDue']];
    if($type==='INTAKE'&&is_array($existingSnapshot)){
        if(is_array($existingSnapshot['financials']??null))$snapshotFinancials=$existingSnapshot['financials'];if(is_array($existingSnapshot['summary']??null))$snapshotSummary=$existingSnapshot['summary'];if(is_array($existingSnapshot['estimate']??null))$snapshotEstimate=$existingSnapshot['estimate'];$frozenSheet=is_array($existingSnapshot['sheet']??null)?$existingSnapshot['sheet']:[];foreach(['partsCost','laborCost','totalCost','estimatedTotal','currencyCode']as$key)if(array_key_exists($key,$frozenSheet))$snapshotSheet[$key]=$frozenSheet[$key];
    }
    if($type==='INTAKE'&&array_key_exists('estimatedCosts',$body)){
        $baseCosts=service_document_estimated_costs_from_snapshot(['financials'=>$snapshotFinancials,'summary'=>$snapshotSummary,'sheet'=>$snapshotSheet]);$costs=validated_service_document_estimated_costs($body['estimatedCosts'],$baseCosts);$workPrice=round($costs['partsCost']+$costs['laborCost'],2);$snapshotFinancials=array_merge($snapshotFinancials,['currencyCode'=>$costs['currencyCode'],'workPrice'=>$workPrice,'diagnosticFee'=>$costs['diagnosticFee'],'advancePaid'=>$costs['advancePaid'],'discountPercent'=>$costs['discountPercent'],'displayedPartsCost'=>$costs['partsCost'],'displayedLaborCost'=>$costs['laborCost'],'paymentStatus'=>$costs['totalDue']>0&&$costs['receivedAmount']>=$costs['totalDue']?'PAID':'UNPAID']);$snapshotSummary=array_merge($snapshotSummary,['subtotal'=>$costs['subtotal'],'discountAmount'=>$costs['discountAmount'],'totalDue'=>$costs['totalDue'],'receivedAmount'=>$costs['receivedAmount'],'remainingDue'=>$costs['remainingDue']]);$snapshotSheet=array_merge($snapshotSheet,['partsCost'=>$costs['partsCost'],'laborCost'=>$costs['laborCost'],'totalCost'=>$costs['totalDue'],'estimatedTotal'=>$costs['totalDue'],'currencyCode'=>$costs['currencyCode']]);$snapshotEstimate=array_merge($snapshotEstimate,['total'=>$costs['totalDue'],'remaining'=>$costs['remainingDue']]);
    }
    $snapshot=['company'=>$company,'client'=>$client,'sheet'=>$snapshotSheet,'intake'=>$intake??['number'=>$type==='INTAKE'?$number:$sheet['number'],'date'=>$type==='INTAKE'?iso_date($documentAt):$sheet['receivedAt']],'estimate'=>$snapshotEstimate,'parts'=>$parts,'labor'=>$labor,'financials'=>$snapshotFinancials,'summary'=>$snapshotSummary,'agreement'=>['status'=>$agreementStatus,'date'=>iso_date($agreementAt)],'exit'=>['number'=>$type==='EXIT'?$number:'','date'=>$type==='EXIT'?iso_date($documentAt):'','productState'=>$productState]];
    $id=$existing['id']??uuid_v4();$encoded=json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);$partsJson=json_encode($parts,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);$laborJson=json_encode($labor,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    require_once __DIR__.'/src/service_document_pdf.php';$rendered=generate_service_document_pdf($type,['id'=>$id,'number'=>$number,'documentAt'=>iso_date($documentAt),'agreementAt'=>iso_date($agreementAt)],$snapshot,$signaturePath,$company['stampPath']??null);
    $generatedAt=service_document_db_date($rendered['generatedAt']??null,$now);$columns=['id','service_sheet_id','client_id','property_id','type','number','status','document_at','agreement_at','agreement_status','estimated_repair_days','product_state','defect_cause','final_notes','parts_json','labor_json','snapshot_json','signature_path','file_path','file_sha256','generated_at','is_active','created_at','updated_at','created_by','updated_by'];
    $args=[uuid_bin($id),uuid_bin($sheetId),uuid_bin((string)$sheet['clientId']),uuid_bin((string)$sheet['propertyId']),$type,$number,'PUBLISHED',$documentAt,$agreementAt,$agreementStatus,$estimatedDays,$productState,$defectCause,$finalNotes,$partsJson,$laborJson,$encoded,$signaturePath,$rendered['filePath'],$rendered['sha256'],$generatedAt,1,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])];
    $pdo=db();$pdo->beginTransaction();try{$pdo->prepare('INSERT INTO service_documents ('.implode(',',$columns).') VALUES ('.implode(',',array_fill(0,count($args),'?')).") ON DUPLICATE KEY UPDATE number=VALUES(number),status='PUBLISHED',document_at=VALUES(document_at),agreement_at=VALUES(agreement_at),agreement_status=VALUES(agreement_status),estimated_repair_days=VALUES(estimated_repair_days),product_state=VALUES(product_state),defect_cause=VALUES(defect_cause),final_notes=VALUES(final_notes),parts_json=VALUES(parts_json),labor_json=VALUES(labor_json),snapshot_json=VALUES(snapshot_json),signature_path=VALUES(signature_path),file_path=VALUES(file_path),file_sha256=VALUES(file_sha256),generated_at=VALUES(generated_at),is_active=1,updated_at=VALUES(updated_at),updated_by=VALUES(updated_by)")->execute($args);$pdo->commit();}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}remove_obsolete_service_document_file($existing['file_path']??null,$rendered['filePath']);return service_document_record($sheetId,$type,true);
}

function gshop_regenerate_service_sheet_pdf(string $sheetId): array {
    $sheet=get_sheet($sheetId);if(empty($sheet['isActive']))throw new RuntimeException('Fișa de service nu mai este activă.');
    $client=get_client($sheet['clientId']);$bundle=client_financial_bundle($client);$company=company_for_service_sheet($sheet);
    $pathStmt=db()->prepare('SELECT signature_path FROM service_sheets WHERE id=? LIMIT 1');$pathStmt->execute([uuid_bin($sheet['id'])]);$signaturePath=$pathStmt->fetchColumn()?:null;
    $stampPath=$company['stampPath']??null;
    require_once __DIR__.'/src/service_sheet_pdf.php';
    return generate_service_sheet_pdf($sheet,$client,$bundle['financials'],$bundle['summary'],$company,$signaturePath,$stampPath);
}
function gshop_queue_service_sheet_pdf(string $sheetId): void { /* PDF-urile legacy publice sunt dezactivate; documentele noi sunt servite doar prin rute protejate. */ }
function gshop_queue_client_service_sheet_pdf(string $clientId): void {
    $stmt=db()->prepare('SELECT '.uuid_sql('id').' id FROM service_sheets WHERE client_id=? AND is_active=1');$stmt->execute([uuid_bin($clientId)]);
    foreach($stmt->fetchAll()as$row)gshop_queue_service_sheet_pdf((string)$row['id']);
}
function gshop_queue_property_service_sheet_pdfs(string $propertyId): void {
    $stmt=db()->prepare('SELECT '.uuid_sql('id').' id FROM service_sheets WHERE property_id=? AND is_active=1');$stmt->execute([uuid_bin($propertyId)]);
    foreach($stmt->fetchAll()as$row)gshop_queue_service_sheet_pdf((string)$row['id']);
}
function gshop_flush_pending_service_sheet_pdfs(): void {
    $pending=array_keys($GLOBALS['gshop_pending_service_sheet_pdfs']??[]);if(!$pending||db()->inTransaction())return;$GLOBALS['gshop_pending_service_sheet_pdfs']=[];
    foreach($pending as$sheetId){
        try{gshop_regenerate_service_sheet_pdf((string)$sheetId);}
        catch(Throwable $error){error_log('[G-Shop PDF sync] '.$sheetId.': '.$error->getMessage());}
    }
}

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
function client_collaborator_assignments(string $clientId): array {
    $sql = 'SELECT ' . uuid_sql('cc.collaborator_id') . ' collaborator_id,c.name,c.role,cc.commission_type,cc.commission_value,cc.sort_order FROM client_collaborators cc JOIN collaborators c ON c.id=cc.collaborator_id WHERE cc.client_id=? ORDER BY cc.sort_order,c.name';
    $stmt = db()->prepare($sql);
    $stmt->execute([uuid_bin($clientId)]);
    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $item = entity_base($row);
        $item['commissionValue'] = (float)$item['commissionValue'];
        $item['sortOrder'] = (int)$item['sortOrder'];
        $item['role'] = $item['role'] ?: null;
        $items[] = $item;
    }
    return $items;
}
function validated_client_collaborators(mixed $value, string $propertyId): array {
    if (!is_array($value) || count($value) > 30) fail('Lista colaboratorilor este invalidă.',422);
    $items = [];
    $seen = [];
    foreach (array_values($value) as $index => $raw) {
        if (!is_array($raw)) fail('Atribuirea colaboratorului este invalidă.',422);
        $collaboratorId = validated_uuid($raw['collaboratorId'] ?? null,'Colaboratorul');
        if (isset($seen[$collaboratorId])) fail('Același colaborator nu poate fi atribuit de două ori.',422);
        $seen[$collaboratorId] = true;
        $collaborator = collaborator_for_property($collaboratorId,$propertyId);
        $type = (string)($raw['commissionType'] ?? $collaborator['defaultCommissionType']);
        $amount = validate_commission_settings($type,$raw['commissionValue'] ?? $collaborator['defaultCommissionValue']);
        $items[] = ['collaboratorId'=>$collaboratorId,'name'=>$collaborator['name'],'role'=>$collaborator['role']??null,'commissionType'=>$type,'commissionValue'=>$amount,'sortOrder'=>$index+1];
    }
    return $items;
}
function collaborator_assignment_snapshot(array $assignments): array {
    return array_map(fn($item)=>['collaboratorId'=>$item['collaboratorId'],'commissionType'=>$item['commissionType'],'commissionValue'=>(float)$item['commissionValue'],'sortOrder'=>(int)$item['sortOrder']],$assignments);
}
function replace_client_collaborators(PDO $pdo, string $clientId, array $assignments, array $user, string $now): void {
    $pdo->prepare('DELETE FROM client_collaborators WHERE client_id=?')->execute([uuid_bin($clientId)]);
    if (!$assignments) return;
    $insert = $pdo->prepare('INSERT INTO client_collaborators (client_id,collaborator_id,commission_type,commission_value,sort_order,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?)');
    foreach ($assignments as $item) $insert->execute([uuid_bin($clientId),uuid_bin($item['collaboratorId']),$item['commissionType'],$item['commissionValue'],$item['sortOrder'],$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
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
    $assignments = $client['collaborators'] ?? [];
    if (!$assignments && !empty($client['collaboratorId'])) $assignments = [['commissionType'=>$client['commissionType']??null,'commissionValue'=>$client['commissionValue']??0]];
    $collaboratorCost = 0.0;
    foreach ($assignments as $assignment) $collaboratorCost += commission_amount($totalDue,max(0,$totalDue-$internalCosts),(string)($assignment['commissionType']??''),(float)($assignment['commissionValue']??0));
    $collaboratorCost = round($collaboratorCost,2);
    return [
        'subtotal'=>$subtotal,'discountAmount'=>$discountAmount,'totalDue'=>$totalDue,'receivedAmount'=>$receivedAmount,'remainingDue'=>$remainingDue,
        'additionalExpenses'=>$additionalExpenses,'internalCosts'=>$internalCosts,'collaboratorCost'=>$collaboratorCost,
        'gshopNet'=>round($receivedAmount-$internalCosts,2),
    ];
}
function sync_service_sheet_financials_from_client(PDO $pdo, array $client, array $financial, array $expenses, array $user): bool {
    $summary=financial_summary($client,$financial,$expenses);
    $collaborators=client_collaborator_finances($client,$financial,$summary);
    $collaboratorPaid=round(array_sum(array_column($collaborators,'paid')),2);
    $parts=round(max(0,(float)$financial['displayedPartsCost']),2);
    $labor=round(max(0,(float)$financial['displayedLaborCost']),2);
    $total=round((float)$summary['totalDue'],2);
    $direct=round(max(0,(float)$summary['internalCosts']),2);
    $net=round((float)$summary['receivedAmount']-$direct-$collaboratorPaid,2);
    $now=now_utc();
    $stmt=$pdo->prepare('UPDATE service_sheets SET parts_cost=?,labor_cost=?,total_cost=?,direct_costs=?,net_value=?,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1 AND NOT (parts_cost <=> ? AND labor_cost <=> ? AND total_cost <=> ? AND direct_costs <=> ? AND net_value <=> ?)');
    $stmt->execute([$parts,$labor,$total,$direct,$net,$now,uuid_bin($user['id']),uuid_bin($client['id']),$parts,$labor,$total,$direct,$net]);
    $changed=$stmt->rowCount()>0;if($changed)gshop_queue_client_service_sheet_pdf((string)$client['id']);return $changed;
}
function sync_client_financials_from_service_sheet(PDO $pdo, array $client, array $sheet, array $user): array {
    $before=client_financial_record($client);
    $expenses=client_expenses($client['id']);
    $additionalExpenses=round(array_sum(array_map(fn($expense)=>(float)$expense['amount'],$expenses)),2);
    $parts=round(max(0,(float)$sheet['partsCost']),2);
    $labor=round(max(0,(float)$sheet['laborCost']),2);
    $actualParts=round(max(0,(float)$sheet['directCosts']-$additionalExpenses),2);
    $changed=abs((float)$before['displayedPartsCost']-$parts)>0.00001||abs((float)$before['displayedLaborCost']-$labor)>0.00001||abs((float)$before['actualPartsCost']-$actualParts)>0.00001;
    if($changed){
        $now=now_utc();ensure_client_financial_shell($pdo,$client,$user,$now);
        $stmt=$pdo->prepare('UPDATE client_financials SET displayed_parts_cost=?,displayed_labor_cost=?,actual_parts_cost=?,updated_at=?,updated_by=? WHERE client_id=?');
        $stmt->execute([$parts,$labor,$actualParts,$now,uuid_bin($user['id']),uuid_bin($client['id'])]);
    }
    $after=client_financial_record($client);
    sync_service_sheet_financials_from_client($pdo,$client,$after,$expenses,$user);
    return ['changed'=>$changed,'before'=>$before,'after'=>$after,'expenses'=>$expenses];
}
function client_collaborator_finance_for_assignment(array $client, array $financial, array $summary, array $assignment): ?array {
    $collaboratorId = (string)($assignment['collaboratorId'] ?? '');
    if ($collaboratorId === '') return null;
    $name = (string)($assignment['name'] ?? '');
    $role = $assignment['role'] ?? null;
    if ($name === '') {
        $collaboratorStmt = db()->prepare('SELECT name,role FROM collaborators WHERE id=? LIMIT 1');
        $collaboratorStmt->execute([uuid_bin($collaboratorId)]);
        $collaborator = $collaboratorStmt->fetch();
        if (!$collaborator) return null;
        $name = (string)$collaborator['name'];
        $role = $collaborator['role'] ?: null;
    }
    $totalsStmt = db()->prepare("SELECT COUNT(*) active_count,COALESCE(SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN commission_value ELSE 0 END),0) paid,COALESCE(SUM(CASE WHEN status IN ('ESTIMATED','CALCULATED','APPROVED') OR (status='PAID' AND paid_at IS NULL) THEN commission_value ELSE 0 END),0) due,COALESCE(SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN 1 ELSE 0 END),0) paid_count FROM commissions WHERE client_id=? AND collaborator_id=? AND is_active=1 AND status<>'CANCELLED'");
    $totalsStmt->execute([uuid_bin($client['id']),uuid_bin($collaboratorId)]);
    $totals = $totalsStmt->fetch();
    $count = (int)($totals['active_count'] ?? 0);
    $paid = round((float)($totals['paid'] ?? 0),2);
    $due = round((float)($totals['due'] ?? 0),2);
    $hasCommission = $count > 0;
    $paidCount=(int)($totals['paid_count']??0);
    $projected=commission_amount((float)$summary['totalDue'],max(0,(float)$summary['totalDue']-(float)$summary['internalCosts']),(string)$assignment['commissionType'],(float)$assignment['commissionValue']);
    if (!$hasCommission) $due=!empty($financial['persisted'])?$projected:0.0;
    elseif($paidCount===0&&(!empty($financial['persisted'])||$assignment['commissionType']==='FIXED'))$due=$projected;
    return [
        'id'=>$collaboratorId,
        'name'=>$name,
        'role'=>$role,
        'commissionType'=>$assignment['commissionType']??null,
        'commissionValue'=>isset($assignment['commissionValue'])?(float)$assignment['commissionValue']:null,
        'amount'=>round($paid+$due,2),
        'paid'=>$paid,
        'due'=>$due,
        'status'=>$hasCommission && $paidCount===$count?'PAID':'UNPAID',
        'hasCommission'=>$hasCommission,
    ];
}
function client_collaborator_finances(array $client, array $financial, array $summary): array {
    $assignments = $client['collaborators'] ?? [];
    if (!$assignments && !empty($client['collaboratorId'])) $assignments = [['collaboratorId'=>$client['collaboratorId'],'commissionType'=>$client['commissionType'],'commissionValue'=>$client['commissionValue'],'name'=>'','role'=>null,'sortOrder'=>1]];
    $items = [];
    foreach ($assignments as $assignment) {
        $item = client_collaborator_finance_for_assignment($client,$financial,$summary,$assignment);
        if ($item !== null) $items[] = $item;
    }
    return $items;
}
function client_collaborator_finance(array $client, array $financial, array $summary): ?array {
    return client_collaborator_finances($client,$financial,$summary)[0] ?? null;
}
function sync_client_commission(PDO $pdo, array $client, array $financial, array $expenses, array $user, bool $recreate): array {
    $sheetStmt = $pdo->prepare('SELECT ' . uuid_sql('id') . ' id FROM service_sheets WHERE client_id=? AND is_active=1 ORDER BY updated_at DESC,created_at DESC LIMIT 1 FOR UPDATE');
    $sheetStmt->execute([uuid_bin($client['id'])]);
    $serviceSheetId = $sheetStmt->fetchColumn() ?: null;
    $commissionStmt = $pdo->prepare('SELECT ' . uuid_sql('id') . ' id,' . uuid_sql('collaborator_id') . " collaborator_id,status,paid_at,total_value,direct_costs,net_value,type,rate_or_amount,commission_value FROM commissions WHERE client_id=? AND is_active=1 AND status<>'CANCELLED' ORDER BY created_at FOR UPDATE");
    $commissionStmt->execute([uuid_bin($client['id'])]);
    $existing = $commissionStmt->fetchAll();
    $assignments = $client['collaborators'] ?? [];
    if (!$assignments && !empty($client['collaboratorId'])) $assignments = [['collaboratorId'=>$client['collaboratorId'],'commissionType'=>$client['commissionType'],'commissionValue'=>$client['commissionValue']]];
    if ($serviceSheetId===null || !$assignments) {
        $cancellable = array_values(array_filter($existing,fn($row)=>!($row['status']==='PAID'&&!empty($row['paid_at']))));
        $changed = (bool)$cancellable;
        if ($cancellable) $pdo->prepare("UPDATE commissions SET status='CANCELLED',is_active=0,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1 AND status<>'CANCELLED' AND NOT (status='PAID' AND paid_at IS NOT NULL)")->execute([now_utc(),uuid_bin($user['id']),uuid_bin($client['id'])]);
        $sheetUpdate=$pdo->prepare('UPDATE service_sheets SET collaborator_id=NULL,collaborator_commission=NULL,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1 AND (collaborator_id IS NOT NULL OR collaborator_commission IS NOT NULL)');
        $sheetUpdate->execute([now_utc(),uuid_bin($user['id']),uuid_bin($client['id'])]);
        return ['changed'=>$changed||$sheetUpdate->rowCount()>0,'paid'=>count($existing)>count($cancellable)];
    }

    $summary = financial_summary($client,$financial,$expenses);
    $totalValue = round((float)$summary['totalDue'],2);
    $directCosts = round((float)$summary['internalCosts'],2);
    $netValue = round(max(0,$totalValue-$directCosts),2);
    $now = now_utc();
    $changed = false;
    $totalAmount = 0.0;
    $assignmentIds = array_column($assignments,'collaboratorId');
    $cancel = $pdo->prepare("UPDATE commissions SET status='CANCELLED',is_active=0,updated_at=?,updated_by=? WHERE id=? AND NOT (status='PAID' AND paid_at IS NOT NULL)");
    $update=$pdo->prepare("UPDATE commissions SET service_sheet_id=?,total_value=?,direct_costs=?,net_value=?,type=?,rate_or_amount=?,commission_value=?,status='APPROVED',paid_at=NULL,updated_at=?,updated_by=? WHERE id=?");
    $insert=$pdo->prepare("INSERT INTO commissions (id,collaborator_id,client_id,service_sheet_id,property_id,total_value,direct_costs,net_value,type,rate_or_amount,commission_value,status,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,'APPROVED',1,?,?,?,?)");
    foreach ($assignments as $assignment) {
        $collaboratorId=(string)$assignment['collaboratorId'];$type=(string)$assignment['commissionType'];$rateOrAmount=(float)$assignment['commissionValue'];$amount=commission_amount($totalValue,$netValue,$type,$rateOrAmount);$totalAmount+=$amount;
        $matches=array_values(array_filter($existing,fn($row)=>$row['collaborator_id']===$collaboratorId));
        $paid=array_values(array_filter($matches,fn($row)=>$row['status']==='PAID'&&!empty($row['paid_at'])));
        if($paid)continue;
        $single=count($matches)===1?$matches[0]:null;$canUpdate=!$recreate&&$single!==null;
        if($canUpdate){
            $different=(float)$single['total_value']!==$totalValue||(float)$single['direct_costs']!==$directCosts||(float)$single['net_value']!==$netValue||$single['type']!==$type||(float)$single['rate_or_amount']!==$rateOrAmount||(float)$single['commission_value']!==$amount;
            if($different){$update->execute([uuid_bin($serviceSheetId),$totalValue,$directCosts,$netValue,$type,$rateOrAmount,$amount,$now,uuid_bin($user['id']),uuid_bin($single['id'])]);$changed=true;}
        }else{
            foreach($matches as$match){$cancel->execute([$now,uuid_bin($user['id']),uuid_bin($match['id'])]);if($cancel->rowCount()>0)$changed=true;}
            $insert->execute([uuid_bin(uuid_v4()),uuid_bin($collaboratorId),uuid_bin($client['id']),uuid_bin($serviceSheetId),uuid_bin($client['propertyId']),$totalValue,$directCosts,$netValue,$type,$rateOrAmount,$amount,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);$changed=true;
        }
    }
    foreach($existing as$row)if(!in_array($row['collaborator_id'],$assignmentIds,true)&&!($row['status']==='PAID'&&!empty($row['paid_at']))){$cancel->execute([$now,uuid_bin($user['id']),uuid_bin($row['id'])]);if($cancel->rowCount()>0)$changed=true;}
    $primaryId=(string)$assignments[0]['collaboratorId'];$totalAmount=round($totalAmount,2);
    $sheetUpdate=$pdo->prepare('UPDATE service_sheets SET collaborator_id=?,collaborator_commission=?,updated_at=?,updated_by=? WHERE client_id=? AND is_active=1 AND NOT (collaborator_id <=> ? AND collaborator_commission <=> ?)');
    $sheetUpdate->execute([uuid_bin($primaryId),$totalAmount,$now,uuid_bin($user['id']),uuid_bin($client['id']),uuid_bin($primaryId),$totalAmount]);
    return ['changed'=>$changed||$sheetUpdate->rowCount()>0,'paid'=>false,'amount'=>$totalAmount];
}
function client_financial_bundle(array $client): array {
    $financial = client_financial_record($client); $expenses = client_expenses($client['id']);
    $summary=financial_summary($client,$financial,$expenses);
    $collaborators=client_collaborator_finances($client,$financial,$summary);$collaborator=$collaborators[0]??null;
    if($collaborators){$summary['collaboratorCost']=round(array_sum(array_column($collaborators,'amount')),2);$paid=round(array_sum(array_column($collaborators,'paid')),2);$summary['gshopNet']=round((float)$summary['receivedAmount']-(float)$summary['internalCosts']-$paid,2);}
    return ['financials'=>$financial,'summary'=>$summary,'expenses'=>$expenses,'collaborator'=>$collaborator,'collaborators'=>$collaborators];
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
    if ($method === 'GET' && $path === '/app-update') {
        $notes = array_values(array_filter(array_map('trim', explode('|', env_value('APP_ANDROID_RELEASE_NOTES', 'Prima versiune stabilă G-Shop')))));
        respond(['platform'=>'android','latestVersion'=>env_value('APP_ANDROID_VERSION','1.0.0'),'downloadUrl'=>env_value('APP_ANDROID_DOWNLOAD_URL',''),'releaseNotes'=>$notes,'publishedAt'=>env_value('APP_ANDROID_PUBLISHED_AT',''),'mandatory'=>env_value('APP_ANDROID_MANDATORY','0')==='1']);
    }

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
    if ($method === 'POST' && $path === '/admin/migrations/client-collaborators') {
        $user = require_permission('settings.manage');
        $changes = migrate_client_collaborators(db());
        if ($changes) audit_log('SCHEMA_MIGRATION_APPLIED','settings','Migrare aplicată pentru colaboratorii multipli ai clienților','Database',null,null,null,['migration'=>'client-collaborators-v1','changes'=>$changes],$user);
        respond(['migration'=>'client-collaborators-v1','applied'=>(bool)$changes,'changes'=>$changes,'ready'=>true]);
    }
    if ($method === 'POST' && $path === '/admin/migrations/client-finance') {
        $user = require_permission('settings.manage');
        $changes = migrate_client_finance(db());
        if ($changes) audit_log('SCHEMA_MIGRATION_APPLIED','settings','Migrare aplicată pentru finanțele clienților','Database',null,null,null,['migration'=>'client-finance-v1','changes'=>$changes],$user);
        respond(['migration'=>'client-finance-v1','applied'=>(bool)$changes,'changes'=>$changes,'ready'=>true]);
    }
    if ($method === 'POST' && $path === '/admin/migrations/whatsapp-messages') {
        $user = require_permission('settings.manage');
        $changes = migrate_whatsapp_messages(db());
        if ($changes) audit_log('SCHEMA_MIGRATION_APPLIED','settings','Migrare aplicată pentru mesajele predefinite WhatsApp','Database',null,null,null,['migration'=>'whatsapp-messages-v1','changes'=>$changes],$user);
        respond(['migration'=>'whatsapp-messages-v1','applied'=>(bool)$changes,'changes'=>$changes,'ready'=>true]);
    }
    if ($method === 'POST' && $path === '/admin/migrations/service-sheet-documents') {
        $user = require_permission('settings.manage');
        $changes = migrate_service_sheet_documents(db());
        if ($changes) audit_log('SCHEMA_MIGRATION_APPLIED','settings','Migrare aplicată pentru documentele fișelor de service','Database',null,null,null,['migration'=>'service-sheet-documents-v1','changes'=>$changes],$user);
        respond(['migration'=>'service-sheet-documents-v1','applied'=>(bool)$changes,'changes'=>$changes,'ready'=>true]);
    }

    if ($method === 'GET' && $path === '/properties') {
        $user = current_user(); $sql = 'SELECT ' . uuid_sql('p.id') . ' id,p.name,p.domain,p.type,p.enabled_modules,p.is_active,p.created_at,p.updated_at,' . uuid_sql('p.created_by') . ' created_by,' . uuid_sql('p.updated_by') . ' updated_by FROM properties p';
        $args=[]; if ($user['role'] !== 'ADMIN') { $sql .= ' JOIN user_properties up ON up.property_id=p.id WHERE up.user_id=?'; $args[] = uuid_bin($user['id']); } else $sql .= ' WHERE 1=1';
        $sql .= ' AND p.is_active=1 ORDER BY p.type,p.name'; $stmt=db()->prepare($sql);$stmt->execute($args);$rows=[];foreach($stmt->fetchAll() as $row){$item=entity_base($row);$item['enabledModules']=json_decode((string)$row['enabled_modules'],true)?:[];unset($item['enabledModules'][0]);$item['enabledModules']=json_decode((string)$row['enabled_modules'],true)?:[];$rows[]=$item;}respond($rows);
    }
    if ($method === 'PUT' && path_match('/properties/{id}',$path,$params)) {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate modifica numele proprietății.',403);
        $propertyId=validated_uuid($params['id'],'Proprietatea');ensure_property($propertyId,$user);$before=property_record($propertyId);$body=json_body();
        $name=validated_whatsapp_message_text($body['name']??null,'Numele proprietății',2,120);
        if($name===$before['name'])respond($before);
        db()->prepare('UPDATE properties SET name=?,updated_at=?,updated_by=? WHERE id=?')->execute([$name,now_utc(),uuid_bin($user['id']),uuid_bin($propertyId)]);
        $after=property_record($propertyId);audit_log('PROPERTY_NAME_UPDATED','settings','Numele proprietății a fost actualizat','Property',$propertyId,$propertyId,['name'=>$before['name']],['name'=>$after['name']],$user);gshop_queue_property_service_sheet_pdfs($propertyId);respond($after);
    }

    if ($method === 'GET' && $path === '/companies') {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate vedea firmele.',403);$propertyId=validated_uuid((string)($_GET['propertyId']??''),'Proprietatea');ensure_property($propertyId,$user);property_record($propertyId);respond(company_details_list($propertyId));
    }
    if ($method === 'POST' && $path === '/companies') {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate adăuga firme.',403);$body=json_body();$propertyId=validated_uuid((string)($body['propertyId']??''),'Proprietatea');ensure_property($propertyId,$user);property_record($propertyId);ensure_property_companies_table(db());$values=validated_company_payload($body);$id=uuid_v4();$now=now_utc();$pdo=db();$count=$pdo->prepare('SELECT COUNT(*) FROM property_companies WHERE property_id=? AND is_active=1');$count->execute([uuid_bin($propertyId)]);$isDefault=(int)$count->fetchColumn()===0||!empty($body['isDefault']);
        $columns=['id','property_id','is_default','legal_name','tax_id','trade_register_number','vat_payer','address','city','county','postal_code','country','phone','email','website','bank_name','iban','representative_name','representative_role','is_active','created_at','updated_at','created_by','updated_by'];$args=[uuid_bin($id),uuid_bin($propertyId),$isDefault?1:0,...$values,1,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])];$pdo->beginTransaction();try{if($isDefault)$pdo->prepare('UPDATE property_companies SET is_default=0 WHERE property_id=?')->execute([uuid_bin($propertyId)]);$pdo->prepare('INSERT INTO property_companies ('.implode(',',$columns).') VALUES ('.implode(',',array_fill(0,count($args),'?')).')')->execute($args);$pdo->commit();}catch(Throwable$error){if($pdo->inTransaction())$pdo->rollBack();throw$error;}
        $after=company_details_by_id($id,$propertyId);audit_log('COMPANY_CREATED','settings','Firmă adăugată: '.$after['legalName'],'Company',$id,$propertyId,null,company_details_snapshot($after),$user);respond($after,201);
    }
    if ($method === 'PUT' && path_match('/companies/{id}/default',$path,$params)) {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate selecta firma activă.',403);$id=validated_uuid($params['id'],'Firma');$before=company_details_by_id($id);ensure_property($before['propertyId'],$user);$pdo=db();$pdo->beginTransaction();try{$pdo->prepare('UPDATE property_companies SET is_default=0 WHERE property_id=? AND is_active=1')->execute([uuid_bin($before['propertyId'])]);$pdo->prepare('UPDATE property_companies SET is_default=1,updated_at=?,updated_by=? WHERE id=?')->execute([now_utc(),uuid_bin($user['id']),uuid_bin($id)]);$pdo->commit();}catch(Throwable$error){if($pdo->inTransaction())$pdo->rollBack();throw$error;}$after=company_details_by_id($id,$before['propertyId']);audit_log('DEFAULT_COMPANY_CHANGED','settings','Firma activă este acum '.$after['legalName'],'Company',$id,$after['propertyId'],['isDefault'=>$before['isDefault']],['isDefault'=>true],$user);respond($after);
    }
    if ($method === 'PUT' && path_match('/companies/{id}',$path,$params)) {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate modifica firmele.',403);$id=validated_uuid($params['id'],'Firma');$before=company_details_by_id($id);ensure_property($before['propertyId'],$user);$values=validated_company_payload(json_body());$now=now_utc();$sets=['legal_name','tax_id','trade_register_number','vat_payer','address','city','county','postal_code','country','phone','email','website','bank_name','iban','representative_name','representative_role'];$assignments=array_map(fn($column)=>$column.'=?',$sets);db()->prepare('UPDATE property_companies SET '.implode(',',$assignments).',updated_at=?,updated_by=? WHERE id=?')->execute([...$values,$now,uuid_bin($user['id']),uuid_bin($id)]);$after=company_details_by_id($id,$before['propertyId']);audit_log('COMPANY_UPDATED','settings','Firmă actualizată: '.$after['legalName'],'Company',$id,$after['propertyId'],company_details_snapshot($before),company_details_snapshot($after),$user);respond($after);
    }
    if ($method === 'POST' && path_match('/companies/{id}/stamp',$path,$params)) {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate modifica ștampila.',403);$id=validated_uuid($params['id'],'Firma');$before=company_details_by_id($id);ensure_property($before['propertyId'],$user);$data=(string)(json_body()['stamp']??'');if(!preg_match('#^data:image/(png|jpeg|webp);base64,(.+)$#',$data,$match))fail('Formatul ștampilei nu este valid.',422);$binary=base64_decode($match[2],true);if($binary===false||strlen($binary)<100||strlen($binary)>2500000)fail('Imaginea ștampilei este invalidă sau prea mare.',422);$extensions=['png'=>'png','jpeg'=>'jpg','webp'=>'webp'];$extension=$extensions[$match[1]];$directory=__DIR__.'/uploads/stamps';if(!is_dir($directory)&&!mkdir($directory,0755,true)&&!is_dir($directory))throw new RuntimeException('Directorul pentru ștampile nu poate fi creat.');foreach(glob($directory.'/'.$id.'.*')?:[]as$oldFile)if(is_file($oldFile))@unlink($oldFile);$filename=$id.'.'.$extension;if(file_put_contents($directory.'/'.$filename,$binary,LOCK_EX)===false)throw new RuntimeException('Ștampila nu poate fi salvată.');$pathValue='uploads/stamps/'.$filename;db()->prepare('UPDATE property_companies SET stamp_path=?,updated_at=?,updated_by=? WHERE id=?')->execute([$pathValue,now_utc(),uuid_bin($user['id']),uuid_bin($id)]);$after=company_details_by_id($id,$before['propertyId']);audit_log('COMPANY_STAMP_UPDATED','settings','Ștampila firmei a fost actualizată','Company',$id,$after['propertyId'],['hasStamp'=>!empty($before['stampUrl'])],['hasStamp'=>true],$user);respond($after);
    }
    if ($method === 'DELETE' && path_match('/companies/{id}/stamp',$path,$params)) {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate elimina ștampila.',403);$id=validated_uuid($params['id'],'Firma');$before=company_details_by_id($id);ensure_property($before['propertyId'],$user);$directory=__DIR__.'/uploads/stamps';foreach(glob($directory.'/'.$id.'.*')?:[]as$oldFile)if(is_file($oldFile))@unlink($oldFile);db()->prepare('UPDATE property_companies SET stamp_path=NULL,updated_at=?,updated_by=? WHERE id=?')->execute([now_utc(),uuid_bin($user['id']),uuid_bin($id)]);$after=company_details_by_id($id,$before['propertyId']);audit_log('COMPANY_STAMP_DELETED','settings','Ștampila firmei a fost eliminată','Company',$id,$after['propertyId'],['hasStamp'=>!empty($before['stampUrl'])],['hasStamp'=>false],$user);respond($after);
    }

    if ($method === 'GET' && $path === '/company-details') {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate vedea datele firmei.',403);
        $propertyId=validated_uuid((string)($_GET['propertyId']??''),'Proprietatea');ensure_property($propertyId,$user);property_record($propertyId);respond(company_details_record($propertyId));
    }
    if ($method === 'PUT' && path_match('/company-details/{id}',$path,$params)) {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate modifica datele firmei.',403);
        $propertyId=validated_uuid($params['id'],'Proprietatea');ensure_property($propertyId,$user);property_record($propertyId);$body=json_body();$before=company_details_record($propertyId);
        $legalName=company_detail_text($body['legalName']??null,'Denumirea juridică',160);$taxId=company_detail_text($body['taxId']??null,'CUI / CIF',24);$tradeRegister=company_detail_text($body['tradeRegisterNumber']??null,'Numărul Registrului Comerțului',40);
        $address=company_detail_text($body['address']??null,'Adresa',220);$city=company_detail_text($body['city']??null,'Localitatea',80);$county=company_detail_text($body['county']??null,'Județul',80);$postalCode=company_detail_text($body['postalCode']??null,'Codul poștal',16);$country=company_detail_text($body['country']??'România','Țara',60)??'România';
        $phone=company_detail_text($body['phone']??null,'Telefonul',30);$email=company_detail_text($body['email']??null,'Emailul',140);if($email!==null&&!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Adresa de email nu este validă.',422);$website=company_detail_text($body['website']??null,'Website-ul',160);
        $bankName=company_detail_text($body['bankName']??null,'Banca',100);$iban=company_detail_text($body['iban']??null,'IBAN-ul',40);if($iban!==null){$iban=strtoupper(str_replace(' ','',$iban));if(!preg_match('/^[A-Z]{2}[A-Z0-9]{13,38}$/',$iban))fail('IBAN-ul nu este valid.',422);}
        $representativeName=company_detail_text($body['representativeName']??null,'Reprezentantul legal',120);$representativeRole=company_detail_text($body['representativeRole']??null,'Funcția reprezentantului',80);$vatPayer=(bool)($body['vatPayer']??false);$now=now_utc();ensure_company_details_table(db());
        db()->prepare('INSERT INTO property_company_details (property_id,legal_name,tax_id,trade_register_number,vat_payer,address,city,county,postal_code,country,phone,email,website,bank_name,iban,representative_name,representative_role,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE legal_name=VALUES(legal_name),tax_id=VALUES(tax_id),trade_register_number=VALUES(trade_register_number),vat_payer=VALUES(vat_payer),address=VALUES(address),city=VALUES(city),county=VALUES(county),postal_code=VALUES(postal_code),country=VALUES(country),phone=VALUES(phone),email=VALUES(email),website=VALUES(website),bank_name=VALUES(bank_name),iban=VALUES(iban),representative_name=VALUES(representative_name),representative_role=VALUES(representative_role),updated_at=VALUES(updated_at),updated_by=VALUES(updated_by)')->execute([uuid_bin($propertyId),$legalName,$taxId,$tradeRegister,$vatPayer?1:0,$address,$city,$county,$postalCode,$country,$phone,$email,$website,$bankName,$iban,$representativeName,$representativeRole,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
        $after=company_details_record($propertyId);audit_log('COMPANY_DETAILS_UPDATED','settings','Datele firmei au fost actualizate','Property',$propertyId,$propertyId,company_details_snapshot($before),company_details_snapshot($after),$user);gshop_queue_property_service_sheet_pdfs($propertyId);respond($after);
    }
    if ($method === 'POST' && path_match('/company-details/{id}/stamp',$path,$params)) {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate modifica ștampila.',403);
        $propertyId=validated_uuid($params['id'],'Proprietatea');ensure_property($propertyId,$user);property_record($propertyId);$before=company_details_record($propertyId);$data=(string)(json_body()['stamp']??'');
        if(!preg_match('#^data:image/(png|jpeg|webp);base64,(.+)$#',$data,$match))fail('Formatul ștampilei nu este valid.',422);$binary=base64_decode($match[2],true);if($binary===false||strlen($binary)<100||strlen($binary)>2500000)fail('Imaginea ștampilei este invalidă sau prea mare.',422);
        $extensions=['png'=>'png','jpeg'=>'jpg','webp'=>'webp'];$extension=$extensions[$match[1]];$directory=__DIR__.'/uploads/stamps';if(!is_dir($directory)&&!mkdir($directory,0755,true)&&!is_dir($directory))throw new RuntimeException('Directorul pentru ștampile nu poate fi creat.');
        foreach(glob($directory.'/'.$propertyId.'.*')?:[]as$oldFile)if(is_file($oldFile))@unlink($oldFile);$filename=$propertyId.'.'.$extension;if(file_put_contents($directory.'/'.$filename,$binary,LOCK_EX)===false)throw new RuntimeException('Ștampila nu poate fi salvată.');$pathValue='uploads/stamps/'.$filename;$now=now_utc();ensure_company_details_table(db());
        db()->prepare("INSERT INTO property_company_details (property_id,country,stamp_path,created_at,updated_at,created_by,updated_by) VALUES (?,'România',?,?,?,?,?) ON DUPLICATE KEY UPDATE stamp_path=VALUES(stamp_path),updated_at=VALUES(updated_at),updated_by=VALUES(updated_by)")->execute([uuid_bin($propertyId),$pathValue,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);$after=company_details_record($propertyId);audit_log('COMPANY_STAMP_UPDATED','settings','Ștampila firmei a fost actualizată','Property',$propertyId,$propertyId,['hasStamp'=>!empty($before['stampUrl'])],['hasStamp'=>true],$user);gshop_queue_property_service_sheet_pdfs($propertyId);respond($after);
    }
    if ($method === 'DELETE' && path_match('/company-details/{id}/stamp',$path,$params)) {
        $user=require_permission('settings.manage');if($user['role']!=='ADMIN')fail('Doar administratorul poate elimina ștampila.',403);$propertyId=validated_uuid($params['id'],'Proprietatea');ensure_property($propertyId,$user);$before=company_details_record($propertyId);
        $directory=__DIR__.'/uploads/stamps';foreach(glob($directory.'/'.$propertyId.'.*')?:[]as$oldFile)if(is_file($oldFile))@unlink($oldFile);db()->prepare('UPDATE property_company_details SET stamp_path=NULL,updated_at=?,updated_by=? WHERE property_id=?')->execute([now_utc(),uuid_bin($user['id']),uuid_bin($propertyId)]);$after=company_details_record($propertyId);audit_log('COMPANY_STAMP_DELETED','settings','Ștampila firmei a fost eliminată','Property',$propertyId,$propertyId,['hasStamp'=>!empty($before['stampUrl'])],['hasStamp'=>false],$user);gshop_queue_property_service_sheet_pdfs($propertyId);respond($after);
    }

    if ($method === 'GET' && $path === '/whatsapp-messages') {
        $user=require_permission('clients.view');$propertyId=validated_uuid((string)($_GET['propertyId']??''),'Proprietatea');ensure_property($propertyId,$user);
        $stmt=db()->prepare('SELECT '.uuid_sql('id').' id,'.uuid_sql('property_id').' property_id,'.uuid_sql('user_id').' user_id,title,message,sort_order,is_active,created_at,updated_at,'.uuid_sql('created_by').' created_by,'.uuid_sql('updated_by').' updated_by FROM whatsapp_messages WHERE property_id=? AND user_id=? AND is_active=1 ORDER BY sort_order,title');
        $stmt->execute([uuid_bin($propertyId),uuid_bin($user['id'])]);$items=[];foreach($stmt->fetchAll()as$row){$item=entity_base($row);$item['sortOrder']=(int)$item['sortOrder'];$items[]=$item;}respond($items);
    }
    if ($method === 'POST' && $path === '/whatsapp-messages') {
        $user=require_permission('clients.view');$body=json_body();$propertyId=validated_uuid((string)($body['propertyId']??''),'Proprietatea');ensure_property($propertyId,$user);
        $title=validated_whatsapp_message_text($body['title']??null,'Titlul',2,80);$message=validated_whatsapp_message_text($body['message']??null,'Mesajul',1,1000);$id=uuid_v4();$now=now_utc();$pdo=db();
        $count=$pdo->prepare('SELECT COUNT(*) FROM whatsapp_messages WHERE property_id=? AND user_id=? AND is_active=1');$count->execute([uuid_bin($propertyId),uuid_bin($user['id'])]);$total=(int)$count->fetchColumn();$sortOrder=max(1,min($total+1,(int)($body['sortOrder']??($total+1))));
        $pdo->beginTransaction();try{$pdo->prepare('INSERT INTO whatsapp_messages (id,property_id,user_id,title,message,sort_order,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,1,?,?,?,?)')->execute([uuid_bin($id),uuid_bin($propertyId),uuid_bin($user['id']),$title,$message,$sortOrder,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);resequence_whatsapp_messages($pdo,$propertyId,$user['id'],$id,$sortOrder);$pdo->commit();}catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw$error;}
        $after=whatsapp_message_record($id);audit_log('WHATSAPP_MESSAGE_CREATED','whatsapp_messages','Mesaj WhatsApp creat: '.$title,'WhatsAppMessage',$id,$propertyId,null,$after,$user);respond($after,201);
    }
    if ($method === 'POST' && path_match('/whatsapp-messages/{id}/use',$path,$params)) {
        $user=require_permission('clients.view');$message=whatsapp_message_record(validated_uuid($params['id'],'Mesajul'));if($message['userId']!==$user['id'])fail('Mesajul nu aparține contului tău.',403);$client=get_client(validated_uuid((string)(json_body()['clientId']??''),'Clientul'));ensure_property($client['propertyId'],$user);if($client['propertyId']!==$message['propertyId'])fail('Mesajul și clientul aparțin unor proprietăți diferite.',422);
        audit_log('WHATSAPP_MESSAGE_USED','whatsapp_messages','Mesaj WhatsApp pregătit: '.$message['title'],'Client',$client['id'],$client['propertyId'],null,['messageId'=>$message['id'],'title'=>$message['title']],$user);respond(['recorded'=>true]);
    }
    if ($method === 'PUT' && path_match('/whatsapp-messages/{id}',$path,$params)) {
        $user=require_permission('clients.view');$before=whatsapp_message_record(validated_uuid($params['id'],'Mesajul'));ensure_property($before['propertyId'],$user);if($before['userId']!==$user['id'])fail('Poți modifica doar mesajele contului tău.',403);$body=json_body();
        if(!empty($body['propertyId'])&&$body['propertyId']!==$before['propertyId'])fail('Mesajul aparține altei proprietăți.',422);
        $title=validated_whatsapp_message_text($body['title']??$before['title'],'Titlul',2,80);$message=validated_whatsapp_message_text($body['message']??$before['message'],'Mesajul',1,1000);$sortOrder=max(1,(int)($body['sortOrder']??$before['sortOrder']));$now=now_utc();$pdo=db();
        $pdo->beginTransaction();try{$pdo->prepare('UPDATE whatsapp_messages SET title=?,message=?,updated_at=?,updated_by=? WHERE id=?')->execute([$title,$message,$now,uuid_bin($user['id']),uuid_bin($before['id'])]);resequence_whatsapp_messages($pdo,$before['propertyId'],$user['id'],$before['id'],$sortOrder);$pdo->commit();}catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw$error;}
        $after=whatsapp_message_record($before['id']);audit_log('WHATSAPP_MESSAGE_UPDATED','whatsapp_messages','Mesaj WhatsApp actualizat: '.$title,'WhatsAppMessage',$before['id'],$before['propertyId'],$before,$after,$user);respond($after);
    }
    if ($method === 'DELETE' && path_match('/whatsapp-messages/{id}',$path,$params)) {
        $user=require_permission('clients.view');$before=whatsapp_message_record(validated_uuid($params['id'],'Mesajul'));ensure_property($before['propertyId'],$user);if($before['userId']!==$user['id'])fail('Poți șterge doar mesajele contului tău.',403);
        $pdo=db();$pdo->beginTransaction();try{$pdo->prepare('DELETE FROM whatsapp_messages WHERE id=?')->execute([uuid_bin($before['id'])]);resequence_whatsapp_messages($pdo,$before['propertyId'],$user['id']);$pdo->commit();}catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw$error;}
        audit_log('WHATSAPP_MESSAGE_DELETED','whatsapp_messages','Mesaj WhatsApp șters: '.$before['title'],'WhatsAppMessage',$before['id'],$before['propertyId'],$before,['deleted'=>true],$user);respond(['deleted'=>true]);
    }

    if ($method === 'GET' && $path === '/dashboard') {
        $user=require_permission('dashboard.view');$propertyId=(string)($_GET['propertyId']??'');ensure_property($propertyId,$user);$p=uuid_bin($propertyId);$pdo=db();
        $scalar=function(string $sql,array $args=[])use($pdo){$stmt=$pdo->prepare($sql);$stmt->execute($args);return $stmt->fetchColumn();};
        $clients=(int)$scalar('SELECT COUNT(*) FROM clients WHERE property_id=? AND is_active=1',[$p]);$clientsNew=(int)$scalar('SELECT COUNT(*) FROM clients WHERE property_id=? AND is_active=1 AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)',[$p]);
        $open=(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS')",[$p]);$progress=(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status='IN_PROGRESS'",[$p]);$completed=(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('COMPLETED','DELIVERED')",[$p]);
        $users=(int)$scalar('SELECT COUNT(*) FROM user_properties up JOIN users u ON u.id=up.user_id WHERE up.property_id=? AND u.is_active=1',[$p]);$collabs=(int)$scalar('SELECT COUNT(*) FROM collaborator_properties cp JOIN collaborators c ON c.id=cp.collaborator_id WHERE cp.property_id=? AND c.is_active=1',[$p]);
        $qrGenerated=(int)$scalar("SELECT COUNT(*) FROM client_qr WHERE property_id=? AND is_active=1 AND status IN ('GENERATED','SENT')",[$p]);$qrUsed=(int)$scalar("SELECT COUNT(*) FROM client_qr WHERE property_id=? AND is_active=1 AND status='USED'",[$p]);
        $financeSql="SELECT ".uuid_sql('c.id')." client_id,COALESCE(cf.currency_code,'RON') currency_code,COALESCE(cf.exchange_rate_to_ron,1) exchange_rate_to_ron,COALESCE(cf.work_price,0) work_price,COALESCE(cf.diagnostic_fee,0) diagnostic_fee,COALESCE(cf.advance_paid,0) advance_paid,COALESCE(cf.discount_percent,0) discount_percent,COALESCE(cf.actual_parts_cost,0) actual_parts_cost,COALESCE(cf.payment_status,'UNPAID') payment_status,COALESCE(ex.total_expenses,0) total_expenses,COALESCE(cm.commission_count,0) commission_count,COALESCE(cm.paid_count,0) paid_count,COALESCE(cm.commission_total,0) commission_total,COALESCE(cm.paid_total,0) paid_total,COALESCE(cm.due_total,0) due_total FROM clients c LEFT JOIN client_financials cf ON cf.client_id=c.id LEFT JOIN (SELECT client_id,SUM(amount) total_expenses FROM client_expenses GROUP BY client_id) ex ON ex.client_id=c.id LEFT JOIN (SELECT client_id,COUNT(*) commission_count,SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN 1 ELSE 0 END) paid_count,SUM(commission_value) commission_total,SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN commission_value ELSE 0 END) paid_total,SUM(CASE WHEN status IN ('ESTIMATED','CALCULATED','APPROVED') OR (status='PAID' AND paid_at IS NULL) THEN commission_value ELSE 0 END) due_total FROM commissions WHERE is_active=1 AND status<>'CANCELLED' GROUP BY client_id) cm ON cm.client_id=c.id WHERE c.property_id=? AND c.is_active=1 AND (cf.client_id IS NOT NULL OR ex.client_id IS NOT NULL)";
        $financeStmt=$pdo->prepare($financeSql);$financeStmt->execute([$p]);$financeRevenueRon=0.0;$financeHoldRon=0.0;$financeNetRon=0.0;$financeWaiting=0;$financeCollaboratorPaidRon=0.0;$financeCollaboratorOnHoldRon=0.0;
        foreach($financeStmt->fetchAll()as$row){
            $rate=(float)$row['exchange_rate_to_ron'];$subtotal=round((float)$row['work_price']+(float)$row['diagnostic_fee'],2);$discountAmount=round($subtotal*(float)$row['discount_percent']/100,2);$total=round(max(0,$subtotal-$discountAmount),2);
            $received=$row['payment_status']==='PAID'?$total:round(min((float)$row['advance_paid'],$total),2);$remaining=round(max(0,$total-$received),2);$internal=round((float)$row['actual_parts_cost']+(float)$row['total_expenses'],2);
            $commission=round((float)$row['commission_total'],2);
            if((int)$row['commission_count']===0){foreach(client_collaborator_assignments((string)$row['client_id'])as$assignment)$commission+=commission_amount($total,max(0,$total-$internal),(string)$assignment['commissionType'],(float)$assignment['commissionValue']);$commission=round($commission,2);}
            if((int)$row['commission_count']>0){$financeCollaboratorPaidRon+=round((float)$row['paid_total'],2)*$rate;$financeCollaboratorOnHoldRon+=round((float)$row['due_total'],2)*$rate;}else$financeCollaboratorOnHoldRon+=$commission*$rate;
            $financeRevenueRon+=$received*$rate;$financeHoldRon+=$remaining*$rate;$financeNetRon+=round($received-$internal-(float)$row['paid_total'],2)*$rate;if($remaining>0.004)$financeWaiting++;
        }
        $legacyStmt=$pdo->prepare("SELECT COALESCE(SUM(CASE WHEN s.status IN ('COMPLETED','DELIVERED') THEN s.total_cost ELSE 0 END),0) total_revenue,COALESCE(SUM(CASE WHEN s.status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS') THEN s.total_cost ELSE 0 END),0) revenue_on_hold,COALESCE(SUM(s.direct_costs),0) direct_costs,COUNT(DISTINCT CASE WHEN s.status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS') THEN s.client_id END) clients_waiting FROM service_sheets s JOIN clients c ON c.id=s.client_id LEFT JOIN client_financials cf ON cf.client_id=c.id WHERE s.property_id=? AND c.is_active=1 AND cf.client_id IS NULL AND NOT EXISTS(SELECT 1 FROM client_expenses e WHERE e.client_id=c.id) AND s.is_active=1 AND s.status<>'CANCELLED'");$legacyStmt->execute([$p]);$legacy=$legacyStmt->fetch();
        $legacyCommissionStmt=$pdo->prepare("SELECT COALESCE(SUM(CASE WHEN co.status='PAID' AND co.paid_at IS NOT NULL THEN co.commission_value ELSE 0 END),0) paid,COALESCE(SUM(CASE WHEN co.status IN ('ESTIMATED','CALCULATED','APPROVED') OR (co.status='PAID' AND co.paid_at IS NULL) THEN co.commission_value ELSE 0 END),0) on_hold FROM commissions co JOIN clients c ON c.id=co.client_id LEFT JOIN client_financials cf ON cf.client_id=c.id WHERE co.property_id=? AND c.is_active=1 AND cf.client_id IS NULL AND NOT EXISTS(SELECT 1 FROM client_expenses e WHERE e.client_id=c.id) AND co.is_active=1 AND co.status<>'CANCELLED'");$legacyCommissionStmt->execute([$p]);$legacyCommissionSummary=$legacyCommissionStmt->fetch();
        $legacyRevenue=(float)$legacy['total_revenue'];$legacyDirectCosts=(float)$legacy['direct_costs'];$totalRevenue=$financeRevenueRon+$legacyRevenue;$revenueOnHold=$financeHoldRon+(float)$legacy['revenue_on_hold'];$clientsWaiting=$financeWaiting+(int)$legacy['clients_waiting'];
        $collaboratorPaid=$financeCollaboratorPaidRon+(float)$legacyCommissionSummary['paid'];$collaboratorOnHold=$financeCollaboratorOnHoldRon+(float)$legacyCommissionSummary['on_hold'];$collaboratorTotal=$collaboratorPaid+$collaboratorOnHold;$gshopNet=$financeNetRon+($legacyRevenue-$legacyDirectCosts-(float)$legacyCommissionSummary['paid']);
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
        $user=require_financial_write();$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);$body=json_body();gshop_queue_client_service_sheet_pdf($client['id']);$before=client_financial_record($client);$next=$before;
        $currency=array_key_exists('currencyCode',$body)?validated_currency($body['currencyCode']):$before['currencyCode'];$next['currencyCode']=$currency;
        if($currency==='RON')$next['exchangeRateToRon']=array_key_exists('exchangeRateToRon',$body)?validated_exchange_rate($body['exchangeRateToRon'],$currency):1.0;
        else{if(!array_key_exists('exchangeRateToRon',$body)&&(!$before['persisted']||$currency!==$before['currencyCode']))fail('Cursul de schimb este obligatoriu pentru moneda selectată.',422);$next['exchangeRateToRon']=array_key_exists('exchangeRateToRon',$body)?validated_exchange_rate($body['exchangeRateToRon'],$currency):(float)$before['exchangeRateToRon'];}
        $amountFields=['workPrice'=>'Prețul lucrării','diagnosticFee'=>'Taxa de diagnostic','advancePaid'=>'Avansul','actualPartsCost'=>'Costul efectiv al pieselor','displayedPartsCost'=>'Costul afișat al pieselor','displayedLaborCost'=>'Manopera afișată'];
        foreach($amountFields as$key=>$label)if(array_key_exists($key,$body))$next[$key]=validated_amount($body[$key],$label);
        if(array_key_exists('discountPercent',$body))$next['discountPercent']=validated_amount($body['discountPercent'],'Reducerea',100,true,2);
        if(array_key_exists('paymentStatus',$body)){if(!is_string($body['paymentStatus'])||!in_array($body['paymentStatus'],['UNPAID','PAID'],true))fail('Statusul plății nu este valid.',422);$next['paymentStatus']=$body['paymentStatus'];}
        $pdo=db();$pdo->beginTransaction();
        $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($client['id'])]);$client=get_client($client['id']);
        $lockedBefore=client_financial_record($client);$lockedNext=$lockedBefore;
        foreach(['currencyCode','exchangeRateToRon','workPrice','diagnosticFee','advancePaid','discountPercent','actualPartsCost','displayedPartsCost','displayedLaborCost','paymentStatus']as$key)if(array_key_exists($key,$body))$lockedNext[$key]=$next[$key];
        if(array_key_exists('currencyCode',$body)&&$lockedNext['currencyCode']==='RON'&&!array_key_exists('exchangeRateToRon',$body))$lockedNext['exchangeRateToRon']=1.0;
        $before=$lockedBefore;$next=$lockedNext;$beforeSnapshot=financial_mutable_snapshot($before);$nextSnapshot=financial_mutable_snapshot($next);
        $currencyChanged=$before['currencyCode']!==$next['currencyCode']||abs((float)$before['exchangeRateToRon']-(float)$next['exchangeRateToRon'])>0.00000001;
        if($currencyChanged){$paidCommission=$pdo->prepare("SELECT 1 FROM commissions WHERE client_id=? AND is_active=1 AND status='PAID' AND paid_at IS NOT NULL LIMIT 1 FOR UPDATE");$paidCommission->execute([uuid_bin($client['id'])]);if($paidCommission->fetchColumn()){$pdo->rollBack();fail('Moneda sau cursul nu pot fi schimbate cât timp comisionul colaboratorului este achitat. Marchează comisionul neachitat și încearcă din nou.',409,['code'=>'CURRENCY_CHANGE_BLOCKED_BY_PAID_COMMISSION']);}}
        $expenseCountStmt=$pdo->prepare('SELECT COUNT(*) FROM client_expenses WHERE client_id=?');$expenseCountStmt->execute([uuid_bin($client['id'])]);$expenseCount=(int)$expenseCountStmt->fetchColumn();
        if(!financial_has_data($next)&&$expenseCount===0){
            $syncResult=sync_client_commission($pdo,$client,$next,[],$user,false);
            if($before['persisted'])$pdo->prepare('DELETE FROM client_financials WHERE client_id=?')->execute([uuid_bin($client['id'])]);
            sync_service_sheet_financials_from_client($pdo,$client,$next,[],$user);
            $pdo->commit();
            if($before['persisted'])audit_log('CLIENT_FINANCIALS_CLEARED','financials','Datele financiare ale clientului au fost golite','Client',$client['id'],$client['propertyId'],$beforeSnapshot,null,$user);
            if($syncResult['changed'])audit_log('CLIENT_COMMISSION_RECALCULATED','commissions','Comisionul colaboratorului a fost recalculat din finanțele clientului','Client',$client['id'],$client['propertyId'],null,client_financial_bundle($client)['collaborator'],$user);
            respond(client_financial_bundle($client));
        }
        if($before['persisted']&&$beforeSnapshot===$nextSnapshot){$expenses=client_expenses($client['id']);$beforeCollaborator=client_collaborator_finance($client,$before,financial_summary($client,$before,$expenses));sync_service_sheet_financials_from_client($pdo,$client,$before,$expenses,$user);$syncResult=sync_client_commission($pdo,$client,$before,$expenses,$user,false);$pdo->commit();if($syncResult['changed'])audit_log('CLIENT_COMMISSION_RECALCULATED','commissions','Comisionul colaboratorului a fost recalculat din finanțele clientului','Client',$client['id'],$client['propertyId'],$beforeCollaborator,client_financial_bundle($client)['collaborator'],$user);respond(client_financial_bundle($client));}
        $now=now_utc();
        if($before['persisted']){
            $stmt=$pdo->prepare('UPDATE client_financials SET currency_code=?,exchange_rate_to_ron=?,work_price=?,diagnostic_fee=?,advance_paid=?,discount_percent=?,actual_parts_cost=?,displayed_parts_cost=?,displayed_labor_cost=?,payment_status=?,updated_at=?,updated_by=? WHERE client_id=?');
            $stmt->execute([$next['currencyCode'],$next['exchangeRateToRon'],$next['workPrice'],$next['diagnosticFee'],$next['advancePaid'],$next['discountPercent'],$next['actualPartsCost'],$next['displayedPartsCost'],$next['displayedLaborCost'],$next['paymentStatus'],$now,uuid_bin($user['id']),uuid_bin($client['id'])]);
        }else{
            $stmt=$pdo->prepare('INSERT INTO client_financials (client_id,currency_code,exchange_rate_to_ron,work_price,diagnostic_fee,advance_paid,discount_percent,actual_parts_cost,displayed_parts_cost,displayed_labor_cost,payment_status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
            $stmt->execute([uuid_bin($client['id']),$next['currencyCode'],$next['exchangeRateToRon'],$next['workPrice'],$next['diagnosticFee'],$next['advancePaid'],$next['discountPercent'],$next['actualPartsCost'],$next['displayedPartsCost'],$next['displayedLaborCost'],$next['paymentStatus'],$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
        }
        $after=client_financial_record($client);$expenses=client_expenses($client['id']);$beforeCollaborator=client_collaborator_finance($client,$before,financial_summary($client,$before,$expenses));sync_service_sheet_financials_from_client($pdo,$client,$after,$expenses,$user);$syncResult=sync_client_commission($pdo,$client,$after,$expenses,$user,false);$pdo->commit();
        $afterSnapshot=financial_mutable_snapshot($after);audit_log($before['persisted']?'CLIENT_FINANCIALS_UPDATED':'CLIENT_FINANCIALS_CREATED','financials','Datele financiare ale clientului au fost salvate','Client',$client['id'],$client['propertyId'],$before['persisted']?$beforeSnapshot:null,$afterSnapshot,$user);
        if($syncResult['changed'])audit_log('CLIENT_COMMISSION_RECALCULATED','commissions','Comisionul colaboratorului a fost recalculat din finanțele clientului','Client',$client['id'],$client['propertyId'],$beforeCollaborator,client_financial_bundle($client)['collaborator'],$user);
        respond(client_financial_bundle($client));
    }
    if ($method === 'GET' && path_match('/clients/{id}/expenses',$path,$params)) {
        $user=require_permission('financials.view');$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);respond(client_expenses($client['id']));
    }
    if ($method === 'POST' && path_match('/clients/{id}/expenses',$path,$params)) {
        $user=require_financial_write();$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);$body=json_body();$description=validated_expense_description($body['description']??null);$amount=validated_amount($body['amount']??null,'Valoarea cheltuielii',9999999999.99,false);$id=uuid_v4();$now=now_utc();
        $pdo=db();$pdo->beginTransaction();
        try{
            $pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE')->execute([uuid_bin($client['id'])]);$client=get_client($client['id']);
            $beforeFinancial=client_financial_record($client);$beforeExpenses=client_expenses($client['id']);$beforeCollaborator=client_collaborator_finance($client,$beforeFinancial,financial_summary($client,$beforeFinancial,$beforeExpenses));
            ensure_client_financial_shell($pdo,$client,$user,$now);$pdo->prepare('INSERT INTO client_expenses (id,client_id,description,amount,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)')->execute([uuid_bin($id),uuid_bin($client['id']),$description,$amount,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
            $currentFinancial=client_financial_record($client);$currentExpenses=client_expenses($client['id']);sync_service_sheet_financials_from_client($pdo,$client,$currentFinancial,$currentExpenses,$user);$syncResult=sync_client_commission($pdo,$client,$currentFinancial,$currentExpenses,$user,false);$pdo->commit();
        }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        $expense=get_client_expense($client['id'],$id);audit_log('CLIENT_EXPENSE_CREATED','financials','Cheltuială adăugată clientului','Client',$client['id'],$client['propertyId'],null,expense_audit_snapshot($expense),$user);
        if($syncResult['changed'])audit_log('CLIENT_COMMISSION_RECALCULATED','commissions','Comisionul colaboratorului a fost recalculat după modificarea cheltuielilor','Client',$client['id'],$client['propertyId'],$beforeCollaborator,client_financial_bundle($client)['collaborator'],$user);
        respond($expense,201);
    }
    if ($method === 'PUT' && path_match('/clients/{id}/expenses/{expenseId}',$path,$params)) {
        $user=require_financial_write();$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);$expenseId=validated_uuid($params['expenseId'],'Cheltuiala');$body=json_body();$pdo=db();$pdo->beginTransaction();
        try{
            $pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE')->execute([uuid_bin($client['id'])]);$client=get_client($client['id']);$before=get_client_expense($client['id'],$expenseId);
            $description=array_key_exists('description',$body)?validated_expense_description($body['description']):$before['description'];$amount=array_key_exists('amount',$body)?validated_amount($body['amount'],'Valoarea cheltuielii',9999999999.99,false):(float)$before['amount'];$beforeSnapshot=expense_audit_snapshot($before);$nextSnapshot=['id'=>$expenseId,'description'=>$description,'amount'=>$amount];$expenseChanged=$beforeSnapshot!==$nextSnapshot;
            $beforeFinancial=client_financial_record($client);$beforeExpenses=client_expenses($client['id']);$beforeCollaborator=client_collaborator_finance($client,$beforeFinancial,financial_summary($client,$beforeFinancial,$beforeExpenses));
            if($expenseChanged)$pdo->prepare('UPDATE client_expenses SET description=?,amount=?,updated_at=?,updated_by=? WHERE id=? AND client_id=?')->execute([$description,$amount,now_utc(),uuid_bin($user['id']),uuid_bin($expenseId),uuid_bin($client['id'])]);
            $after=get_client_expense($client['id'],$expenseId);$currentFinancial=client_financial_record($client);$currentExpenses=client_expenses($client['id']);sync_service_sheet_financials_from_client($pdo,$client,$currentFinancial,$currentExpenses,$user);$syncResult=sync_client_commission($pdo,$client,$currentFinancial,$currentExpenses,$user,false);$pdo->commit();
        }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        if($expenseChanged)audit_log('CLIENT_EXPENSE_UPDATED','financials','Cheltuială actualizată pentru client','Client',$client['id'],$client['propertyId'],$beforeSnapshot,expense_audit_snapshot($after),$user);
        if($syncResult['changed'])audit_log('CLIENT_COMMISSION_RECALCULATED','commissions','Comisionul colaboratorului a fost recalculat după modificarea cheltuielilor','Client',$client['id'],$client['propertyId'],$beforeCollaborator,client_financial_bundle($client)['collaborator'],$user);
        respond($after);
    }
    if ($method === 'DELETE' && path_match('/clients/{id}/expenses/{expenseId}',$path,$params)) {
        $user=require_financial_write();$client=get_client(validated_uuid($params['id'],'Clientul'));ensure_property($client['propertyId'],$user);$expenseId=validated_uuid($params['expenseId'],'Cheltuiala');$pdo=db();$pdo->beginTransaction();
        try{
            $pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE')->execute([uuid_bin($client['id'])]);$client=get_client($client['id']);$before=get_client_expense($client['id'],$expenseId);
            $beforeFinancial=client_financial_record($client);$beforeExpenses=client_expenses($client['id']);$beforeCollaborator=client_collaborator_finance($client,$beforeFinancial,financial_summary($client,$beforeFinancial,$beforeExpenses));
            $pdo->prepare('DELETE FROM client_expenses WHERE id=? AND client_id=?')->execute([uuid_bin($expenseId),uuid_bin($client['id'])]);$remaining=$pdo->prepare('SELECT COUNT(*) FROM client_expenses WHERE client_id=?');$remaining->execute([uuid_bin($client['id'])]);
            if((int)$remaining->fetchColumn()===0){$financial=client_financial_record($client);if($financial['persisted']&&!financial_has_data($financial))$pdo->prepare('DELETE FROM client_financials WHERE client_id=?')->execute([uuid_bin($client['id'])]);}
            $currentFinancial=client_financial_record($client);$currentExpenses=client_expenses($client['id']);sync_service_sheet_financials_from_client($pdo,$client,$currentFinancial,$currentExpenses,$user);$syncResult=sync_client_commission($pdo,$client,$currentFinancial,$currentExpenses,$user,false);$pdo->commit();
        }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        audit_log('CLIENT_EXPENSE_DELETED','financials','Cheltuială ștearsă de la client','Client',$client['id'],$client['propertyId'],expense_audit_snapshot($before),null,$user);
        if($syncResult['changed'])audit_log('CLIENT_COMMISSION_RECALCULATED','commissions','Comisionul colaboratorului a fost recalculat după modificarea cheltuielilor','Client',$client['id'],$client['propertyId'],$beforeCollaborator,client_financial_bundle($client)['collaborator'],$user);
        respond(['deleted'=>true,'id'=>$expenseId]);
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
        $hasMultipleAssignments=array_key_exists('collaborators',$body);$assignments=$hasMultipleAssignments?validated_client_collaborators($body['collaborators'],$propertyId):[];
        $hasExplicitCollaborator=$hasMultipleAssignments||array_key_exists('collaboratorId',$body);$collaboratorId='';$commissionType=null;$commissionValue=null;
        if($hasMultipleAssignments&&$assignments){
            $collaboratorId=$assignments[0]['collaboratorId'];$commissionType=$assignments[0]['commissionType'];$commissionValue=$assignments[0]['commissionValue'];
        }elseif(!$hasExplicitCollaborator){
            $collaborator=preset_collaborator_for_property($propertyId);
            if($collaborator!==null){$collaboratorId=$collaborator['id'];$commissionType=$collaborator['defaultCommissionType'];$commissionValue=validate_commission_settings($commissionType,$collaborator['defaultCommissionValue']);$assignments=[['collaboratorId'=>$collaboratorId,'name'=>$collaborator['name'],'role'=>$collaborator['role']??null,'commissionType'=>$commissionType,'commissionValue'=>$commissionValue,'sortOrder'=>1]];}
        }elseif(!$hasMultipleAssignments&&trim((string)($body['collaboratorId']??''))!==''){
            $collaboratorId=trim((string)$body['collaboratorId']);
            $collaborator=collaborator_for_property($collaboratorId,$propertyId);$commissionType=(string)($body['commissionType']??$collaborator['defaultCommissionType']);$commissionValue=validate_commission_settings($commissionType,$body['commissionValue']??$collaborator['defaultCommissionValue']);
            $assignments=[['collaboratorId'=>$collaboratorId,'name'=>$collaborator['name'],'role'=>$collaborator['role']??null,'commissionType'=>$commissionType,'commissionValue'=>$commissionValue,'sortOrder'=>1]];
        }
        $id=uuid_v4();$now=now_utc();$pdo=db();$pdo->beginTransaction();
        try{
            $stmt=$pdo->prepare('INSERT INTO clients (id,property_id,first_name,last_name,phone,secondary_phone,email,address,city,county,postal_code,notes,status,collaborator_id,commission_type,commission_value,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)');
            $stmt->execute([uuid_bin($id),uuid_bin($propertyId),trim($body['firstName']),trim($body['lastName']),trim($body['phone']),$body['secondaryPhone']??null,$body['email']??null,$body['address']??null,$body['city']??null,$body['county']??null,$body['postalCode']??null,$body['notes']??null,$clientStatus,$collaboratorId!==''?uuid_bin($collaboratorId):null,$commissionType,$commissionValue,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])]);
            replace_client_collaborators($pdo,$id,$assignments,$user,$now);
            $qr=create_client_qr($pdo,$id,$propertyId,$user['id'],$now);
            $pdo->commit();
        }catch(Throwable$e){$pdo->rollBack();throw$e;}
        $created=get_client($id);audit_log('CLIENT_CREATED','clients','Client creat: '.trim($body['firstName'].' '.$body['lastName']),'Client',$id,$propertyId,null,client_audit_snapshot($created),$user);audit_log('QR_GENERATED','qr','QR generat automat pentru '.$created['firstName'].' '.$created['lastName'],'ClientQR',$qr['id'],$propertyId,null,$qr,$user);respond(client_for_user($created,$user),201);
    }
    if ($method === 'PUT' && path_match('/clients/{id}', $path, $params)) {
        $user=require_permission('clients.update');$before=get_client($params['id']);ensure_property($before['propertyId'],$user);$body=json_body();
        if(array_key_exists('status',$body))$body['status']=validated_client_status($body['status']);
        $multipleAssignmentsTouched=array_key_exists('collaborators',$body);$requestedAssignments=$multipleAssignmentsTouched?validated_client_collaborators($body['collaborators'],$before['propertyId']):[];
        if($multipleAssignmentsTouched){$primary=$requestedAssignments[0]??null;$body['collaboratorId']=$primary['collaboratorId']??'';if($primary){$body['commissionType']=$primary['commissionType'];$body['commissionValue']=$primary['commissionValue'];}else{unset($body['commissionType'],$body['commissionValue']);}}
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
        if(!$multipleAssignmentsTouched)$requestedAssignments=$nextCollaboratorId!==null?[['collaboratorId'=>$nextCollaboratorId,'commissionType'=>$nextCommissionType,'commissionValue'=>(float)$nextCommissionValue,'sortOrder'=>1]]:[];
        $beforeAssignmentSnapshot=collaborator_assignment_snapshot($before['collaborators']??[]);$nextAssignmentSnapshot=collaborator_assignment_snapshot($requestedAssignments);
        $assignmentChanged=$assignmentTouched&&$beforeAssignmentSnapshot!==$nextAssignmentSnapshot;
        $now=now_utc();$sets[]='updated_at=?';$args[]=$now;$sets[]='updated_by=?';$args[]=uuid_bin($user['id']);$args[]=uuid_bin($params['id']);$pdo=db();$pdo->beginTransaction();
        $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($params['id'])]);$lockedBefore=get_client($params['id']);
        if($assignmentTouched&&collaborator_assignment_snapshot($lockedBefore['collaborators']??[])!==$beforeAssignmentSnapshot){$pdo->rollBack();fail('Atribuirea colaboratorului a fost modificată între timp. Reîncarcă clientul.',409,['code'=>'CLIENT_COLLABORATOR_CHANGED']);}
        if($assignmentChanged){$paidStmt=$pdo->prepare("SELECT 1 FROM commissions WHERE client_id=? AND is_active=1 AND status='PAID' AND paid_at IS NOT NULL LIMIT 1");$paidStmt->execute([uuid_bin($params['id'])]);if($paidStmt->fetchColumn()){$pdo->rollBack();fail('Comisionul colaboratorului este achitat. Marchează-l neachitat înainte să schimbi sau să ștergi atribuirea.',409,['code'=>'COLLABORATOR_COMMISSION_PAID']);}}
        $beforeFinancial=client_financial_record($before);$expenses=client_expenses($before['id']);
        try{$pdo->prepare('UPDATE clients SET '.implode(',',$sets).' WHERE id=?')->execute($args);if($assignmentTouched)replace_client_collaborators($pdo,$params['id'],$requestedAssignments,$user,$now);$after=get_client($params['id']);if($assignmentChanged)sync_client_commission($pdo,$after,$beforeFinancial,$expenses,$user,true);$pdo->commit();}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        audit_log('CLIENT_UPDATED','clients','Client actualizat: '.$after['firstName'].' '.$after['lastName'],'Client',$params['id'],$after['propertyId'],client_audit_snapshot($before),client_audit_snapshot($after),$user);
        if($assignmentChanged)audit_log('CLIENT_COLLABORATOR_SYNCED','commissions','Atribuirile și comisioanele colaboratorilor au fost sincronizate','Client',$after['id'],$after['propertyId'],$beforeAssignmentSnapshot,$nextAssignmentSnapshot,$user);
        gshop_queue_client_service_sheet_pdf($after['id']);
        respond(client_for_user($after,$user));
    }
    if ($method === 'DELETE' && path_match('/clients/{id}', $path, $params)) {
        $user=require_permission('clients.update');$clientId=validated_uuid($params['id'],'Clientul');$before=get_client($clientId);ensure_property($before['propertyId'],$user);
        if(empty($before['isActive']))respond(['deleted'=>true,'id'=>$clientId]);
        $pdo=db();ensure_service_documents_table($pdo);$pdo->beginTransaction();$now=now_utc();
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

    if ($method==='GET' && path_match('/public/client-form/{token}/documents/{type}', $path, $params))stream_service_document_row(public_service_document_row((string)$params['token'],(string)$params['type']));
    if ($method==='GET' && path_match('/public/client-form/{token}/service-sheet', $path, $params))stream_service_document_row(public_service_document_row((string)$params['token'],'INTAKE'));
    if ($method==='GET' && path_match('/public/client-form/{token}', $path, $params)) {
        $token=$params['token'];
        if(preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',$token)!==1)fail('Linkul este invalid sau nu mai este disponibil.',404);
        $stmt=db()->prepare(
            'SELECT '.uuid_sql('q.id').' id,'.uuid_sql('q.client_id').' client_id,'.uuid_sql('q.property_id').' property_id,' .
            'c.first_name,c.last_name,c.status client_status,c.updated_at client_updated_at,p.name property_name,p.domain property_domain ' .
            'FROM client_qr q JOIN clients c ON c.id=q.client_id JOIN properties p ON p.id=q.property_id ' .
            'WHERE q.token=? AND q.is_active=1 AND c.is_active=1 LIMIT 1'
        );
        $stmt->execute([uuid_bin($token)]);
        $qr=$stmt->fetch();
        if(!$qr)fail('Linkul este invalid sau nu mai este disponibil.',404);

        $now=now_utc();
        db()->prepare('UPDATE client_qr SET opened_at=COALESCE(opened_at,?),updated_at=? WHERE id=?')->execute([$now,$now,uuid_bin($qr['id'])]);

        $sheetStmt=db()->prepare(
            'SELECT '.uuid_sql('id').' id,number,equipment,brand,model,reported_issue,status,received_at,estimated_at,completed_at,updated_at ' .
            'FROM service_sheets WHERE client_id=? AND property_id=? AND is_active=1 ' .
            'ORDER BY updated_at DESC,created_at DESC LIMIT 1'
        );
        $sheetStmt->execute([uuid_bin($qr['client_id']),uuid_bin($qr['property_id'])]);
        $sheet=$sheetStmt->fetch();
        $sheetModel=$sheet?get_sheet((string)$sheet['id']):null;$company=$sheetModel?company_for_service_sheet($sheetModel):company_details_record($qr['property_id']);
        $contactPhone=$company['phone'];$contactEmail=$company['email'];
        $documents=$sheet?service_document_slots((string)$sheet['id'],$token,true):[];$intakeUrl=null;foreach($documents as$document)if($document['type']==='INTAKE'&&!empty($document['available'])){$intakeUrl=$document['url'];break;}

        respond([
            'propertyName'=>$qr['property_name'],
            'contact'=>[
                'phone'=>$contactPhone?:null,
                'email'=>$contactEmail?:null,
            ],
            'client'=>[
                'name'=>trim($qr['first_name'].' '.$qr['last_name']),
                'firstName'=>$qr['first_name'],
                'status'=>$qr['client_status'],
                'updatedAt'=>iso_date($qr['client_updated_at']),
            ],
            'repair'=>$sheet?[
                'number'=>$sheet['number'],
                'equipment'=>$sheet['equipment'],
                'brand'=>$sheet['brand'],
                'model'=>$sheet['model'],
                'reportedIssue'=>$sheet['reported_issue'],
                'status'=>$sheet['status'],
                'receivedAt'=>iso_date($sheet['received_at']),
                'estimatedAt'=>iso_date($sheet['estimated_at']),
                'completedAt'=>iso_date($sheet['completed_at']),
                'updatedAt'=>iso_date($sheet['updated_at']),
                'documents'=>$documents,
                'serviceSheetUrl'=>$intakeUrl,
            ]:null,
        ]);
    }
    if ($method==='POST' && path_match('/public/client-form/{token}', $path, $params)) {
        fail('Formularul public nu mai este disponibil. Acest link este folosit pentru urmărirea reparației.',405);
    }
    if ($method==='POST'&&$path==='/qr/resolve') {
        $user=require_permission('qr.scan');$body=json_body();$raw=(string)($body['data']??'');
        if(!preg_match('/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})/',$raw,$match))fail('Cod QR G-Shop invalid.',422);
        $stmt=db()->prepare('SELECT '.uuid_sql('q.id').' id,'.uuid_sql('q.client_id').' client_id,'.uuid_sql('q.property_id').' property_id,q.status,c.first_name,c.last_name FROM client_qr q JOIN clients c ON c.id=q.client_id WHERE q.token=? AND q.is_active=1 LIMIT 1');$stmt->execute([uuid_bin($match[1])]);$qr=$stmt->fetch();
        if(!$qr)fail('Codul este invalid.',404);ensure_property($qr['property_id'],$user);
        $requestedPropertyId=trim((string)($body['propertyId']??''));if($requestedPropertyId!==''&&$requestedPropertyId!==$qr['property_id'])fail('Codul QR nu aparține proprietății selectate.',422);
        $action=(string)($body['action']??'OPEN_PROFILE');if(!in_array($action,['OPEN_PROFILE','CHECK_IN','DROP_OFF','PICK_UP'],true))$action='OPEN_PROFILE';
        $now=now_utc();$pdo=db();$pdo->beginTransaction();
        try{
            $pdo->prepare('INSERT INTO qr_scan_logs (id,qr_id,client_id,property_id,scanned_by,action,device,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')->execute([uuid_bin(uuid_v4()),uuid_bin($qr['id']),uuid_bin($qr['client_id']),uuid_bin($qr['property_id']),uuid_bin($user['id']),$action,substr((string)($body['device']??''),0,100),'VALID',$now]);
            $pdo->prepare("UPDATE client_qr SET status='USED',used_at=COALESCE(used_at,?),updated_at=?,updated_by=? WHERE id=?")->execute([$now,$now,uuid_bin($user['id']),uuid_bin($qr['id'])]);
            $pdo->commit();
        }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        audit_log('QR_SCANNED','qr','QR scanat și marcat ca folosit: '.$action,'ClientQR',$qr['id'],$qr['property_id'],['status'=>$qr['status']],['status'=>'USED','action'=>$action,'device'=>$body['device']??null],$user);
        respond(['clientId'=>$qr['client_id'],'clientName'=>$qr['first_name'].' '.$qr['last_name'],'qrStatus'=>'USED']);
    }

    if ($method==='GET'&&$path==='/service-documents/register') {
        $user=require_permission('service_sheets.view');$propertyId=validated_uuid((string)($_GET['propertyId']??''),'Proprietatea');ensure_property($propertyId,$user);ensure_service_documents_table(db());
        $sql='SELECT '.uuid_sql('s.id').' service_sheet_id,s.number service_sheet_number,'.uuid_sql('c.id').' client_id,TRIM(CONCAT(c.first_name,\' \',c.last_name)) client_name,s.equipment,s.brand,s.model,s.status,s.received_at,MAX(CASE WHEN d.type=\'INTAKE\' THEN d.number END) intake_number,MAX(CASE WHEN d.type=\'INTAKE\' THEN d.document_at END) intake_at,MAX(CASE WHEN d.type=\'FINAL_ESTIMATE\' THEN d.number END) final_estimate_number,MAX(CASE WHEN d.type=\'FINAL_ESTIMATE\' THEN d.document_at END) final_estimate_at,MAX(CASE WHEN d.type=\'EXIT\' THEN d.number END) exit_number,MAX(CASE WHEN d.type=\'EXIT\' THEN d.document_at END) exit_at FROM service_sheets s JOIN clients c ON c.id=s.client_id AND c.is_active=1 LEFT JOIN service_documents d ON d.service_sheet_id=s.id AND d.is_active=1 AND d.status=\'PUBLISHED\' WHERE s.property_id=? AND s.is_active=1 GROUP BY s.id,s.number,c.id,c.first_name,c.last_name,s.equipment,s.brand,s.model,s.status,s.received_at ORDER BY s.received_at DESC,s.number DESC LIMIT 5000';$stmt=db()->prepare($sql);$stmt->execute([uuid_bin($propertyId)]);$rows=[];foreach($stmt->fetchAll()as$row)$rows[]=camel_row($row);respond($rows);
    }
    if ($method==='GET'&&$path==='/service-sheets') { $user=require_permission('service_sheets.view');$propertyId=(string)($_GET['propertyId']??'');ensure_property($propertyId,$user);$stmt=db()->prepare(sheet_select().' WHERE s.property_id=? AND s.is_active=1 ORDER BY s.received_at DESC,s.created_at DESC LIMIT 100');$stmt->execute([uuid_bin($propertyId)]);$data=array_map('map_sheet',$stmt->fetchAll());respond(['data'=>$data,'page'=>1,'pageSize'=>100,'total'=>count($data),'totalPages'=>1]); }
    if ($method==='GET'&&path_match('/service-sheets/{id}',$path,$params)) { $user=require_permission('service_sheets.view');$sheet=get_sheet($params['id']);ensure_property($sheet['propertyId'],$user);respond($sheet); }
    if ($method==='GET'&&path_match('/service-sheets/{id}/documents',$path,$params)) { $user=require_permission('service_sheets.view');$sheet=get_sheet($params['id']);ensure_property($sheet['propertyId'],$user);respond(service_document_slots($sheet['id'])); }
    if ($method==='GET'&&path_match('/service-sheets/{id}/documents/{type}/pdf',$path,$params)) { $user=require_permission('service_sheets.view');$sheet=get_sheet($params['id']);ensure_property($sheet['propertyId'],$user);$type=validated_service_document_type($params['type']);$row=service_document_existing_row($sheet['id'],$type);if(!$row)fail('Documentul nu a fost încă generat.',404);stream_service_document_row($row); }
    if ($method==='POST'&&path_match('/service-sheets/{id}/documents/{type}',$path,$params)) { current_user();$sheet=get_sheet($params['id']);$type=validated_service_document_type($params['type']);$before=service_document_record($sheet['id'],$type,false);$user=require_service_document_write($before!==null);ensure_property($sheet['propertyId'],$user);$document=generate_service_document_record($sheet['id'],$type,json_body(),$user);audit_log($before?'SERVICE_DOCUMENT_REGENERATED':'SERVICE_DOCUMENT_GENERATED','service_documents',($before?'Document actualizat: ':'Document generat: ').$document['label'],'ServiceSheet',$sheet['id'],$sheet['propertyId'],$before,$document,$user);respond($document,$before?200:201); }
    if ($method==='POST'&&$path==='/service-sheets') {
        $user=require_permission('service_sheets.create');$body=json_body();$propertyId=(string)($body['propertyId']??'');ensure_property($propertyId,$user);
        if(empty($body['clientId'])||empty($body['reportedIssue']))fail('Clientul și problema sunt obligatorii.',422);
        $clientId=(string)$body['clientId'];$client=get_client($clientId);
        if($client['propertyId']!==$propertyId)fail('Clientul nu aparține proprietății selectate.',422);
        $partsCost=max(0,(float)($body['partsCost']??0));$laborCost=max(0,(float)($body['laborCost']??0));$totalCost=max(0,(float)($body['totalCost']??($partsCost+$laborCost)));$directCosts=max(0,(float)($body['directCosts']??0));$netValue=max(0,$totalCost-$directCosts);
        $technicianName=trim((string)($body['technicianName']??''));$technicianName=$technicianName===''?null:validated_person_name($technicianName,'Numele tehnicianului');
        if(!empty($client['collaboratorId']))collaborator_for_property((string)$client['collaboratorId'],$propertyId);
        $activeCompany=company_details_record($propertyId);$activeCompanyId=!empty($activeCompany['id'])?(string)$activeCompany['id']:null;$activeCompanySnapshot=$activeCompanyId?company_sheet_snapshot(company_details_by_id($activeCompanyId,$propertyId,true)):null;
        $id=uuid_v4();$now=now_utc();$pdo=db();$pdo->beginTransaction();$commissionCreated=false;$financeSync=null;
        try{
            $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($clientId)]);
            $client=get_client($clientId);$financial=client_financial_record($client);$expenses=client_expenses($clientId);$financeSummary=financial_summary($client,$financial,$expenses);$collaboratorId=!empty($client['collaboratorId'])?(string)$client['collaboratorId']:null;$commissionValue=$collaboratorId!==null?(float)$financeSummary['collaboratorCost']:null;
            $existingStmt=$pdo->prepare('SELECT '.uuid_sql('id').' id FROM service_sheets WHERE client_id=? AND is_active=1 ORDER BY updated_at DESC,created_at DESC LIMIT 1 FOR UPDATE');$existingStmt->execute([uuid_bin($clientId)]);$existingId=$existingStmt->fetchColumn();
            if($existingId){$pdo->rollBack();fail('Clientul are deja o fișă de service.',409,['code'=>'SERVICE_SHEET_ALREADY_EXISTS','serviceSheetId'=>$existingId]);}
            $seq=(int)$pdo->query("SELECT COUNT(*)+1 FROM service_sheets WHERE YEAR(created_at)=YEAR(UTC_TIMESTAMP())")->fetchColumn();$number='GS-'.gmdate('Y').'-'.str_pad((string)$seq,5,'0',STR_PAD_LEFT);
            $insertColumns=['id','property_id','client_id','number','equipment','brand','model','serial_number','accessories','reported_issue','technical_assessment','work_performed','parts_used','parts_cost','labor_cost','total_cost','direct_costs','net_value','technician_id','technician_name','collaborator_id','collaborator_commission','show_company_details','company_id','company_snapshot','warranty','storage_after','handover_notes','identity_document','approve_diagnostics','approve_repair','repair_refused','product_delivered','internal_notes','received_at','estimated_at','status','is_active','created_at','updated_at','created_by','updated_by'];
            $insertValues=[uuid_bin($id),uuid_bin($propertyId),uuid_bin($clientId),$number,trim((string)($body['equipment']??'')),$body['brand']??null,$body['model']??null,$body['serialNumber']??null,$body['accessories']??null,$body['reportedIssue'],$body['technicalAssessment']??null,$body['workPerformed']??null,$body['partsUsed']??null,$partsCost,$laborCost,$totalCost,$directCosts,$netValue,!empty($body['technicianId'])?uuid_bin((string)$body['technicianId']):uuid_bin($user['id']),$technicianName,$collaboratorId?uuid_bin($collaboratorId):null,$commissionValue,1,$activeCompanyId?uuid_bin($activeCompanyId):null,$activeCompanySnapshot?json_encode($activeCompanySnapshot,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES):null,$body['warranty']??null,$body['storageAfter']??null,$body['handoverNotes']??null,$body['identityDocument']??null,!empty($body['approveDiagnostics'])?1:0,!empty($body['approveRepair'])?1:0,!empty($body['repairRefused'])?1:0,!empty($body['productDelivered'])?1:0,$body['internalNotes']??null,!empty($body['receivedAt'])?gmdate('Y-m-d H:i:s',strtotime((string)$body['receivedAt'])):$now,!empty($body['estimatedAt'])?gmdate('Y-m-d H:i:s',strtotime((string)$body['estimatedAt'])):null,'NEW',1,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])];
            $stmt=$pdo->prepare('INSERT INTO service_sheets ('.implode(',',$insertColumns).') VALUES ('.implode(',',array_fill(0,count($insertColumns),'?')).')');
            $stmt->execute($insertValues);
            $pdo->prepare("INSERT INTO service_sheet_status_history (id,service_sheet_id,old_status,new_status,changed_by,created_at) VALUES (?,?,NULL,'NEW',?,?)")->execute([uuid_bin(uuid_v4()),uuid_bin($id),uuid_bin($user['id']),$now]);
            $createdSheet=get_sheet($id);$financeSync=sync_client_financials_from_service_sheet($pdo,$client,$createdSheet,$user);$financial=$financeSync['after'];$expenses=$financeSync['expenses'];
            $syncResult=sync_client_commission($pdo,$client,$financial,$expenses,$user,false);$commissionCreated=!empty($syncResult['changed'])&&$collaboratorId!==null;
            $pdo->commit();
        }catch(Throwable$e){$pdo->rollBack();throw$e;}
        audit_log('SERVICE_SHEET_CREATED','service_sheets','Fișă creată: '.$number,'ServiceSheet',$id,$propertyId,null,$body,$user);
        if(!empty($financeSync['changed']))audit_log('CLIENT_FINANCIALS_SYNCED_FROM_SHEET','financials','Costurile clientului au fost sincronizate din fișa '.$number,'Client',$clientId,$propertyId,financial_mutable_snapshot($financeSync['before']),financial_mutable_snapshot($financeSync['after']),$user);
        if($commissionCreated)audit_log('COMMISSION_CREATED','commissions','Comision aprobat automat pentru fișa '.$number,'Client',$clientId,$propertyId,null,client_financial_bundle($client)['collaborator'],$user);
        gshop_queue_service_sheet_pdf($id);respond(get_sheet($id),201);
    }
    if ($method==='PUT'&&path_match('/service-sheets/{id}',$path,$params)) {
        $user=require_permission('service_sheets.update');$before=get_sheet($params['id']);ensure_property($before['propertyId'],$user);$body=json_body();
        if(array_key_exists('technicianName',$body)){$technicianName=trim((string)($body['technicianName']??''));$body['technicianName']=$technicianName===''?null:validated_person_name($technicianName,'Numele tehnicianului');}
        $financeChanged=count(array_intersect(array_keys($body),['partsCost','laborCost','totalCost','directCosts','netValue']))>0;
        if($financeChanged){
            $nextParts=array_key_exists('partsCost',$body)?max(0,(float)$body['partsCost']):(float)$before['partsCost'];$nextLabor=array_key_exists('laborCost',$body)?max(0,(float)$body['laborCost']):(float)$before['laborCost'];
            $nextTotal=array_key_exists('totalCost',$body)?max(0,(float)$body['totalCost']):((array_key_exists('partsCost',$body)||array_key_exists('laborCost',$body))?$nextParts+$nextLabor:(float)$before['totalCost']);$nextDirect=array_key_exists('directCosts',$body)?max(0,(float)$body['directCosts']):(float)$before['directCosts'];
            $body['partsCost']=$nextParts;$body['laborCost']=$nextLabor;$body['totalCost']=$nextTotal;$body['directCosts']=$nextDirect;$body['netValue']=max(0,$nextTotal-$nextDirect);
        }
        $map=['equipment'=>'equipment','brand'=>'brand','model'=>'model','serialNumber'=>'serial_number','accessories'=>'accessories','reportedIssue'=>'reported_issue','technicalAssessment'=>'technical_assessment','workPerformed'=>'work_performed','partsUsed'=>'parts_used','partsCost'=>'parts_cost','laborCost'=>'labor_cost','totalCost'=>'total_cost','directCosts'=>'direct_costs','netValue'=>'net_value','technicianName'=>'technician_name','warranty'=>'warranty','storageAfter'=>'storage_after','handoverNotes'=>'handover_notes','identityDocument'=>'identity_document','approveDiagnostics'=>'approve_diagnostics','approveRepair'=>'approve_repair','repairRefused'=>'repair_refused','productDelivered'=>'product_delivered','internalNotes'=>'internal_notes','receivedAt'=>'received_at','estimatedAt'=>'estimated_at','completedAt'=>'completed_at','status'=>'status'];$sets=[];$args=[];
        foreach($map as$key=>$column)if(array_key_exists($key,$body)){$sets[]="$column=?";$value=$body[$key];if(in_array($key,['receivedAt','estimatedAt','completedAt'],true))$value=$value?gmdate('Y-m-d H:i:s',strtotime((string)$value)):null;elseif(in_array($key,['approveDiagnostics','approveRepair','repairRefused','productDelivered'],true))$value=(bool)$value?1:0;elseif($value===''&&$key!=='equipment')$value=null;$args[]=$value;}
        if(!$sets)fail('Nu există date de actualizat.',422);$now=now_utc();$sets[]='updated_at=?';$args[]=$now;$sets[]='updated_by=?';$args[]=uuid_bin($user['id']);$args[]=uuid_bin($params['id']);$pdo=db();$pdo->beginTransaction();
        try{
            $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($before['clientId'])]);
            $pdo->prepare('UPDATE service_sheets SET '.implode(',',$sets).' WHERE id=?')->execute($args);
            if(isset($body['status'])&&$body['status']!==$before['status'])$pdo->prepare('INSERT INTO service_sheet_status_history (id,service_sheet_id,old_status,new_status,changed_by,created_at) VALUES (?,?,?,?,?,?)')->execute([uuid_bin(uuid_v4()),uuid_bin($params['id']),$before['status'],$body['status'],uuid_bin($user['id']),$now]);
            $after=get_sheet($params['id']);$recalculated=0;$financeSync=null;
            if($financeChanged){
                $client=get_client($before['clientId']);$financeSync=sync_client_financials_from_service_sheet($pdo,$client,$after,$user);$syncResult=sync_client_commission($pdo,$client,$financeSync['after'],$financeSync['expenses'],$user,false);$recalculated=!empty($syncResult['changed'])?1:0;
            }
            $pdo->commit();
        }catch(Throwable$e){$pdo->rollBack();throw$e;}
        $after=get_sheet($params['id']);audit_log('SERVICE_SHEET_UPDATED','service_sheets','Fișă actualizată: '.$after['number'],'ServiceSheet',$params['id'],$after['propertyId'],$before,$after,$user);
        if($financeChanged&&!empty($financeSync['changed']))audit_log('CLIENT_FINANCIALS_SYNCED_FROM_SHEET','financials','Costurile clientului au fost sincronizate din fișa '.$after['number'],'Client',$after['clientId'],$after['propertyId'],financial_mutable_snapshot($financeSync['before']),financial_mutable_snapshot($financeSync['after']),$user);
        if($financeChanged&&$recalculated>0)audit_log('COMMISSION_RECALCULATED','commissions','Comision recalculat pentru fișa '.$after['number'],'ServiceSheet',$params['id'],$after['propertyId'],['totalCost'=>$before['totalCost'],'directCosts'=>$before['directCosts'],'netValue'=>$before['netValue'],'collaboratorCommission'=>$before['collaboratorCommission']],['totalCost'=>$after['totalCost'],'directCosts'=>$after['directCosts'],'netValue'=>$after['netValue'],'collaboratorCommission'=>$after['collaboratorCommission']],$user);
        gshop_queue_service_sheet_pdf($after['id']);respond($after);
    }
    if ($method==='DELETE'&&path_match('/service-sheets/{id}',$path,$params)) {
        $user=require_permission('service_sheets.update');$before=get_sheet($params['id']);ensure_property($before['propertyId'],$user);
        $pdo=db();$pdo->beginTransaction();$now=now_utc();
        $clientLock=$pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE');$clientLock->execute([uuid_bin($before['clientId'])]);
        $paidStmt=$pdo->prepare("SELECT 1 FROM commissions WHERE service_sheet_id=? AND is_active=1 AND status='PAID' AND paid_at IS NOT NULL LIMIT 1");$paidStmt->execute([uuid_bin($before['id'])]);
        if($paidStmt->fetchColumn()){$pdo->rollBack();fail('Fișa are un comision de colaborator achitat. Marchează-l neachitat înainte să ștergi fișa.',409,['code'=>'COLLABORATOR_COMMISSION_PAID']);}
        $signatureStmt=$pdo->prepare('SELECT signature_path FROM service_sheets WHERE id=? LIMIT 1');$signatureStmt->execute([uuid_bin($before['id'])]);$signaturePath=$signatureStmt->fetchColumn()?:null;
        $documentFilesStmt=$pdo->prepare('SELECT file_path FROM service_documents WHERE service_sheet_id=?');$documentFilesStmt->execute([uuid_bin($before['id'])]);$documentPaths=array_values(array_filter(array_column($documentFilesStmt->fetchAll(),'file_path')));
        try{
            $pdo->prepare('UPDATE interventions SET service_sheet_id=NULL WHERE service_sheet_id=?')->execute([uuid_bin($before['id'])]);
            $pdo->prepare('DELETE FROM commissions WHERE service_sheet_id=?')->execute([uuid_bin($before['id'])]);
            $pdo->prepare('DELETE FROM service_sheet_status_history WHERE service_sheet_id=?')->execute([uuid_bin($before['id'])]);
            $pdo->prepare('DELETE FROM service_sheets WHERE id=?')->execute([uuid_bin($before['id'])]);
            $pdo->commit();
        }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        $safeNumber=preg_replace('/[^A-Za-z0-9_-]+/','-',(string)$before['number'])?:'fisa-service';$fileStem=strtolower($safeNumber);$pdfDirectory=__DIR__.'/uploads/service-sheets';
        $files=array_merge([$pdfDirectory.'/'.$fileStem.'.pdf',$pdfDirectory.'/'.$fileStem.'.pdf.sha256'],glob($pdfDirectory.'/'.$fileStem.'-*.pdf')?:[]);
        foreach($documentPaths as$relativePath){$candidate=service_document_absolute_path((string)$relativePath);if($candidate!==null){$files[]=$candidate;$files[]=$candidate.'.sha256';}}
        if($signaturePath){$candidate=realpath(__DIR__.'/'.ltrim((string)$signaturePath,'/\\'));$apiRoot=realpath(__DIR__);if($candidate!==false&&$apiRoot!==false&&str_starts_with($candidate,$apiRoot))$files[]=$candidate;}
        $removedFiles=0;foreach(array_unique($files)as$file)if(is_file($file)&&@unlink($file))$removedFiles++;
        audit_log('SERVICE_SHEET_DELETED','service_sheets','Fișă ștearsă definitiv: '.$before['number'],'ServiceSheet',$before['id'],$before['propertyId'],$before,['deleted'=>true,'removedFiles'=>$removedFiles],$user);
        respond(['deleted'=>true,'id'=>$before['id']]);
    }
    if ($method==='POST'&&path_match('/service-sheets/{id}/signature',$path,$params)) {
        $user=require_permission('service_sheets.sign');$sheet=get_sheet($params['id']);ensure_property($sheet['propertyId'],$user);$body=json_body();$data=(string)($body['signature']??'');if(!preg_match('#^data:image/png;base64,(.+)$#',$data,$match))fail('Formatul semnăturii nu este valid.',422);$binary=base64_decode($match[1],true);if($binary===false||strlen($binary)<100||strlen($binary)>1500000)fail('Semnătura este invalidă sau prea mare.',422);
        $directory=__DIR__.'/uploads/signatures';if(!is_dir($directory)&&!mkdir($directory,0755,true)&&!is_dir($directory))throw new RuntimeException('Directorul pentru semnături nu poate fi creat.');$filename=$sheet['id'].'.png';if(file_put_contents($directory.'/'.$filename,$binary,LOCK_EX)===false)throw new RuntimeException('Semnătura nu poate fi salvată.');$pathValue='uploads/signatures/'.$filename;$now=now_utc();db()->prepare('UPDATE service_sheets SET signature_path=?,signed_at=?,updated_at=?,updated_by=? WHERE id=?')->execute([$pathValue,$now,$now,uuid_bin($user['id']),uuid_bin($sheet['id'])]);
        regenerate_existing_service_documents($sheet['id'],$user);audit_log('SERVICE_SHEET_SIGNED','service_sheets','Semnătură client salvată și reutilizată în documentele reparației '.$sheet['number'],'ServiceSheet',$sheet['id'],$sheet['propertyId'],null,['signedAt'=>$now,'documentsRegenerated'=>true],$user);gshop_queue_service_sheet_pdf($sheet['id']);respond(get_sheet($sheet['id']));
    }
    if ($method==='POST'&&path_match('/service-sheets/{id}/pdf',$path,$params)) {
        current_user();$sheet=get_sheet($params['id']);$existingDocument=service_document_record($sheet['id'],'INTAKE',false);$user=require_service_document_write($existingDocument!==null);ensure_property($sheet['propertyId'],$user);
        $document=generate_service_document_record($sheet['id'],'INTAKE',[],$user);if(empty($document['url']))fail('Documentul a fost generat, dar clientul nu are un link QR activ pentru trimitere.',409);
        $fileName=strtolower((preg_replace('/[^A-Za-z0-9_-]+/','-',(string)$document['number'])?:'fisa-intrare').'.pdf');$result=['url'=>$document['url'],'fileName'=>$fileName,'generatedAt'=>$document['generatedAt']];
        audit_log('SERVICE_DOCUMENT_GENERATED','service_documents','Fișa de intrare a fost generată pentru '.$sheet['number'],'ServiceSheet',$sheet['id'],$sheet['propertyId'],null,['type'=>'INTAKE','fileName'=>$fileName],$user);
        respond($result,201);
    }

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
        $pairs="SELECT property_id,collaborator_id,client_id,MAX(commission_type) commission_type,MAX(commission_value) commission_value FROM (SELECT property_id,collaborator_id,client_id,NULL commission_type,NULL commission_value FROM commissions WHERE is_active=1 AND status<>'CANCELLED' UNION ALL SELECT cl.property_id,cc.collaborator_id,cl.id client_id,cc.commission_type,cc.commission_value FROM client_collaborators cc JOIN clients cl ON cl.id=cc.client_id WHERE cl.is_active=1) collaborator_pairs GROUP BY property_id,collaborator_id,client_id";
        $totals="SELECT property_id,collaborator_id,client_id,COUNT(*) commission_count,COUNT(DISTINCT service_sheet_id) service_sheets_count,COALESCE(SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN commission_value ELSE 0 END),0) paid,COALESCE(SUM(CASE WHEN status IN ('ESTIMATED','CALCULATED','APPROVED') OR (status='PAID' AND paid_at IS NULL) THEN commission_value ELSE 0 END),0) due,COALESCE(SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN 1 ELSE 0 END),0) paid_count,MAX(updated_at) last_activity_at FROM commissions WHERE is_active=1 AND status<>'CANCELLED' GROUP BY property_id,collaborator_id,client_id";
        $sql='SELECT '.uuid_sql('co.id').' collaborator_id,co.name collaborator_name,co.role,'.uuid_sql('cl.id').' client_id,CONCAT(cl.first_name,\' \',cl.last_name) client_name,pair.commission_type,pair.commission_value,(cf.client_id IS NOT NULL) finance_persisted,COALESCE(cf.exchange_rate_to_ron,1) exchange_rate_to_ron,COALESCE(cf.work_price,0) work_price,COALESCE(cf.diagnostic_fee,0) diagnostic_fee,COALESCE(cf.discount_percent,0) discount_percent,COALESCE(cf.actual_parts_cost,0) actual_parts_cost,COALESCE(ex.total_expenses,0) total_expenses,COALESCE(fin.commission_count,0) commission_count,COALESCE(fin.service_sheets_count,0) service_sheets_count,COALESCE(fin.paid,0) paid,COALESCE(fin.due,0) due,COALESCE(fin.paid_count,0) paid_count,COALESCE(fin.last_activity_at,cl.updated_at) last_activity_at FROM collaborator_properties cp JOIN collaborators co ON co.id=cp.collaborator_id JOIN ('.$pairs.') pair ON pair.collaborator_id=co.id AND pair.property_id=cp.property_id JOIN clients cl ON cl.id=pair.client_id AND cl.property_id=pair.property_id LEFT JOIN client_financials cf ON cf.client_id=cl.id LEFT JOIN (SELECT client_id,SUM(amount) total_expenses FROM client_expenses GROUP BY client_id) ex ON ex.client_id=cl.id LEFT JOIN ('.$totals.') fin ON fin.property_id=pair.property_id AND fin.collaborator_id=pair.collaborator_id AND fin.client_id=pair.client_id WHERE cp.property_id=? AND pair.property_id=? AND cl.is_active=1 ORDER BY co.name,cl.first_name,cl.last_name';
        $stmt=db()->prepare($sql);$stmt->execute([$p,$p]);$groups=[];$paid=0.0;$due=0.0;
        foreach($stmt->fetchAll()as$row){
            $collaboratorId=(string)$row['collaborator_id'];$clientPaidCurrency=round((float)$row['paid'],2);$clientDueCurrency=round((float)$row['due'],2);
            if((int)$row['paid_count']===0&&((bool)$row['finance_persisted']||(int)$row['commission_count']>0)&&!empty($row['commission_type'])){$subtotal=round((float)$row['work_price']+(float)$row['diagnostic_fee'],2);$totalValue=round(max(0,$subtotal-round($subtotal*(float)$row['discount_percent']/100,2)),2);$directCosts=round((float)$row['actual_parts_cost']+(float)$row['total_expenses'],2);$clientDueCurrency=commission_amount($totalValue,max(0,$totalValue-$directCosts),(string)$row['commission_type'],(float)$row['commission_value']);}
            $rate=max(0,(float)$row['exchange_rate_to_ron']);if($rate<=0)$rate=1.0;$clientPaid=round($clientPaidCurrency*$rate,2);$clientDue=round($clientDueCurrency*$rate,2);
            $clientTotal=round($clientPaid+$clientDue,2);
            if(!isset($groups[$collaboratorId]))$groups[$collaboratorId]=['collaboratorId'=>$collaboratorId,'collaboratorName'=>$row['collaborator_name'],'role'=>$row['role']?:null,'total'=>0.0,'paid'=>0.0,'due'=>0.0,'clientsCount'=>0,'clients'=>[]];
            $groups[$collaboratorId]['paid']+=$clientPaid;$groups[$collaboratorId]['due']+=$clientDue;$groups[$collaboratorId]['total']+=$clientTotal;$groups[$collaboratorId]['clientsCount']++;
            $groups[$collaboratorId]['clients'][]=['clientId'=>$row['client_id'],'clientName'=>$row['client_name'],'serviceSheetsCount'=>(int)$row['service_sheets_count'],'hasCommission'=>(int)$row['commission_count']>0,'lastActivityAt'=>iso_date($row['last_activity_at']),'paid'=>round($clientPaid,2),'due'=>round($clientDue,2),'total'=>round($clientTotal,2)];
            $paid+=$clientPaid;$due+=$clientDue;
        }
        foreach($groups as&$group){$group['paid']=round($group['paid'],2);$group['due']=round($group['due'],2);$group['total']=round($group['total'],2);}unset($group);
        respond(['currencyCode'=>'RON','paid'=>round($paid,2),'due'=>round($due,2),'total'=>round($paid+$due,2),'collaborators'=>array_values($groups)]);
    }

    if ($method==='PUT'&&$path==='/commissions/client-status') {
        $user=require_permission('collaborators.manage');$body=json_body();$propertyId=trim((string)($body['propertyId']??''));$collaboratorId=trim((string)($body['collaboratorId']??''));$clientId=trim((string)($body['clientId']??''));
        if($propertyId===''||$collaboratorId===''||$clientId===''||!array_key_exists('paid',$body)||!is_bool($body['paid']))fail('Proprietatea, colaboratorul, clientul și starea plății sunt obligatorii.',422);
        ensure_property($propertyId,$user);$client=get_client($clientId);if($client['propertyId']!==$propertyId)fail('Clientul nu aparține proprietății selectate.',422);
        $link=db()->prepare('SELECT c.name FROM collaborators c JOIN collaborator_properties cp ON cp.collaborator_id=c.id WHERE c.id=? AND cp.property_id=? LIMIT 1');$link->execute([uuid_bin($collaboratorId),uuid_bin($propertyId)]);$collaboratorName=$link->fetchColumn();if(!$collaboratorName)fail('Colaboratorul nu aparține proprietății selectate.',422);
        $paid=(bool)$body['paid'];$status=$paid?'PAID':'APPROVED';$now=now_utc();$pdo=db();$pdo->beginTransaction();
        try{
            $pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE')->execute([uuid_bin($clientId)]);$client=get_client($clientId);
            $select=$pdo->prepare('SELECT '.uuid_sql('id').' id,status,commission_value,paid_at FROM commissions WHERE property_id=? AND collaborator_id=? AND client_id=? AND is_active=1 AND status<>\'CANCELLED\' FOR UPDATE');$selectArgs=[uuid_bin($propertyId),uuid_bin($collaboratorId),uuid_bin($clientId)];$select->execute($selectArgs);$before=$select->fetchAll();
            if($paid){
                if(in_array($collaboratorId,array_column($client['collaborators']??[],'collaboratorId'),true))sync_client_commission($pdo,$client,client_financial_record($client),client_expenses($clientId),$user,false);
                $select->execute($selectArgs);$current=$select->fetchAll();if(!$current)fail('Nu există o fișă activă cu un comision pentru acest colaborator și client.',404);
                $update=$pdo->prepare("UPDATE commissions SET status='PAID',paid_at=COALESCE(paid_at,?),updated_at=?,updated_by=? WHERE property_id=? AND collaborator_id=? AND client_id=? AND is_active=1 AND status<>'CANCELLED' AND (status<>'PAID' OR paid_at IS NULL)");$update->execute([$now,$now,uuid_bin($user['id']),uuid_bin($propertyId),uuid_bin($collaboratorId),uuid_bin($clientId)]);
            }else{
                if(!$before)fail('Nu există o fișă activă cu un comision pentru acest colaborator și client.',404);
                $update=$pdo->prepare("UPDATE commissions SET status='APPROVED',paid_at=NULL,updated_at=?,updated_by=? WHERE property_id=? AND collaborator_id=? AND client_id=? AND is_active=1 AND status<>'CANCELLED' AND (status<>'APPROVED' OR paid_at IS NOT NULL)");$update->execute([$now,uuid_bin($user['id']),uuid_bin($propertyId),uuid_bin($collaboratorId),uuid_bin($clientId)]);
                if(in_array($collaboratorId,array_column($client['collaborators']??[],'collaboratorId'),true))sync_client_commission($pdo,$client,client_financial_record($client),client_expenses($clientId),$user,false);
            }
            $select->execute($selectArgs);$after=$select->fetchAll();$pdo->commit();
        }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        $beforeAmount=round((float)array_sum(array_map(fn($row)=>(float)$row['commission_value'],$before)),2);$afterAmount=round((float)array_sum(array_map(fn($row)=>(float)$row['commission_value'],$after)),2);
        $beforeStatuses=$before?implode(',',array_values(array_unique(array_column($before,'status')))):'NONE';$afterStatuses=$after?implode(',',array_values(array_unique(array_column($after,'status')))):'NONE';
        audit_log($paid?'COLLABORATOR_PAYMENT_MARKED_PAID':'COLLABORATOR_PAYMENT_MARKED_DUE','commissions',($paid?'Comisioane marcate achitate':'Comisioane marcate de achitat').' pentru '.$client['firstName'].' '.$client['lastName'].' / '.$collaboratorName,'Client',$clientId,$propertyId,['status'=>$beforeStatuses,'amount'=>$beforeAmount,'affectedCount'=>count($before)],['status'=>$afterStatuses,'amount'=>$afterAmount,'affectedCount'=>count($after)],$user);
        $paidAt=$paid&&$after?iso_date($after[0]['paid_at']):null;gshop_queue_client_service_sheet_pdf($clientId);respond(['updated'=>$update->rowCount(),'status'=>$status,'paid'=>$paid,'paidAt'=>$paidAt,'amount'=>$afterAmount]);
    }

    if ($method==='GET'&&$path==='/users') { $user=require_permission('users.view');$propertyId=(string)($_GET['propertyId']??'');ensure_property($propertyId,$user);$select='SELECT '.uuid_sql('u.id').' id,u.username,u.first_name,u.last_name,u.email,u.phone,u.role,u.permissions,u.is_active,u.last_login_at,u.created_at,u.updated_at,'.uuid_sql('u.created_by').' created_by,'.uuid_sql('u.updated_by').' updated_by FROM users u';$args=[];if($user['role']!=='ADMIN'){$select.=' JOIN user_properties up ON up.user_id=u.id WHERE up.property_id=?';$args[] = uuid_bin($propertyId);}$select.=' ORDER BY u.is_active DESC,u.first_name,u.last_name';$stmt=db()->prepare($select);$stmt->execute($args);$data=[];foreach($stmt->fetchAll()as$row){$item=entity_base($row);$item['permissions']=json_decode((string)$row['permissions'],true)?:[];$item['propertyIds']=[];$pstmt=db()->prepare('SELECT '.uuid_sql('property_id').' id FROM user_properties WHERE user_id=?');$pstmt->execute([uuid_bin($item['id'])]);$item['propertyIds']=array_column($pstmt->fetchAll(),'id');$data[]=$item;}respond($data); }
    if ($method==='POST'&&$path==='/users') { $admin=require_permission('users.manage');$body=json_body();if(strlen(trim((string)($body['username']??'')))<3||strlen((string)($body['password']??''))<8)fail('Utilizator invalid sau parolă prea scurtă.',422);$propertyIds=$body['propertyIds']??[];foreach($propertyIds as$propertyId)ensure_property($propertyId,$admin);$id=uuid_v4();$now=now_utc();$pdo=db();$pdo->beginTransaction();try{$pdo->prepare('INSERT INTO users (id,username,password_hash,first_name,last_name,email,phone,role,permissions,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)')->execute([uuid_bin($id),trim($body['username']),password_hash($body['password'],PASSWORD_DEFAULT),trim((string)$body['firstName']),trim((string)$body['lastName']),$body['email']??null,$body['phone']??null,$body['role']??'OPERATOR',json_encode($body['permissions']??[]),$now,$now,uuid_bin($admin['id']),uuid_bin($admin['id'])]);$link=$pdo->prepare('INSERT INTO user_properties (user_id,property_id) VALUES (?,?)');foreach($propertyIds as$propertyId)$link->execute([uuid_bin($id),uuid_bin($propertyId)]);$pdo->commit();audit_log('USER_CREATED','users','Utilizator creat: '.$body['username'],'User',$id,$propertyIds[0]??null,null,array_diff_key($body,['password'=>true]),$admin);respond(user_record($id),201);}catch(PDOException$e){$pdo->rollBack();if((int)$e->errorInfo[1]===1062)fail('Numele de utilizator există deja.',409);throw$e;} }
    if ($method==='PUT'&&path_match('/users/{id}/permissions',$path,$params)) {
        $admin=require_permission('roles.manage');$body=json_body();$permissions=$body['permissions']??null;
        if(!is_array($permissions))fail('Lista permisiunilor este invalidă.',422);
        $before=user_record($params['id']);$propertyIds=array_key_exists('propertyIds',$body)?$body['propertyIds']:$before['propertyIds'];
        if(!is_array($propertyIds))fail('Lista proprietăților este invalidă.',422);
        $propertyIds=array_values(array_unique(array_map(fn($value)=>trim((string)$value),$propertyIds)));
        foreach($propertyIds as$propertyId){if($propertyId==='')fail('Lista proprietăților este invalidă.',422);ensure_property($propertyId,$admin);ensure_existing_property($propertyId);}
        $permissions=array_values(array_unique(array_map(fn($value)=>trim((string)$value),$permissions)));$now=now_utc();$pdo=db();$pdo->beginTransaction();
        try{
            $pdo->prepare('UPDATE users SET permissions=?,updated_at=?,updated_by=? WHERE id=?')->execute([json_encode($permissions),$now,uuid_bin($admin['id']),uuid_bin($params['id'])]);
            $pdo->prepare('DELETE FROM user_properties WHERE user_id=?')->execute([uuid_bin($params['id'])]);
            $link=$pdo->prepare('INSERT INTO user_properties (user_id,property_id) VALUES (?,?)');foreach($propertyIds as$propertyId)$link->execute([uuid_bin($params['id']),uuid_bin($propertyId)]);
            $pdo->commit();
        }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        $after=user_record($params['id']);audit_log('USER_ACCESS_UPDATED','users','Acces și permisiuni actualizate pentru @'.$after['username'],'User',$after['id'],$after['propertyIds'][0]??($before['propertyIds'][0]??null),$before,$after,$admin);respond($after);
    }
    if ($method==='PUT'&&path_match('/users/{id}/password',$path,$params)) { $admin=require_permission('users.manage');$body=json_body();$password=(string)($body['password']??'');if(strlen($password)<8)fail('Parola trebuie să aibă minimum 8 caractere.',422);$target=user_record($params['id']);db()->prepare('UPDATE users SET password_hash=?,updated_at=?,updated_by=? WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),now_utc(),uuid_bin($admin['id']),uuid_bin($params['id'])]);db()->prepare('UPDATE refresh_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')->execute([now_utc(),uuid_bin($params['id'])]);audit_log('USER_PASSWORD_RESET','users','Parolă resetată pentru @'.$target['username'],'User',$target['id'],$target['propertyIds'][0]??null,null,null,$admin);respond(['changed'=>true]); }
    if ($method==='DELETE'&&path_match('/users/{id}',$path,$params)) { $admin=require_permission('users.manage');if($params['id']===$admin['id'])fail('Nu îți poți dezactiva propriul cont.',422);$target=user_record($params['id']);db()->prepare('UPDATE users SET is_active=0,updated_at=?,updated_by=? WHERE id=?')->execute([now_utc(),uuid_bin($admin['id']),uuid_bin($params['id'])]);db()->prepare('UPDATE refresh_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')->execute([now_utc(),uuid_bin($params['id'])]);audit_log('USER_DEACTIVATED','users','Utilizator dezactivat: @'.$target['username'],'User',$target['id'],$target['propertyIds'][0]??null,$target,['isActive'=>false],$admin);respond(['deleted'=>true]); }

    if ($method==='GET'&&$path==='/audit-logs') { $user=require_permission('audit.view');$propertyId=(string)($_GET['propertyId']??'');if($propertyId)ensure_property($propertyId,$user);$where=[];$args=[];if($propertyId){$where[]='a.property_id=?';$args[]=uuid_bin($propertyId);}if(!empty($_GET['entityId'])){$where[]='a.entity_id=?';$args[]=uuid_bin((string)$_GET['entityId']);}$sql='SELECT '.uuid_sql('a.id').' id,'.uuid_sql('a.user_id').' user_id,CONCAT(u.first_name,\' \',u.last_name) user_name,'.uuid_sql('a.property_id').' property_id,a.action,a.module,a.entity_type,'.uuid_sql('a.entity_id').' entity_id,a.summary,a.before_data,a.after_data,a.ip_address,a.device,a.created_at FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id'.($where?' WHERE '.implode(' AND ',$where):'').' ORDER BY a.created_at DESC LIMIT 200';$stmt=db()->prepare($sql);$stmt->execute($args);$data=[];foreach($stmt->fetchAll()as$row){$ip=$row['ip_address'];unset($row['ip_address']);$item=entity_base($row);$item['before']=$row['before_data']?json_decode($row['before_data'],true):null;$item['after']=$row['after_data']?json_decode($row['after_data'],true):null;unset($item['beforeData'],$item['afterData']);$item['ipAddress']=$ip?inet_ntop($ip):null;$item['updatedAt']=$item['createdAt'];$item['createdBy']=$item['userId']??'00000000-0000-4000-8000-000000000001';$item['updatedBy']=$item['createdBy'];$item['isActive']=true;$data[]=$item;}respond(['data'=>$data,'page'=>1,'pageSize'=>200,'total'=>count($data),'totalPages'=>1]); }
    if ($method==='DELETE'&&$path==='/audit-logs') {
        $user=require_permission('audit.view');if($user['role']!=='ADMIN')fail('Doar administratorul poate goli jurnalul de audit.',403);
        $propertyId=validated_uuid((string)($_GET['propertyId']??''),'Proprietatea');ensure_property($propertyId,$user);$pdo=db();$body=json_body();$ids=$body['ids']??null;
        if($ids!==null&&!is_array($ids))fail('Selecția jurnalului este invalidă.',422);
        $validatedIds=[];foreach(($ids??[])as$id)$validatedIds[]=validated_uuid($id,'Înregistrarea de audit');if(count($validatedIds)>200)fail('Poți șterge maximum 200 de înregistrări simultan.',422);
        if($validatedIds){$placeholders=implode(',',array_fill(0,count($validatedIds),'?'));$args=[uuid_bin($propertyId),...array_map('uuid_bin',$validatedIds)];$delete=$pdo->prepare("DELETE FROM audit_logs WHERE property_id=? AND id IN ($placeholders)");$delete->execute($args);$deleted=$delete->rowCount();$scope='înregistrările selectate';}
        else{$delete=$pdo->prepare('DELETE FROM audit_logs WHERE property_id=?');$delete->execute([uuid_bin($propertyId)]);$deleted=$delete->rowCount();$scope='întregul jurnal';}
        audit_log('AUDIT_LOG_CLEARED','audit','Administratorul a șters '.$scope,'Property',$propertyId,$propertyId,['deletedEntries'=>$deleted,'scope'=>$scope],['retainedSecurityEntry'=>true],$user);
        respond(['deleted'=>$deleted]);
    }

    if ($method==='GET'&&$path==='/reports') {
        $user=require_permission('reports.view');
        $propertyId=(string)($_GET['propertyId']??'');
        ensure_property($propertyId,$user);
        $p=uuid_bin($propertyId);$pdo=db();
        $scalar=function(string$sql,array$args=[])use($pdo){$s=$pdo->prepare($sql);$s->execute($args);return$s->fetchColumn();};

        $period=strtoupper(trim((string)($_GET['period']??'1M')));
        if(!in_array($period,['TODAY','7D','1M','1Y','TOTAL','CUSTOM'],true))fail('Perioada raportului este invalidă.',422);
        $utc=new DateTimeZone('UTC');$now=new DateTimeImmutable('now',$utc);$today=$now->setTime(0,0);$bucket='DAY';
        if($period==='TODAY'){$periodStart=$today;$periodEnd=$today->modify('+1 day');$bucket='HOUR';}
        elseif($period==='7D'){$periodStart=$today->modify('-6 days');$periodEnd=$today->modify('+1 day');}
        elseif($period==='1M'){$periodStart=$today->modify('-29 days');$periodEnd=$today->modify('+1 day');}
        elseif($period==='1Y'){$periodStart=$today->modify('first day of this month')->modify('-11 months');$periodEnd=$today->modify('first day of next month');$bucket='MONTH';}
        elseif($period==='TOTAL'){
            $oldest=(string)($scalar('SELECT MIN(created_at) FROM clients WHERE property_id=? AND is_active=1',[$p])?:'');
            $periodStart=$oldest!==''?new DateTimeImmutable($oldest,$utc):$today->modify('first day of this month');
            $periodStart=$periodStart->modify('first day of january')->setTime(0,0);$periodEnd=$today->modify('first day of next year');$bucket='YEAR';
        }else{
            $from=trim((string)($_GET['from']??''));$to=trim((string)($_GET['to']??''));
            $periodStart=DateTimeImmutable::createFromFormat('!Y-m-d',$from,$utc);$customEnd=DateTimeImmutable::createFromFormat('!Y-m-d',$to,$utc);
            if(!$periodStart||!$customEnd||$customEnd<$periodStart)fail('Intervalul personalizat este invalid.',422);
            $periodEnd=$customEnd->modify('+1 day');$days=(int)$periodStart->diff($periodEnd)->format('%a');
            if($days>3660)fail('Intervalul personalizat poate avea maximum 10 ani.',422);
            $bucket=$days<=31?'DAY':($days<=180?'WEEK':($days<=730?'MONTH':'YEAR'));
        }

        $generated=(int)$scalar("SELECT COUNT(*) FROM client_qr WHERE property_id=? AND is_active=1 AND status IN ('GENERATED','SENT')",[$p]);
        $used=(int)$scalar("SELECT COUNT(*) FROM client_qr WHERE property_id=? AND is_active=1 AND status='USED'",[$p]);
        $revenue=(float)$scalar("SELECT COALESCE(SUM(total_cost),0) FROM service_sheets WHERE property_id=? AND is_active=1 AND status<>'CANCELLED'",[$p]);
        $costs=(float)$scalar("SELECT COALESCE(SUM(direct_costs),0) FROM service_sheets WHERE property_id=? AND is_active=1 AND status<>'CANCELLED'",[$p]);
        $commissionTotal=(float)$scalar("SELECT COALESCE(SUM(commission_value),0) FROM commissions WHERE property_id=? AND is_active=1 AND status<>'CANCELLED'",[$p]);
        $payments=(float)$scalar("SELECT COALESCE(SUM(commission_value),0) FROM commissions WHERE property_id=? AND is_active=1 AND status='PAID' AND paid_at IS NOT NULL",[$p]);
        $clients=(int)$scalar('SELECT COUNT(*) FROM clients WHERE property_id=? AND is_active=1',[$p]);
        $clientsWaiting=(int)$scalar("SELECT COUNT(DISTINCT client_id) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS')",[$p]);
        $revenueOnHold=(float)$scalar("SELECT COALESCE(SUM(total_cost),0) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS')",[$p]);
        $collaboratorOnHold=(float)$scalar("SELECT COALESCE(SUM(commission_value),0) FROM commissions WHERE property_id=? AND is_active=1 AND (status IN ('ESTIMATED','CALCULATED','APPROVED') OR (status='PAID' AND paid_at IS NULL))",[$p]);
        $collaboratorTotal=$payments+$collaboratorOnHold;$gshopNet=$revenue-$costs-$payments;
        $metrics=['clientsTotal'=>$clients,'totalRevenue'=>round($revenue,2),'clientsWaiting'=>$clientsWaiting,'revenueOnHold'=>round($revenueOnHold,2),'gshopNet'=>round($gshopNet,2),'collaboratorTotal'=>round($collaboratorTotal,2),'collaboratorPaid'=>round($payments,2),'collaboratorOnHold'=>round($collaboratorOnHold,2),'clientsNew'=>(int)$scalar('SELECT COUNT(*) FROM clients WHERE property_id=? AND is_active=1 AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)',[$p]),'serviceSheetsOpen'=>(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS')",[$p]),'serviceSheetsInProgress'=>(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status='IN_PROGRESS'",[$p]),'serviceSheetsCompleted'=>(int)$scalar("SELECT COUNT(*) FROM service_sheets WHERE property_id=? AND is_active=1 AND status IN ('COMPLETED','DELIVERED')",[$p]),'usersActive'=>(int)$scalar('SELECT COUNT(*) FROM user_properties up JOIN users u ON u.id=up.user_id WHERE up.property_id=? AND u.is_active=1',[$p]),'collaboratorsActive'=>(int)$scalar('SELECT COUNT(*) FROM collaborator_properties cp JOIN collaborators c ON c.id=cp.collaborator_id WHERE cp.property_id=? AND c.is_active=1',[$p]),'qrGenerated'=>$generated,'qrUsed'=>$used,'estimatedRevenue'=>$revenue,'collaboratorCommissions'=>$commissionTotal,'collaboratorPayments'=>$payments];

        $monthNames=[1=>'Ian',2=>'Feb',3=>'Mar',4=>'Apr',5=>'Mai',6=>'Iun',7=>'Iul',8=>'Aug',9=>'Sep',10=>'Oct',11=>'Noi',12=>'Dec'];
        $series=[];$cursor=$periodStart;$seriesEnd=$period==='TODAY'?$now->setTime((int)$now->format('H'),0)->modify('+1 hour'):$periodEnd;$seriesRevenue=0.0;$seriesCosts=0.0;$seriesCommission=0.0;
        while($cursor<$seriesEnd&&count($series)<80){
            if($bucket==='HOUR')$next=$cursor->modify('+1 hour');elseif($bucket==='WEEK')$next=$cursor->modify('+7 days');elseif($bucket==='MONTH')$next=$cursor->modify('first day of next month');elseif($bucket==='YEAR')$next=$cursor->modify('first day of january next year');else$next=$cursor->modify('+1 day');
            if($next>$seriesEnd)$next=$seriesEnd;
            $startSql=$cursor->format('Y-m-d H:i:s');$endSql=$next->format('Y-m-d H:i:s');$args=[$p,$startSql,$endSql];
            $bucketRevenue=(float)$scalar("SELECT COALESCE(SUM(total_cost),0) FROM service_sheets WHERE property_id=? AND is_active=1 AND status<>'CANCELLED' AND created_at>=? AND created_at<?",$args);
            $bucketCosts=(float)$scalar("SELECT COALESCE(SUM(direct_costs),0) FROM service_sheets WHERE property_id=? AND is_active=1 AND status<>'CANCELLED' AND created_at>=? AND created_at<?",$args);
            $bucketCommission=(float)$scalar("SELECT COALESCE(SUM(commission_value),0) FROM commissions WHERE property_id=? AND is_active=1 AND status='PAID' AND paid_at IS NOT NULL AND created_at>=? AND created_at<?",$args);
            $bucketClients=(int)$scalar('SELECT COUNT(*) FROM clients WHERE property_id=? AND is_active=1 AND created_at>=? AND created_at<?',$args);
            $label=$bucket==='HOUR'?$cursor->format('H:i'):($bucket==='MONTH'?$monthNames[(int)$cursor->format('n')].' '.$cursor->format('y'):($bucket==='YEAR'?$cursor->format('Y'):$cursor->format('d').' '.$monthNames[(int)$cursor->format('n')]));
            $series[]=['label'=>$label,'revenue'=>round($bucketRevenue,2),'costs'=>round($bucketCosts,2),'net'=>round($bucketRevenue-$bucketCosts-$bucketCommission,2),'clients'=>$bucketClients,'isCurrent'=>$now>=$cursor&&$now<$next];
            $seriesRevenue+=$bucketRevenue;$seriesCosts+=$bucketCosts;$seriesCommission+=$bucketCommission;$cursor=$next;
        }

        $startSql=$periodStart->format('Y-m-d H:i:s');$endSql=$periodEnd->format('Y-m-d H:i:s');
        $periodClientsTotal=(int)$scalar('SELECT COUNT(*) FROM clients WHERE property_id=? AND is_active=1 AND created_at>=? AND created_at<?',[$p,$startSql,$endSql]);
        $periodFinanceSql="SELECT ".uuid_sql('c.id')." client_id,COALESCE(cf.currency_code,'RON') currency_code,COALESCE(cf.exchange_rate_to_ron,1) exchange_rate_to_ron,COALESCE(cf.work_price,0) work_price,COALESCE(cf.diagnostic_fee,0) diagnostic_fee,COALESCE(cf.advance_paid,0) advance_paid,COALESCE(cf.discount_percent,0) discount_percent,COALESCE(cf.actual_parts_cost,0) actual_parts_cost,COALESCE(cf.payment_status,'UNPAID') payment_status,COALESCE(ex.total_expenses,0) total_expenses,COALESCE(cm.commission_count,0) commission_count,COALESCE(cm.paid_count,0) paid_count,COALESCE(cm.commission_total,0) commission_total,COALESCE(cm.paid_total,0) paid_total,COALESCE(cm.due_total,0) due_total FROM clients c LEFT JOIN client_financials cf ON cf.client_id=c.id LEFT JOIN (SELECT client_id,SUM(amount) total_expenses FROM client_expenses GROUP BY client_id) ex ON ex.client_id=c.id LEFT JOIN (SELECT client_id,COUNT(*) commission_count,SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN 1 ELSE 0 END) paid_count,SUM(commission_value) commission_total,SUM(CASE WHEN status='PAID' AND paid_at IS NOT NULL THEN commission_value ELSE 0 END) paid_total,SUM(CASE WHEN status IN ('ESTIMATED','CALCULATED','APPROVED') OR (status='PAID' AND paid_at IS NULL) THEN commission_value ELSE 0 END) due_total FROM commissions WHERE is_active=1 AND status<>'CANCELLED' GROUP BY client_id) cm ON cm.client_id=c.id WHERE c.property_id=? AND c.is_active=1 AND (cf.client_id IS NOT NULL OR ex.client_id IS NOT NULL) AND COALESCE(cf.updated_at,c.updated_at,c.created_at)>=? AND COALESCE(cf.updated_at,c.updated_at,c.created_at)<?";
        $periodFinanceStmt=$pdo->prepare($periodFinanceSql);$periodFinanceStmt->execute([$p,$startSql,$endSql]);
        $periodRevenueRon=0.0;$periodHoldRon=0.0;$periodNetRon=0.0;$periodWaiting=0;$periodCollaboratorPaidRon=0.0;$periodCollaboratorOnHoldRon=0.0;
        foreach($periodFinanceStmt->fetchAll()as$row){
            $rate=(float)$row['exchange_rate_to_ron'];$subtotal=round((float)$row['work_price']+(float)$row['diagnostic_fee'],2);$discountAmount=round($subtotal*(float)$row['discount_percent']/100,2);$total=round(max(0,$subtotal-$discountAmount),2);
            $received=$row['payment_status']==='PAID'?$total:round(min((float)$row['advance_paid'],$total),2);$remaining=round(max(0,$total-$received),2);$internal=round((float)$row['actual_parts_cost']+(float)$row['total_expenses'],2);
            $commission=round((float)$row['commission_total'],2);
            if((int)$row['commission_count']===0){foreach(client_collaborator_assignments((string)$row['client_id'])as$assignment)$commission+=commission_amount($total,max(0,$total-$internal),(string)$assignment['commissionType'],(float)$assignment['commissionValue']);$commission=round($commission,2);}
            if((int)$row['commission_count']>0){$periodCollaboratorPaidRon+=round((float)$row['paid_total'],2)*$rate;$periodCollaboratorOnHoldRon+=round((float)$row['due_total'],2)*$rate;}else$periodCollaboratorOnHoldRon+=$commission*$rate;
            $periodRevenueRon+=$received*$rate;$periodHoldRon+=$remaining*$rate;$periodNetRon+=round($received-$internal-(float)$row['paid_total'],2)*$rate;if($remaining>0.004)$periodWaiting++;
        }
        $periodLegacyStmt=$pdo->prepare("SELECT COALESCE(SUM(CASE WHEN s.status IN ('COMPLETED','DELIVERED') THEN s.total_cost ELSE 0 END),0) total_revenue,COALESCE(SUM(CASE WHEN s.status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS') THEN s.total_cost ELSE 0 END),0) revenue_on_hold,COALESCE(SUM(s.direct_costs),0) direct_costs,COUNT(DISTINCT CASE WHEN s.status IN ('NEW','WAITING','VERIFYING','IN_PROGRESS','WAITING_PARTS') THEN s.client_id END) clients_waiting FROM service_sheets s JOIN clients c ON c.id=s.client_id LEFT JOIN client_financials cf ON cf.client_id=c.id WHERE s.property_id=? AND c.is_active=1 AND cf.client_id IS NULL AND NOT EXISTS(SELECT 1 FROM client_expenses e WHERE e.client_id=c.id) AND s.is_active=1 AND s.status<>'CANCELLED' AND s.created_at>=? AND s.created_at<?");$periodLegacyStmt->execute([$p,$startSql,$endSql]);$periodLegacy=$periodLegacyStmt->fetch();
        $periodLegacyCommissionStmt=$pdo->prepare("SELECT COALESCE(SUM(CASE WHEN co.status='PAID' AND co.paid_at IS NOT NULL THEN co.commission_value ELSE 0 END),0) paid,COALESCE(SUM(CASE WHEN co.status IN ('ESTIMATED','CALCULATED','APPROVED') OR (co.status='PAID' AND co.paid_at IS NULL) THEN co.commission_value ELSE 0 END),0) on_hold FROM commissions co JOIN clients c ON c.id=co.client_id LEFT JOIN client_financials cf ON cf.client_id=c.id WHERE co.property_id=? AND c.is_active=1 AND cf.client_id IS NULL AND NOT EXISTS(SELECT 1 FROM client_expenses e WHERE e.client_id=c.id) AND co.is_active=1 AND co.status<>'CANCELLED' AND co.created_at>=? AND co.created_at<?");$periodLegacyCommissionStmt->execute([$p,$startSql,$endSql]);$periodLegacyCommission=$periodLegacyCommissionStmt->fetch();
        $periodRevenue=$periodRevenueRon+(float)$periodLegacy['total_revenue'];$periodRevenueOnHold=$periodHoldRon+(float)$periodLegacy['revenue_on_hold'];$periodClientsWaiting=$periodWaiting+(int)$periodLegacy['clients_waiting'];
        $periodCollaboratorPaid=$periodCollaboratorPaidRon+(float)$periodLegacyCommission['paid'];$periodCollaboratorOnHold=$periodCollaboratorOnHoldRon+(float)$periodLegacyCommission['on_hold'];$periodCollaboratorTotal=$periodCollaboratorPaid+$periodCollaboratorOnHold;
        $periodGshopNet=$periodNetRon+((float)$periodLegacy['total_revenue']-(float)$periodLegacy['direct_costs']-(float)$periodLegacyCommission['paid']);
        $periodMetrics=['clientsTotal'=>$periodClientsTotal,'clientsWaiting'=>$periodClientsWaiting,'gshopNet'=>round($periodGshopNet,2),'revenueOnHold'=>round($periodRevenueOnHold,2),'totalRevenue'=>round($periodRevenue,2),'collaboratorTotal'=>round($periodCollaboratorTotal,2),'collaboratorPaid'=>round($periodCollaboratorPaid,2),'collaboratorOnHold'=>round($periodCollaboratorOnHold,2)];
        $stmt=$pdo->prepare('SELECT '.uuid_sql('co.id').' id,'.uuid_sql('co.collaborator_id').' collaborator_id,collab.name collaborator_name,'.uuid_sql('co.client_id').' client_id,CONCAT(cl.first_name,\' \',cl.last_name) client_name,'.uuid_sql('co.service_sheet_id').' service_sheet_id,s.number service_sheet_number,'.uuid_sql('co.intervention_id').' intervention_id,'.uuid_sql('co.property_id').' property_id,co.total_value,co.direct_costs,co.net_value,co.type,co.rate_or_amount,co.commission_value,co.status,co.paid_at,co.is_active,co.created_at,co.updated_at,'.uuid_sql('co.created_by').' created_by,'.uuid_sql('co.updated_by').' updated_by FROM commissions co JOIN collaborators collab ON collab.id=co.collaborator_id JOIN clients cl ON cl.id=co.client_id LEFT JOIN service_sheets s ON s.id=co.service_sheet_id WHERE co.property_id=? AND co.is_active=1 AND co.created_at>=? AND co.created_at<? ORDER BY co.created_at DESC LIMIT 100');
        $stmt->execute([$p,$startSql,$endSql]);
        $commissions=array_map(function($row){$item=entity_base($row);foreach(['totalValue','directCosts','netValue','rateOrAmount','commissionValue']as$key)$item[$key]=(float)$item[$key];return$item;},$stmt->fetchAll());
        $revenueByMonth=array_map(fn($item)=>['label'=>$item['label'],'value'=>$item['revenue']],$series);
        respond(['metrics'=>$metrics,'periodMetrics'=>$periodMetrics,'commissions'=>$commissions,'revenueByMonth'=>$revenueByMonth,'series'=>$series,'period'=>['key'=>$period,'from'=>$periodStart->format('Y-m-d'),'to'=>$periodEnd->modify('-1 second')->format('Y-m-d')],'totalCosts'=>round($seriesCosts,2),'netProfit'=>round($seriesRevenue-$seriesCosts-$seriesCommission,2)]);
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
