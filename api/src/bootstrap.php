<?php
declare(strict_types=1);

function load_env(string $path): void {
    if (!is_file($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        [$key, $value] = array_pad(explode('=', $line, 2), 2, '');
        $value = trim($value, " \t\n\r\0\x0B\"'");
        if (getenv(trim($key)) === false) putenv(trim($key) . '=' . $value);
    }
}

load_env(dirname(__DIR__) . '/.env');
date_default_timezone_set('UTC');

function env_value(string $key, ?string $default = null): string {
    $value = getenv($key);
    if ($value === false || $value === '') {
        if ($default !== null) return $default;
        throw new RuntimeException("Missing environment variable: {$key}");
    }
    return $value;
}

function db(): PDO {
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', env_value('DB_HOST'), env_value('DB_PORT', '3306'), env_value('DB_NAME'));
    $pdo = new PDO($dsn, env_value('DB_USER'), env_value('DB_PASS'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function now_utc(): string { return gmdate('Y-m-d H:i:s'); }
function iso_date(?string $value): ?string { return $value ? gmdate('c', strtotime($value . ' UTC')) : null; }
function uuid_v4(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    $hex = bin2hex($data);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}
function uuid_bin(string $uuid): string {
    $hex = str_replace('-', '', strtolower($uuid));
    if (!preg_match('/^[0-9a-f]{32}$/', $hex)) throw new InvalidArgumentException('ID invalid.');
    return hex2bin($hex);
}
function bin_uuid(?string $binary): ?string {
    if ($binary === null) return null;
    $hex = bin2hex($binary);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}
function uuid_sql(string $column): string {
    return "LOWER(CONCAT(SUBSTR(HEX({$column}),1,8),'-',SUBSTR(HEX({$column}),9,4),'-',SUBSTR(HEX({$column}),13,4),'-',SUBSTR(HEX({$column}),17,4),'-',SUBSTR(HEX({$column}),21)))";
}
function base64url_encode(string $data): string { return rtrim(strtr(base64_encode($data), '+/', '-_'), '='); }
function base64url_decode(string $data): string { return base64_decode(strtr($data, '-_', '+/')) ?: ''; }
function json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) fail('Corpul JSON nu este valid.', 400);
    return $data;
}
function respond($data = null, int $status = 200, array $meta = []): void {
    if ($status < 400 && function_exists('gshop_flush_pending_service_sheet_pdfs')) {
        gshop_flush_pending_service_sheet_pdfs();
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['data' => $data], $meta), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $message, int $status = 400, ?array $errors = null): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['message' => $message, 'errors' => $errors], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function request_ip(): ?string {
    $raw = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
    return $raw ? @inet_pton(explode(',', $raw)[0]) ?: null : null;
}
function public_base_url(): string {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'reparatiicalculatoare-bucuresti.ro';
    $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/app-api/index.php');
    $base = rtrim(dirname($script), '/.');
    return $scheme . '://' . $host . $base;
}
function camel_row(array $row): array {
    $out = [];
    foreach ($row as $key => $value) {
        $camel = lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $key))));
        if (preg_match('/(_at|At)$/', $key) || preg_match('/At$/', $camel)) $value = is_string($value) ? iso_date($value) : $value;
        if (in_array($key, ['is_active'], true)) $value = (bool)$value;
        $out[$camel] = $value;
    }
    return $out;
}
function changed_fields(array $before, array $after): array {
    $old = []; $new = [];
    foreach ($after as $key => $value) {
        if (in_array($key, ['password', 'password_hash', 'refreshToken', 'signature'], true)) continue;
        if (!array_key_exists($key, $before) || (string)$before[$key] !== (string)$value) { $old[$key] = $before[$key] ?? null; $new[$key] = $value; }
    }
    return [$old, $new];
}
