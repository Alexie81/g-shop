<?php
declare(strict_types=1);
require __DIR__ . '/src/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
if (!hash_equals(env_value('INSTALL_TOKEN'), (string)($_GET['token'] ?? ''))) fail('Token de instalare invalid.', 403);
if (is_file(__DIR__ . '/.installed')) fail('Instalarea a fost deja finalizată.', 409);

try {
    $pdo = db();
    $schema = file_get_contents(__DIR__ . '/schema.sql');
    if (!$schema) throw new RuntimeException('Schema nu poate fi citită.');
    $statements = preg_split('/;\s*(?=(?:SET|CREATE)\s)/i', $schema) ?: [];
    foreach ($statements as $statement) {
        $statement = trim($statement);
        if ($statement !== '') $pdo->exec(rtrim($statement, ';') . ';');
    }

    $now = now_utc();
    $adminId = '00000000-0000-4000-8000-000000000001';
    $serviceId = '11111111-1111-4111-8111-111111111111';
    $shopId = '22222222-2222-4222-8222-222222222222';
    $permissions = [
        'dashboard.view','clients.view','clients.create','clients.update','clients.delete','qr.generate','qr.scan','qr.share',
        'service_sheets.view','service_sheets.create','service_sheets.update','service_sheets.sign',
        'collaborators.view','collaborators.manage','users.view','users.manage','roles.manage','reports.view','financials.view','audit.view','settings.manage'
    ];

    $pdo->beginTransaction();
    $property = $pdo->prepare('INSERT INTO properties (id,name,domain,type,enabled_modules,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,1,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), enabled_modules=VALUES(enabled_modules), updated_at=VALUES(updated_at)');
    $property->execute([uuid_bin($serviceId), 'Reparații Calculatoare București', 'reparatiicalculatoare-bucuresti.ro', 'SERVICE', json_encode(['dashboard','clients','qr','serviceSheets','collaborators','users','reports'], JSON_UNESCAPED_UNICODE), $now, $now, uuid_bin($adminId), uuid_bin($adminId)]);
    $property->execute([uuid_bin($shopId), 'Calculatoare Profesionale', 'calculatoareprofesionale.ro', 'SHOP', json_encode(['shopComingSoon']), $now, $now, uuid_bin($adminId), uuid_bin($adminId)]);

    $admin = $pdo->prepare('INSERT INTO users (id,username,password_hash,first_name,last_name,email,role,permissions,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?, ?,1,?,?,?,?) ON DUPLICATE KEY UPDATE permissions=VALUES(permissions), is_active=1, updated_at=VALUES(updated_at)');
    $admin->execute([uuid_bin($adminId), 'admin', password_hash('admin', PASSWORD_DEFAULT), 'Administrator', 'G-Shop', 'admin@reparatiicalculatoare-bucuresti.ro', 'ADMIN', json_encode($permissions), $now, $now, uuid_bin($adminId), uuid_bin($adminId)]);
    $access = $pdo->prepare('INSERT IGNORE INTO user_properties (user_id,property_id) VALUES (?,?)');
    $access->execute([uuid_bin($adminId), uuid_bin($serviceId)]);
    $access->execute([uuid_bin($adminId), uuid_bin($shopId)]);

    $clientCount = (int)$pdo->query('SELECT COUNT(*) FROM clients')->fetchColumn();
    if ($clientCount === 0) {
        $clients = [
            ['Ion','Popescu','0765123456','ion.popescu@email.com','București','Sector 3','ACTIVE'],
            ['Maria','Ionescu','0722987654','maria.ionescu@email.com','București','Sector 2','NEW'],
            ['Alexandru','Stan','0751234567','alex.stan@email.com','București','Sector 6','ACTIVE'],
            ['Ana','Constantin','0744333222','ana.constantin@email.com','București','Sector 1','REVIEW_REQUIRED'],
        ];
        $insertClient = $pdo->prepare('INSERT INTO clients (id,property_id,first_name,last_name,phone,email,city,county,status,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)');
        $insertQr = $pdo->prepare("INSERT INTO client_qr (id,client_id,property_id,token,status,generated_at,used_at,generated_by,is_active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?, ?,1,?,?,?,?)");
        foreach ($clients as $index => $row) {
            $clientId = uuid_v4();
            $insertClient->execute([uuid_bin($clientId), uuid_bin($serviceId), $row[0], $row[1], $row[2], $row[3], $row[4], $row[5], $row[6], $now, $now, uuid_bin($adminId), uuid_bin($adminId)]);
            if ($index !== 1) {
                $used = $index === 3;
                $insertQr->execute([uuid_bin(uuid_v4()), uuid_bin($clientId), uuid_bin($serviceId), uuid_bin(uuid_v4()), $used ? 'USED' : 'GENERATED', $now, $used ? $now : null, uuid_bin($adminId), $now, $now, uuid_bin($adminId), uuid_bin($adminId)]);
            }
        }
    }
    $pdo->commit();
    file_put_contents(__DIR__ . '/.installed', gmdate('c'));
    respond(['installed' => true, 'message' => 'G-Shop API instalat.', 'initialUser' => 'admin']);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    fail('Instalarea a eșuat: ' . $error->getMessage(), 500);
}
