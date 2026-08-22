<?php
declare(strict_types=1);

const GSHOP_SALES_DOCUMENT_PDF_VERSION = 3;

final class SalesDocumentSyncConflict extends RuntimeException {}

function ensure_sales_documents_table(PDO $pdo): void {
    static $ready = false;
    if ($ready) return;
    ensure_sales_sheets_table($pdo);
    $pdo->exec("CREATE TABLE IF NOT EXISTS sales_sheet_documents (
        id BINARY(16) PRIMARY KEY,
        sales_sheet_id BINARY(16) NOT NULL,
        property_id BINARY(16) NOT NULL,
        type ENUM('FINAL_ESTIMATE','WARRANTY') NOT NULL,
        number VARCHAR(50) NOT NULL,
        status ENUM('PUBLISHED') NOT NULL DEFAULT 'PUBLISHED',
        document_at DATETIME NOT NULL,
        agreement_at DATETIME NULL,
        agreement_status ENUM('ACCEPTED','REFUSED') NULL,
        technical_assessment TEXT NULL,
        final_notes TEXT NULL,
        warranty_period VARCHAR(120) NULL,
        warranty_start_at DATETIME NULL,
        warranty_end_at DATETIME NULL,
        warranty_remediation VARCHAR(160) NULL,
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
        UNIQUE KEY uq_sales_document_type (sales_sheet_id,type),
        INDEX idx_sales_documents_property (property_id,status,is_active),
        CONSTRAINT fk_sales_document_sheet FOREIGN KEY (sales_sheet_id) REFERENCES sales_sheets(id) ON DELETE CASCADE,
        CONSTRAINT fk_sales_document_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $ready = true;
}

function sales_document_definitions(): array {
    return [
        'FINAL_ESTIMATE'=>['label'=>'Deviz final','prefix'=>'DV','filePrefix'=>'DEVIZ-FINAL'],
        'WARRANTY'=>['label'=>'Certificat de garanție','prefix'=>'GAR','filePrefix'=>'CERTIFICAT-GARANTIE'],
    ];
}

function validated_sales_document_type(mixed $value): string {
    $type = strtoupper(str_replace('-', '_', trim((string)$value)));
    if (!array_key_exists($type, sales_document_definitions())) fail('Tipul documentului Shop nu este valid.', 422);
    return $type;
}

function sales_document_select(): string {
    return 'SELECT '.uuid_sql('d.id').' id,'.uuid_sql('d.sales_sheet_id').' sales_sheet_id,'.uuid_sql('d.property_id').' property_id,d.type,d.number,d.status,d.document_at,d.agreement_at,d.agreement_status,d.technical_assessment,d.final_notes,d.warranty_period,d.warranty_start_at,d.warranty_end_at,d.warranty_remediation,d.parts_json,d.labor_json,d.snapshot_json,d.signature_path,d.file_path,d.file_sha256,d.generated_at,d.is_active,d.created_at,d.updated_at,'.uuid_sql('d.created_by').' created_by,'.uuid_sql('d.updated_by').' updated_by FROM sales_sheet_documents d';
}

function sales_document_absolute_path(?string $relativePath): ?string {
    if (!$relativePath) return null;
    $normalized = str_replace('\\', '/', ltrim($relativePath, '/\\'));
    if (!str_starts_with($normalized, 'uploads/sales-documents/v2/')) return null;
    $root = realpath(__DIR__.'/../uploads/sales-documents');
    $candidate = realpath(__DIR__.'/../'.$normalized);
    $prefix = $root === false ? null : rtrim($root, '/\\').DIRECTORY_SEPARATOR;
    if ($prefix === null || $candidate === false || !str_starts_with($candidate, $prefix) || !is_file($candidate)) return null;
    return $candidate;
}

function remove_sales_document_file(?string $relativePath): void {
    $path = sales_document_absolute_path($relativePath);
    if ($path && is_file($path)) @unlink($path);
}

function sales_sheet_pdf_absolute_path(?string $relativePath): ?string {
    if (!$relativePath) return null;
    $normalized = str_replace('\\', '/', ltrim($relativePath, '/\\'));
    if (!str_starts_with($normalized, 'uploads/sales-sheets/')) return null;
    $root = realpath(__DIR__.'/../uploads/sales-sheets');
    $candidate = realpath(__DIR__.'/../'.$normalized);
    $prefix = $root === false ? null : rtrim($root, '/\\').DIRECTORY_SEPARATOR;
    if ($prefix === null || $candidate === false || !str_starts_with($candidate, $prefix) || !is_file($candidate)) return null;
    return $candidate;
}

function remove_sales_sheet_pdf_file(?string $relativePath): void {
    $path = sales_sheet_pdf_absolute_path($relativePath);
    if ($path && is_file($path)) @unlink($path);
}

function sales_document_sheet_sync_fingerprint(array $sheet): string {
    foreach (['pdfUrl','signatureUrl'] as $key) unset($sheet[$key]);
    return hash('sha256', json_encode($sheet, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
}

function sales_document_row_fingerprint(?array $row): string {
    if ($row === null) return 'missing';
    return hash('sha256', json_encode($row, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
}

function sales_document_canonical_pricing_marker(array $prices): array {
    return [
        'version'=>1,
        'applied'=>true,
        'source'=>'EXPLICIT_ACCEPTED_FINAL_ESTIMATE',
        'productPrice'=>round(max(0, (float)($prices['productPrice'] ?? 0)), 2),
        'deliveryPrice'=>round(max(0, (float)($prices['deliveryPrice'] ?? 0)), 2),
        'totalPrice'=>round(max(0, (float)($prices['totalPrice'] ?? 0)), 2),
    ];
}

function sales_document_snapshot_has_canonical_pricing(array $snapshot): bool {
    $marker = $snapshot['canonicalPricing'] ?? null;
    $sheet = $snapshot['sheet'] ?? null;
    $summary = $snapshot['summary'] ?? null;
    if (!is_array($marker) || !is_array($sheet) || !is_array($summary)
        || (int)($marker['version'] ?? 0) < 1
        || ($marker['applied'] ?? null) !== true
        || ($marker['source'] ?? null) !== 'EXPLICIT_ACCEPTED_FINAL_ESTIMATE') return false;
    $values = [
        [$marker['productPrice'] ?? null, $sheet['productPrice'] ?? null, $summary['partsTotal'] ?? null],
        [$marker['deliveryPrice'] ?? null, $sheet['deliveryPrice'] ?? null, $summary['laborTotal'] ?? null],
        [$marker['totalPrice'] ?? null, $sheet['totalPrice'] ?? null, $summary['totalPrice'] ?? null],
    ];
    foreach ($values as $group) {
        foreach ($group as $value) if (!is_int($value) && !is_float($value)) return false;
        foreach ($group as $value) if (!is_finite((float)$value) || (float)$value < 0) return false;
        if (abs((float)$group[0] - (float)$group[1]) > .009 || abs((float)$group[0] - (float)$group[2]) > .009) return false;
    }
    return abs((float)$marker['productPrice'] + (float)$marker['deliveryPrice'] - (float)$marker['totalPrice']) <= .009;
}

function sales_document_canonical_pricing_marker_for_generation(string $type, string $agreementStatus, ?array $canonicalSheetPrices, array $existingSnapshot): ?array {
    if ($type !== 'FINAL_ESTIMATE' || $agreementStatus !== 'ACCEPTED') return null;
    if ($canonicalSheetPrices !== null) return sales_document_canonical_pricing_marker($canonicalSheetPrices);
    return sales_document_snapshot_has_canonical_pricing($existingSnapshot)
        ? $existingSnapshot['canonicalPricing']
        : null;
}

function sales_document_estimate_source_marker(array $row): ?array {
    $id = trim((string)($row['id'] ?? ''));
    $fileSha256 = strtolower(trim((string)($row['file_sha256'] ?? '')));
    $snapshotJson = (string)($row['snapshot_json'] ?? '');
    if ($id === '' || !preg_match('/^[a-f0-9]{64}$/', $fileSha256) || $snapshotJson === '') return null;
    return [
        'version'=>1,
        'documentId'=>$id,
        'fileSha256'=>$fileSha256,
        'snapshotSha256'=>hash('sha256', $snapshotJson),
    ];
}

function sales_document_warranty_source_is_current(array $snapshot, array $estimateRow): bool {
    $marker = $snapshot['sourceEstimate'] ?? null;
    if (!is_array($marker) || (int)($marker['version'] ?? 0) < 1
        || strtoupper((string)($estimateRow['type'] ?? '')) !== 'FINAL_ESTIMATE'
        || strtoupper((string)($estimateRow['status'] ?? '')) !== 'PUBLISHED'
        || (int)($estimateRow['is_active'] ?? 0) !== 1
        || !sales_document_pdf_is_current($estimateRow)) return false;
    $current = sales_document_estimate_source_marker($estimateRow);
    return $current !== null
        && hash_equals((string)$current['documentId'], (string)($marker['documentId'] ?? ''))
        && hash_equals((string)$current['fileSha256'], strtolower((string)($marker['fileSha256'] ?? '')))
        && hash_equals((string)$current['snapshotSha256'], strtolower((string)($marker['snapshotSha256'] ?? '')));
}

function sales_document_pdf_is_current(array $row, ?array $estimateRow = null): bool {
    $snapshot = json_decode((string)($row['snapshot_json'] ?? ''), true);
    if (!is_array($snapshot) || (int)($snapshot['pdfVersion'] ?? 0) < GSHOP_SALES_DOCUMENT_PDF_VERSION) return false;
    $type = strtoupper((string)($row['type'] ?? ''));
    $agreementStatus = strtoupper((string)($row['agreement_status'] ?? $snapshot['agreement']['status'] ?? ''));
    if ($type === 'FINAL_ESTIMATE') return $agreementStatus !== 'ACCEPTED'
        || sales_document_snapshot_has_canonical_pricing($snapshot);
    if ($type !== 'WARRANTY') return true;
    if ($estimateRow === null) {
        $sheetId = trim((string)($row['sales_sheet_id'] ?? ''));
        if ($sheetId === '') return false;
        $estimateRow = sales_document_stored_row(db(), $sheetId, 'FINAL_ESTIMATE');
    }
    return is_array($estimateRow) && sales_document_warranty_source_is_current($snapshot, $estimateRow);
}

function invalidate_sales_dossier_files(string $sheetId): void {
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $sheetId)) return;
    $root = realpath(__DIR__.'/../uploads/sales-dossiers');
    if ($root === false) return;
    $prefix = rtrim($root, '/\\').DIRECTORY_SEPARATOR;
    foreach ([$root, $root.DIRECTORY_SEPARATOR.'v2'] as $parent) {
        $directory = realpath($parent.DIRECTORY_SEPARATOR.strtolower($sheetId));
        if ($directory === false || !str_starts_with($directory, $prefix) || !is_dir($directory)) continue;
        foreach (scandir($directory) ?: [] as $name) {
            if ($name === '.' || $name === '..') continue;
            $path = $directory.DIRECTORY_SEPARATOR.$name;
            if (is_file($path)) @unlink($path);
        }
        @rmdir($directory);
    }
}

function map_sales_document(array $row, array $user): array {
    $item = entity_base($row);
    $definition = sales_document_definitions()[$item['type']];
    $snapshot = json_decode((string)($row['snapshot_json'] ?? ''), true);
    $snapshotSheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $item['customerRequest'] = (string)($snapshotSheet['customerRequest'] ?? $snapshotSheet['customerNotes'] ?? '');
    $item['documentAt'] = iso_date($row['document_at'] ?? null);
    $item['agreementAt'] = iso_date($row['agreement_at'] ?? null);
    $item['warrantyStartAt'] = iso_date($row['warranty_start_at'] ?? null);
    $item['warrantyEndAt'] = iso_date($row['warranty_end_at'] ?? null);
    $item['generatedAt'] = iso_date($row['generated_at'] ?? null);
    $item['parts'] = json_decode((string)($row['parts_json'] ?? '[]'), true) ?: [];
    $item['labor'] = json_decode((string)($row['labor_json'] ?? '[]'), true) ?: [];
    $item['parts'] = array_map(function (array $line): array { unset($line['directCost']); return $line; }, $item['parts']);
    $item['labor'] = array_map(function (array $line): array { unset($line['directCost']); return $line; }, $item['labor']);
    unset($item['warrantyRemediation']);
    $item['label'] = $definition['label'];
    $item['available'] = $item['status'] === 'PUBLISHED'
        && sales_document_pdf_is_current($row)
        && sales_document_absolute_path($row['file_path'] ?? null) !== null;
    $version = trim((string)($item['fileSha256'] ?? $item['generatedAt'] ?? ''));
    $item['url'] = $item['available'] ? public_base_url().'/'.ltrim((string)$row['file_path'], '/').($version !== '' ? '?v='.rawurlencode($version) : '') : null;
    foreach (['snapshotJson','partsJson','laborJson','signaturePath','filePath','fileSha256','isActive'] as $key) unset($item[$key]);
    return $item;
}

function sales_document_existing_row(string $sheetId, string $type): ?array {
    ensure_sales_documents_table(db());
    $stmt = db()->prepare(sales_document_select().' WHERE d.sales_sheet_id=? AND d.type=? AND d.is_active=1 LIMIT 1');
    $stmt->execute([uuid_bin($sheetId), $type]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function sales_document_stored_row(PDO $pdo, string $sheetId, string $type, bool $forUpdate = false): ?array {
    $sql = sales_document_select().' WHERE d.sales_sheet_id=? AND d.type=? LIMIT 1'.($forUpdate ? ' FOR UPDATE' : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute([uuid_bin($sheetId), $type]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function sales_document_has_accepted_final_estimate(PDO $pdo, string $sheetId, bool $forUpdate = false): bool {
    $sql = "SELECT agreement_status FROM sales_sheet_documents WHERE sales_sheet_id=? AND type='FINAL_ESTIMATE' AND status='PUBLISHED' AND is_active=1 LIMIT 1".($forUpdate ? ' FOR UPDATE' : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute([uuid_bin($sheetId)]);
    return strtoupper((string)($stmt->fetchColumn() ?: '')) === 'ACCEPTED';
}

function sales_document_record(string $sheetId, string $type, array $user, bool $required = true): ?array {
    $row = sales_document_existing_row($sheetId, $type);
    if (!$row) { if ($required) fail('Documentul nu a fost încă generat.', 404); return null; }
    return map_sales_document($row, $user);
}

function sales_document_slots(string $sheetId, array $user): array {
    ensure_sales_documents_table(db());
    $stmt = db()->prepare(sales_document_select().' WHERE d.sales_sheet_id=? AND d.is_active=1');
    $stmt->execute([uuid_bin($sheetId)]);
    $rows = $stmt->fetchAll();
    $found = [];
    foreach ($rows as $row) $found[$row['type']] = map_sales_document($row, $user);
    $estimateAvailable = !empty($found['FINAL_ESTIMATE']['available']);
    if (!$estimateAvailable && isset($found['WARRANTY'])) {
        $found['WARRANTY']['available'] = false;
        $found['WARRANTY']['url'] = null;
    }
    $slots = [];
    foreach (sales_document_definitions() as $type=>$definition) $slots[] = $found[$type] ?? ['salesSheetId'=>$sheetId,'type'=>$type,'label'=>$definition['label'],'status'=>'MISSING','available'=>false,'parts'=>[],'labor'=>[],'url'=>null];
    return $slots;
}

function sales_document_company(array $row, array $sheet): array {
    $company = json_decode((string)($row['company_snapshot'] ?? ''), true);
    if (!is_array($company)) $company = [];
    if (!empty($sheet['companyId'])) {
        $stmt = db()->prepare(company_select().' WHERE id=? AND is_active=1 LIMIT 1');
        $stmt->execute([uuid_bin((string)$sheet['companyId'])]);
        $liveRow = $stmt->fetch();
        if ($liveRow) {
            $live = map_company_details($liveRow, true);
            if (!empty($live['stampPath'])) $company['stampPath'] = $live['stampPath'];
            elseif (array_key_exists('stampPath', $live)) $company['stampPath'] = null;
        }
    }
    return $company;
}

function sales_document_number(string $prefix, string $sheetNumber): string {
    $raw = preg_replace('/^FV-?/i', '', trim($sheetNumber)) ?? '';
    if (preg_match('/^(\d{4})-(\d+)$/', $raw, $match)) return $prefix.'-'.$match[1].'-'.str_pad($match[2], 6, '0', STR_PAD_LEFT);
    return $prefix.'-'.preg_replace('/[^A-Z0-9-]+/i', '-', $raw);
}

function sales_document_summary(array $sheet, array $parts, array $labor): array {
    $partsTotal = round(array_sum(array_map(fn(array $item)=>(float)($item['totalPrice'] ?? 0), $parts)), 2);
    $laborTotal = round(array_sum(array_map(fn(array $item)=>(float)($item['totalPrice'] ?? 0), $labor)), 2);
    $total = round($partsTotal + $laborTotal, 2);
    $internal = round(max(0, (float)($sheet['expenseTotal'] ?? 0)), 2);
    $received = round(max(0, (float)($sheet['receivedAmount'] ?? 0)), 2);
    $remaining = round(max(0, $total - $received), 2);
    foreach ([$partsTotal,$laborTotal,$total,$internal,$received,$remaining] as $amount) if (!is_finite($amount) || abs($amount) > 9999999999.99) fail('Totalurile documentului depășesc limita permisă.', 422);
    return ['partsTotal'=>$partsTotal,'laborTotal'=>$laborTotal,'totalPrice'=>$total,'receivedAmount'=>$received,'remainingDue'=>$remaining,'expenseTotal'=>$internal,'gshopNet'=>round($total-$internal,2),'paymentStatus'=>$remaining <= .009 ? 'PAID' : 'UNPAID','currencyCode'=>$sheet['currencyCode'] ?? 'RON','dueAt'=>$sheet['dueAt'] ?? null];
}

function sales_document_canonical_sheet_prices(array $sheet, array $summary): array {
    $quantity = max(.01, (float)($sheet['quantity'] ?? 1));
    $partsTotal = round(max(0, (float)($summary['partsTotal'] ?? 0)), 2);
    $laborTotal = round(max(0, (float)($summary['laborTotal'] ?? 0)), 2);
    $total = round($partsTotal + $laborTotal, 2);
    $oldTotal = round(max(0, (float)($sheet['totalPrice'] ?? 0)), 2);
    if ($total <= .009) fail('Totalul devizului trebuie să fie mai mare decât zero.', 422);
    $storedAdvance = round(max(0, (float)($sheet['advancePaid'] ?? 0)), 2);
    $received = strtoupper((string)($sheet['paymentStatus'] ?? 'UNPAID')) === 'PAID'
        ? round(max($storedAdvance, $oldTotal), 2)
        : $storedAdvance;
    $remaining = round(max(0, $total - $received), 2);
    $expenses = round(max(0, (float)($sheet['expenseTotal'] ?? 0)), 2);
    $unitPrice = round($partsTotal / $quantity, 2);
    foreach ([$quantity,$partsTotal,$laborTotal,$total,$received,$remaining,$expenses,$unitPrice] as $amount) {
        if (!is_finite($amount) || abs($amount) > 9999999999.99) fail('Prețurile devizului depășesc limita permisă.', 422);
    }
    return [
        'productUnitPrice'=>$unitPrice,
        'productPrice'=>$partsTotal,
        'deliveryPrice'=>$laborTotal,
        'totalPrice'=>$total,
        'advancePaid'=>$received,
        'receivedAmount'=>$received,
        'remainingDue'=>$remaining,
        'paymentStatus'=>$remaining <= .009 ? 'PAID' : 'UNPAID',
        'gshopNet'=>round($total-$expenses, 2),
    ];
}

function sales_document_warranty_end(string $startAt, string $period): ?string {
    $normalized = str_replace('ă', 'a', strtolower(trim($period)));
    if (!preg_match('/^(\d{1,4})(?:\s*([a-z]+))?/u', $normalized, $match)) return null;
    $amount = (int)$match[1]; $unit = $match[2] ?? '';
    if ($amount < 1) return null;
    try { $date = new DateTime($startAt, new DateTimeZone('UTC')); } catch (Throwable) { return null; }
    if ($unit === '' || str_starts_with('zile', $unit) || $unit === 'zi') $date->modify('+'.$amount.' days');
    elseif (str_starts_with('luni', $unit) || str_starts_with('luna', $unit)) $date->modify('+'.$amount.' months');
    elseif (str_starts_with('ani', $unit) || $unit === 'an') $date->modify('+'.$amount.' years');
    else return null;
    return $date->format('Y-m-d H:i:s');
}

function sales_document_reference(string $sheetId, string $type): ?array {
    $row = sales_document_existing_row($sheetId, $type);
    if (!$row) return null;
    $snapshot = json_decode((string)($row['snapshot_json'] ?? ''), true);
    return ['number'=>(string)$row['number'],'date'=>iso_date($row['document_at'] ?? null),'snapshot'=>is_array($snapshot)?$snapshot:[]];
}

function generate_sales_document_record(string $sheetId, string $type, array $body, array $user, bool $refreshDependent = true, bool $syncCanonicalPrices = true, int $syncAttempt = 0): array {
    $type = validated_sales_document_type($type);
    ensure_sales_documents_table(db());
    $row = sales_sheet_row($sheetId);
    $sheet = map_sales_sheet($row, true);
    ensure_property((string)$sheet['propertyId'], $user);
    $sheetSourceFingerprint = sales_document_sheet_sync_fingerprint($sheet);
    $storedExisting = sales_document_stored_row(db(), $sheetId, $type);
    $documentSourceFingerprint = sales_document_row_fingerprint($storedExisting);
    $existing = $storedExisting && (int)($storedExisting['is_active'] ?? 0) === 1 ? $storedExisting : null;
    $existingSnapshot = $existing ? json_decode((string)($existing['snapshot_json'] ?? ''), true) : null;
    if (!is_array($existingSnapshot)) $existingSnapshot = [];
    $now = now_utc();
    $definition = sales_document_definitions()[$type];
    $estimateRow = $type === 'WARRANTY' ? sales_document_stored_row(db(), $sheetId, 'FINAL_ESTIMATE') : null;
    $estimateSourceFingerprint = $type === 'WARRANTY' ? sales_document_row_fingerprint($estimateRow) : null;
    $estimate = null;
    if ($estimateRow && (int)($estimateRow['is_active'] ?? 0) === 1) {
        $estimateSnapshot = json_decode((string)($estimateRow['snapshot_json'] ?? ''), true);
        $estimate = ['number'=>(string)$estimateRow['number'],'date'=>iso_date($estimateRow['document_at'] ?? null),'snapshot'=>is_array($estimateSnapshot)?$estimateSnapshot:[]];
    }
    if ($type === 'WARRANTY' && !$estimate) fail('Creează mai întâi devizul final.', 409, ['code'=>'FINAL_ESTIMATE_REQUIRED','requiredType'=>'FINAL_ESTIMATE']);
    if ($type === 'WARRANTY' && !sales_document_pdf_is_current($estimateRow)) {
        if ($syncCanonicalPrices) fail('Actualizează mai întâi devizul final.', 409, ['code'=>'FINAL_ESTIMATE_REFRESH_REQUIRED','requiredType'=>'FINAL_ESTIMATE']);
        throw new RuntimeException('Certificatul a rămas în așteptare până la actualizarea explicită a devizului final.');
    }

    if ($type === 'WARRANTY') {
        $estimateSnapshot = is_array($estimate['snapshot'] ?? null) ? $estimate['snapshot'] : [];
        $partsSource = $estimateSnapshot['parts'] ?? [];
        $laborSource = $estimateSnapshot['labor'] ?? [];
    } else {
        $partsSource = array_key_exists('parts', $body) ? $body['parts'] : ($existingSnapshot['parts'] ?? null);
        $laborSource = array_key_exists('labor', $body) ? $body['labor'] : ($existingSnapshot['labor'] ?? null);
    }
    $parts = service_document_items($partsSource, '', 0, 0);
    foreach ($parts as &$part) unset($part['directCost']);
    unset($part);
    $laborFallback = (float)($sheet['deliveryPrice'] ?? 0) > 0 ? ((string)($sheet['deliveryMode'] ?? '') === 'DELIVERY' ? 'Livrare și servicii asociate' : 'Servicii asociate') : '';
    $labor = service_document_items($laborSource, $laborFallback, (float)($sheet['deliveryPrice'] ?? 0), 0);
    foreach ($labor as &$laborItem) unset($laborItem['directCost']);
    unset($laborItem);
    $summary = $type === 'WARRANTY' && is_array($estimate['snapshot']['summary'] ?? null) ? $estimate['snapshot']['summary'] : sales_document_summary($sheet, $parts, $labor);
    $summary['receivedAmount'] = round(max(0, (float)($sheet['receivedAmount'] ?? 0)), 2);
    $summary['remainingDue'] = round(max(0, (float)($summary['totalPrice'] ?? 0) - (float)$summary['receivedAmount']), 2);
    $summary['paymentStatus'] = (float)$summary['remainingDue'] <= .009 ? 'PAID' : 'UNPAID';
    $summary['dueAt'] = $sheet['dueAt'] ?? null;

    $number = (string)($existing['number'] ?? sales_document_number($definition['prefix'], (string)$sheet['number']));
    $documentAt = service_document_db_date($body['documentAt'] ?? null, (string)($existing['document_at'] ?? $now));
    $agreementAt = service_document_db_date($body['agreementAt'] ?? null, (string)($existing['agreement_at'] ?? $documentAt));
    $agreementStatus = strtoupper((string)($body['agreementStatus'] ?? $existing['agreement_status'] ?? 'ACCEPTED'));
    if (!in_array($agreementStatus, ['ACCEPTED','REFUSED'], true)) fail('Starea acordului nu este validă.', 422);
    $canonicalSheetPrices = $type === 'FINAL_ESTIMATE' && $agreementStatus === 'ACCEPTED' && $syncCanonicalPrices
        ? sales_document_canonical_sheet_prices($sheet, $summary)
        : null;
    if ($canonicalSheetPrices !== null) {
        foreach ($canonicalSheetPrices as $key=>$value) $sheet[$key] = $value;
        $summary['receivedAmount'] = $canonicalSheetPrices['receivedAmount'];
        $summary['remainingDue'] = $canonicalSheetPrices['remainingDue'];
        $summary['paymentStatus'] = $canonicalSheetPrices['paymentStatus'];
        $summary['gshopNet'] = $canonicalSheetPrices['gshopNet'];
    }
    $customerRequest = company_detail_text($body['customerRequest'] ?? $existingSnapshot['sheet']['customerRequest'] ?? $existingSnapshot['sheet']['customerNotes'] ?? $sheet['customerNotes'] ?? null, 'Solicitarea clientului', 1000);
    $technical = company_detail_text($body['technicalAssessment'] ?? $existing['technical_assessment'] ?? $existingSnapshot['sheet']['technicalAssessment'] ?? null, 'Configurația și verificarea', 1200);
    $finalNotes = company_detail_text($body['finalNotes'] ?? $existing['final_notes'] ?? $sheet['notes'] ?? null, 'Observațiile finale', 2000);

    $period = company_detail_text($body['warrantyPeriod'] ?? $existing['warranty_period'] ?? $sheet['warranty'] ?? null, 'Perioada garanției', 120);
    $warrantyStart = service_document_optional_db_date($body['warrantyStartAt'] ?? $existing['warranty_start_at'] ?? $sheet['documentAt'] ?? $documentAt);
    $warrantyEndInput = $body['warrantyEndAt'] ?? $existing['warranty_end_at'] ?? null;
    $warrantyEnd = service_document_optional_db_date($warrantyEndInput) ?? ($period && $warrantyStart ? sales_document_warranty_end($warrantyStart, $period) : null);
    $remediation = null;
    if ($type === 'WARRANTY') {
        if (!$period) fail('Perioada garanției este obligatorie.', 422);
        if (!$warrantyStart || !$warrantyEnd) fail('Intervalul garanției nu este valid.', 422);
        if (strtotime($warrantyEnd) < strtotime($warrantyStart)) fail('Data de sfârșit a garanției nu poate fi înaintea datei de început.', 422);
    }

    $company = sales_document_company($row, $sheet);
    $snapshotSheet = $sheet;
    $snapshotSheet['customerRequest']=$customerRequest;
    $snapshotSheet['technicalAssessment']=$technical;
    $snapshotSheet['finalNotes']=$finalNotes;
    foreach (['companySnapshot','signaturePath','filePath','fileSha256','expenses','expenseTotal','gshopNet'] as $key) unset($snapshotSheet[$key]);
    $publicSummary = $summary;
    foreach (['expenseTotal','gshopNet','internalCosts','directCost'] as $key) unset($publicSummary[$key]);
    $snapshot = [
        'pdfVersion'=>GSHOP_SALES_DOCUMENT_PDF_VERSION,
        'brand'=>'Calculatoare Profesionale | G-Shop',
        'company'=>$company,
        'sheet'=>$snapshotSheet,
        'estimate'=>$type === 'FINAL_ESTIMATE' ? ['number'=>$number,'date'=>iso_date($documentAt),'summary'=>$publicSummary] : ['number'=>$estimate['number'],'date'=>$estimate['date'],'summary'=>$publicSummary],
        'parts'=>$parts,
        'labor'=>$labor,
        'summary'=>$publicSummary,
        'agreement'=>['status'=>$agreementStatus,'date'=>iso_date($agreementAt)],
        'warranty'=>['number'=>$type === 'WARRANTY' ? $number : '','date'=>$type === 'WARRANTY' ? iso_date($documentAt) : null,'period'=>$period,'startAt'=>iso_date($warrantyStart),'endAt'=>iso_date($warrantyEnd)],
    ];
    $canonicalPricingMarker = sales_document_canonical_pricing_marker_for_generation($type, $agreementStatus, $canonicalSheetPrices, $existingSnapshot);
    if ($canonicalPricingMarker !== null) $snapshot['canonicalPricing'] = $canonicalPricingMarker;
    if ($type === 'WARRANTY') {
        $estimateSourceMarker = sales_document_estimate_source_marker($estimateRow);
        if ($estimateSourceMarker === null) throw new RuntimeException('Sursa certificatului de garanție nu poate fi validată.');
        $snapshot['sourceEstimate'] = $estimateSourceMarker;
    }
    $id = (string)($storedExisting['id'] ?? uuid_v4());
    $publicationToken = strtolower(uuid_v4());
    $sheetRendered = null;
    $previousSheetPath = $canonicalSheetPrices !== null ? (string)($row['file_path'] ?? '') : '';
    try {
        if ($canonicalSheetPrices !== null) {
            require_once __DIR__.'/sales_sheet_pdf.php';
            $sheetRendered = generate_sales_sheet_pdf($sheet, $company, $row['signature_path'] ?? null, $company['stampPath'] ?? null, $publicationToken);
        }
        require_once __DIR__.'/sales_document_pdf.php';
        $rendered = generate_sales_document_pdf($type, ['id'=>$id,'number'=>$number,'documentAt'=>iso_date($documentAt),'agreementAt'=>iso_date($agreementAt),'agreementStatus'=>$agreementStatus], $snapshot, $row['signature_path'] ?? null, $company['stampPath'] ?? null, $publicationToken);
    } catch (Throwable $error) {
        remove_sales_sheet_pdf_file($sheetRendered['filePath'] ?? null);
        throw $error;
    }
    $pdo = null;
    try {
        $generatedAt = service_document_db_date($rendered['generatedAt'] ?? null, $now);
        $sheetGeneratedAt = $sheetRendered ? service_document_db_date($sheetRendered['generatedAt'] ?? null, $now) : null;
        $encoded = json_encode($snapshot, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        $partsJson = json_encode($parts, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        $laborJson = json_encode($labor, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        $persistedAt = now_utc();
        $columns = ['id','sales_sheet_id','property_id','type','number','status','document_at','agreement_at','agreement_status','technical_assessment','final_notes','warranty_period','warranty_start_at','warranty_end_at','warranty_remediation','parts_json','labor_json','snapshot_json','signature_path','file_path','file_sha256','generated_at','is_active','created_at','updated_at','created_by','updated_by'];
        $args = [uuid_bin($id),uuid_bin($sheetId),uuid_bin((string)$sheet['propertyId']),$type,$number,'PUBLISHED',$documentAt,$agreementAt,$agreementStatus,$technical,$finalNotes,$period,$warrantyStart,$warrantyEnd,$remediation,$partsJson,$laborJson,$encoded,$row['signature_path']??null,$rendered['filePath'],$rendered['sha256'],$generatedAt,1,$persistedAt,$persistedAt,uuid_bin($user['id']),uuid_bin($user['id'])];
        $pdo = db();
        $pdo->beginTransaction();
        $locked = $pdo->prepare(sales_sheet_select().' WHERE ss.id=? AND ss.is_active=1 LIMIT 1 FOR UPDATE');
        $locked->execute([uuid_bin($sheetId)]);
        $lockedRow = $locked->fetch();
        if (!$lockedRow || sales_document_sheet_sync_fingerprint(map_sales_sheet($lockedRow, true)) !== $sheetSourceFingerprint) {
            throw new SalesDocumentSyncConflict('Fișa de vânzare s-a modificat în timpul generării documentului.');
        }
        if ($type === 'WARRANTY') {
            $lockedEstimate = sales_document_stored_row($pdo, $sheetId, 'FINAL_ESTIMATE', true);
            if (sales_document_row_fingerprint($lockedEstimate) !== $estimateSourceFingerprint) {
                throw new SalesDocumentSyncConflict('Devizul final s-a modificat în timpul generării certificatului.');
            }
        }
        $lockedDocument = sales_document_stored_row($pdo, $sheetId, $type, true);
        if (sales_document_row_fingerprint($lockedDocument) !== $documentSourceFingerprint) {
            throw new SalesDocumentSyncConflict('Documentul s-a modificat în timpul generării PDF-ului.');
        }
        $pdo->prepare('INSERT INTO sales_sheet_documents ('.implode(',', $columns).') VALUES ('.implode(',', array_fill(0, count($args), '?')).") ON DUPLICATE KEY UPDATE number=VALUES(number),status='PUBLISHED',document_at=VALUES(document_at),agreement_at=VALUES(agreement_at),agreement_status=VALUES(agreement_status),technical_assessment=VALUES(technical_assessment),final_notes=VALUES(final_notes),warranty_period=VALUES(warranty_period),warranty_start_at=VALUES(warranty_start_at),warranty_end_at=VALUES(warranty_end_at),warranty_remediation=VALUES(warranty_remediation),parts_json=VALUES(parts_json),labor_json=VALUES(labor_json),snapshot_json=VALUES(snapshot_json),signature_path=VALUES(signature_path),file_path=VALUES(file_path),file_sha256=VALUES(file_sha256),generated_at=VALUES(generated_at),is_active=1,updated_at=VALUES(updated_at),updated_by=VALUES(updated_by)")->execute($args);
        if ($canonicalSheetPrices !== null) {
            $pdo->prepare('UPDATE sales_sheets SET product_unit_price=?,product_price=?,delivery_price=?,total_price=?,advance_paid=?,remaining_due=?,payment_status=?,gshop_net=?,file_path=?,file_sha256=?,generated_at=?,updated_at=?,updated_by=? WHERE id=?')->execute([
                $canonicalSheetPrices['productUnitPrice'],$canonicalSheetPrices['productPrice'],$canonicalSheetPrices['deliveryPrice'],$canonicalSheetPrices['totalPrice'],$canonicalSheetPrices['advancePaid'],$canonicalSheetPrices['remainingDue'],$canonicalSheetPrices['paymentStatus'],$canonicalSheetPrices['gshopNet'],$sheetRendered['filePath'],$sheetRendered['sha256'],$sheetGeneratedAt,$persistedAt,uuid_bin($user['id']),uuid_bin($sheetId),
            ]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        remove_sales_document_file($rendered['filePath'] ?? null);
        remove_sales_sheet_pdf_file($sheetRendered['filePath'] ?? null);
        if ($error instanceof SalesDocumentSyncConflict && $syncAttempt < 2) {
            return generate_sales_document_record($sheetId, $type, $body, $user, $refreshDependent, $syncCanonicalPrices, $syncAttempt + 1);
        }
        if ($error instanceof SalesDocumentSyncConflict) fail('Fișa s-a modificat între timp. Încearcă din nou.', 409);
        throw $error;
    }
    invalidate_sales_dossier_files($sheetId);
    if (!empty($existing['file_path']) && $existing['file_path'] !== $rendered['filePath']) remove_sales_document_file((string)$existing['file_path']);
    if ($previousSheetPath !== '' && $previousSheetPath !== ($sheetRendered['filePath'] ?? null)) remove_sales_sheet_pdf_file($previousSheetPath);
    $result = sales_document_record($sheetId, $type, $user, true);
    if ($type === 'FINAL_ESTIMATE' && $refreshDependent && sales_document_existing_row($sheetId, 'WARRANTY')) generate_sales_document_record($sheetId, 'WARRANTY', [], $user, false);
    return $result;
}

function regenerate_existing_sales_documents(string $sheetId, array $user): void {
    $final = sales_document_existing_row($sheetId, 'FINAL_ESTIMATE');
    if ($final) generate_sales_document_record($sheetId, 'FINAL_ESTIMATE', [], $user, false, false);
    $warranty = sales_document_existing_row($sheetId, 'WARRANTY');
    if ($warranty) generate_sales_document_record($sheetId, 'WARRANTY', [], $user, false, false);
}

function refresh_existing_sales_documents_safe(string $sheetId, array $user): void {
    try { regenerate_existing_sales_documents($sheetId, $user); }
    catch (Throwable $error) { error_log('[G-Shop sales document sync] '.$sheetId.': '.$error->getMessage()); }
}

function regenerate_sales_documents_for_company(string $companyId, array $user): void {
    ensure_sales_documents_table(db());
    $stmt = db()->prepare('SELECT '.uuid_sql('ss.id').' id FROM sales_sheets ss WHERE ss.company_id=? AND ss.is_active=1 AND EXISTS (SELECT 1 FROM sales_sheet_documents d WHERE d.sales_sheet_id=ss.id AND d.is_active=1)');
    $stmt->execute([uuid_bin($companyId)]);
    foreach ($stmt->fetchAll() as $row) refresh_existing_sales_documents_safe((string)$row['id'], $user);
}

function delete_sales_document_record(string $sheetId, string $type, array $user): array {
    $type = validated_sales_document_type($type);
    $types = $type === 'FINAL_ESTIMATE' ? ['FINAL_ESTIMATE','WARRANTY'] : ['WARRANTY'];
    $deleted = [];
    foreach ($types as $targetType) {
        $row = sales_document_existing_row($sheetId, $targetType);
        if (!$row) continue;
        db()->prepare('UPDATE sales_sheet_documents SET is_active=0,updated_at=?,updated_by=? WHERE id=?')->execute([now_utc(),uuid_bin($user['id']),uuid_bin((string)$row['id'])]);
        remove_sales_document_file($row['file_path'] ?? null);
        $deleted[] = $targetType;
    }
    if ($deleted) invalidate_sales_dossier_files($sheetId);
    return $deleted;
}

function delete_all_sales_document_files(string $sheetId, array $user): void {
    ensure_sales_documents_table(db());
    $stmt = db()->prepare(sales_document_select().' WHERE d.sales_sheet_id=? AND d.is_active=1');
    $stmt->execute([uuid_bin($sheetId)]);
    foreach ($stmt->fetchAll() as $row) remove_sales_document_file($row['file_path'] ?? null);
    db()->prepare('UPDATE sales_sheet_documents SET is_active=0,updated_at=?,updated_by=? WHERE sales_sheet_id=?')->execute([now_utc(),uuid_bin($user['id']),uuid_bin($sheetId)]);
    invalidate_sales_dossier_files($sheetId);
}
