<?php
declare(strict_types=1);

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
    $root = realpath(__DIR__.'/../uploads/sales-documents');
    $candidate = realpath(__DIR__.'/../'.ltrim($relativePath, '/\\'));
    $prefix = $root === false ? null : rtrim($root, '/\\').DIRECTORY_SEPARATOR;
    if ($prefix === null || $candidate === false || !str_starts_with($candidate, $prefix) || !is_file($candidate)) return null;
    return $candidate;
}

function remove_sales_document_file(?string $relativePath): void {
    $path = sales_document_absolute_path($relativePath);
    if ($path && is_file($path)) @unlink($path);
}

function map_sales_document(array $row, array $user): array {
    $item = entity_base($row);
    $definition = sales_document_definitions()[$item['type']];
    $item['documentAt'] = iso_date($row['document_at'] ?? null);
    $item['agreementAt'] = iso_date($row['agreement_at'] ?? null);
    $item['warrantyStartAt'] = iso_date($row['warranty_start_at'] ?? null);
    $item['warrantyEndAt'] = iso_date($row['warranty_end_at'] ?? null);
    $item['generatedAt'] = iso_date($row['generated_at'] ?? null);
    $item['parts'] = json_decode((string)($row['parts_json'] ?? '[]'), true) ?: [];
    $item['labor'] = json_decode((string)($row['labor_json'] ?? '[]'), true) ?: [];
    if (!user_has_permission($user, 'financials.view')) {
        $item['parts'] = array_map(function (array $line): array { unset($line['directCost']); return $line; }, $item['parts']);
        $item['labor'] = array_map(function (array $line): array { unset($line['directCost']); return $line; }, $item['labor']);
    }
    $item['label'] = $definition['label'];
    $item['available'] = $item['status'] === 'PUBLISHED' && sales_document_absolute_path($row['file_path'] ?? null) !== null;
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

function sales_document_record(string $sheetId, string $type, array $user, bool $required = true): ?array {
    $row = sales_document_existing_row($sheetId, $type);
    if (!$row) { if ($required) fail('Documentul nu a fost încă generat.', 404); return null; }
    return map_sales_document($row, $user);
}

function sales_document_slots(string $sheetId, array $user): array {
    ensure_sales_documents_table(db());
    $stale=db()->prepare('SELECT 1 FROM sales_sheets ss JOIN sales_sheet_documents d ON d.sales_sheet_id=ss.id AND d.is_active=1 LEFT JOIN property_companies pc ON pc.id=ss.company_id WHERE ss.id=? AND (ss.updated_at>d.updated_at OR pc.updated_at>d.updated_at) LIMIT 1');$stale->execute([uuid_bin($sheetId)]);if($stale->fetchColumn())refresh_existing_sales_documents_safe($sheetId,$user);
    $stmt = db()->prepare(sales_document_select().' WHERE d.sales_sheet_id=? AND d.is_active=1');
    $stmt->execute([uuid_bin($sheetId)]);
    $found = [];
    foreach ($stmt->fetchAll() as $row) $found[$row['type']] = map_sales_document($row, $user);
    $slots = [];
    foreach (sales_document_definitions() as $type=>$definition) $slots[] = $found[$type] ?? ['salesSheetId'=>$sheetId,'type'=>$type,'label'=>$definition['label'],'status'=>'MISSING','available'=>false,'parts'=>[],'labor'=>[],'url'=>null];
    return $slots;
}

function sales_document_company(array $row, array $sheet): array {
    $company = json_decode((string)($row['company_snapshot'] ?? ''), true);
    if (!is_array($company)) $company = [];
    if (!empty($sheet['companyId'])) {
        try {
            $live = company_details_by_id((string)$sheet['companyId'], (string)$sheet['propertyId'], true);
            if (!empty($live['stampPath'])) $company['stampPath'] = $live['stampPath'];
            elseif (array_key_exists('stampPath', $live)) $company['stampPath'] = null;
        } catch (Throwable) { /* Snapshotul rămâne sursa identității juridice. */ }
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
    $internal = round(array_sum(array_map(fn(array $item)=>(float)($item['directCost'] ?? 0), $parts)), 2);
    $received = round(min(max(0, (float)($sheet['receivedAmount'] ?? 0)), $total), 2);
    $remaining = round(max(0, $total - $received), 2);
    foreach ([$partsTotal,$laborTotal,$total,$internal,$received,$remaining] as $amount) if (!is_finite($amount) || abs($amount) > 9999999999.99) fail('Totalurile documentului depășesc limita permisă.', 422);
    return ['partsTotal'=>$partsTotal,'laborTotal'=>$laborTotal,'totalPrice'=>$total,'receivedAmount'=>$received,'remainingDue'=>$remaining,'expenseTotal'=>$internal,'gshopNet'=>round($total-$internal,2),'paymentStatus'=>$remaining <= .009 ? 'PAID' : 'UNPAID','currencyCode'=>$sheet['currencyCode'] ?? 'RON','dueAt'=>$sheet['dueAt'] ?? null];
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

function generate_sales_document_record(string $sheetId, string $type, array $body, array $user, bool $refreshDependent = true): array {
    $type = validated_sales_document_type($type);
    ensure_sales_documents_table(db());
    $row = sales_sheet_row($sheetId);
    $sheet = map_sales_sheet($row, true);
    ensure_property((string)$sheet['propertyId'], $user);
    $existing = sales_document_existing_row($sheetId, $type);
    $existingSnapshot = $existing ? json_decode((string)($existing['snapshot_json'] ?? ''), true) : null;
    if (!is_array($existingSnapshot)) $existingSnapshot = [];
    $now = now_utc();
    $definition = sales_document_definitions()[$type];
    $estimate = sales_document_reference($sheetId, 'FINAL_ESTIMATE');
    if ($type === 'WARRANTY' && !$estimate) fail('Creează mai întâi devizul final.', 409, ['code'=>'FINAL_ESTIMATE_REQUIRED','requiredType'=>'FINAL_ESTIMATE']);

    if ($type === 'WARRANTY') {
        $estimateSnapshot = is_array($estimate['snapshot'] ?? null) ? $estimate['snapshot'] : [];
        $partsSource = $estimateSnapshot['parts'] ?? [];
        $laborSource = $estimateSnapshot['labor'] ?? [];
    } else {
        $partsSource = array_key_exists('parts', $body) ? $body['parts'] : ($existingSnapshot['parts'] ?? null);
        $laborSource = array_key_exists('labor', $body) ? $body['labor'] : ($existingSnapshot['labor'] ?? null);
    }
    $parts = service_document_items($partsSource, (string)($sheet['productName'] ?? 'Produs'), (float)($sheet['productPrice'] ?? 0), (float)($sheet['expenseTotal'] ?? 0));
    $laborFallback = (float)($sheet['deliveryPrice'] ?? 0) > 0 ? ((string)($sheet['deliveryMode'] ?? '') === 'DELIVERY' ? 'Livrare și servicii asociate' : 'Servicii asociate') : '';
    $labor = service_document_items($laborSource, $laborFallback, (float)($sheet['deliveryPrice'] ?? 0), 0);
    $summary = $type === 'WARRANTY' && is_array($estimate['snapshot']['summary'] ?? null) ? $estimate['snapshot']['summary'] : sales_document_summary($sheet, $parts, $labor);
    $summary['receivedAmount'] = round(min((float)($sheet['receivedAmount'] ?? 0), (float)($summary['totalPrice'] ?? 0)), 2);
    $summary['remainingDue'] = round(max(0, (float)($summary['totalPrice'] ?? 0) - (float)$summary['receivedAmount']), 2);
    $summary['paymentStatus'] = (float)$summary['remainingDue'] <= .009 ? 'PAID' : 'UNPAID';
    $summary['dueAt'] = $sheet['dueAt'] ?? null;

    $number = (string)($existing['number'] ?? sales_document_number($definition['prefix'], (string)$sheet['number']));
    $documentAt = service_document_db_date($body['documentAt'] ?? null, (string)($existing['document_at'] ?? $now));
    $agreementAt = service_document_db_date($body['agreementAt'] ?? null, (string)($existing['agreement_at'] ?? $documentAt));
    $agreementStatus = strtoupper((string)($body['agreementStatus'] ?? $existing['agreement_status'] ?? 'ACCEPTED'));
    if (!in_array($agreementStatus, ['ACCEPTED','REFUSED'], true)) fail('Starea acordului nu este validă.', 422);
    $technical = company_detail_text($body['technicalAssessment'] ?? $existing['technical_assessment'] ?? $sheet['customerNotes'] ?? $sheet['notes'] ?? null, 'Constatarea', 2000);
    $finalNotes = company_detail_text($body['finalNotes'] ?? $existing['final_notes'] ?? $sheet['notes'] ?? null, 'Observațiile finale', 2000);

    $period = company_detail_text($body['warrantyPeriod'] ?? $existing['warranty_period'] ?? $sheet['warranty'] ?? null, 'Perioada garanției', 120);
    $warrantyStart = service_document_optional_db_date($body['warrantyStartAt'] ?? $existing['warranty_start_at'] ?? $sheet['documentAt'] ?? $documentAt);
    $warrantyEndInput = $body['warrantyEndAt'] ?? $existing['warranty_end_at'] ?? null;
    $warrantyEnd = service_document_optional_db_date($warrantyEndInput) ?? ($period && $warrantyStart ? sales_document_warranty_end($warrantyStart, $period) : null);
    $remediation = company_detail_text($body['warrantyRemediation'] ?? $existing['warranty_remediation'] ?? '10 zile lucrătoare', 'Termenul de remediere', 160);
    if ($type === 'WARRANTY') {
        if (!$period) fail('Perioada garanției este obligatorie.', 422);
        if (!$warrantyStart || !$warrantyEnd) fail('Intervalul garanției nu este valid.', 422);
        if (strtotime($warrantyEnd) < strtotime($warrantyStart)) fail('Data de sfârșit a garanției nu poate fi înaintea datei de început.', 422);
    }

    $company = sales_document_company($row, $sheet);
    $snapshotSheet = $sheet;
    $snapshotSheet['technicalAssessment']=$technical;
    $snapshotSheet['finalNotes']=$finalNotes;
    foreach (['companySnapshot','signaturePath','filePath','fileSha256'] as $key) unset($snapshotSheet[$key]);
    $snapshot = [
        'brand'=>'Calculatoare Profesionale | G-Shop',
        'company'=>$company,
        'sheet'=>$snapshotSheet,
        'estimate'=>$type === 'FINAL_ESTIMATE' ? ['number'=>$number,'date'=>iso_date($documentAt),'summary'=>$summary] : ['number'=>$estimate['number'],'date'=>$estimate['date'],'summary'=>$summary],
        'parts'=>$parts,
        'labor'=>$labor,
        'summary'=>$summary,
        'agreement'=>['status'=>$agreementStatus,'date'=>iso_date($agreementAt)],
        'warranty'=>['number'=>$type === 'WARRANTY' ? $number : '','date'=>$type === 'WARRANTY' ? iso_date($documentAt) : null,'period'=>$period,'startAt'=>iso_date($warrantyStart),'endAt'=>iso_date($warrantyEnd),'remediation'=>$remediation],
    ];
    $id = (string)($existing['id'] ?? uuid_v4());
    require_once __DIR__.'/sales_document_pdf.php';
    $rendered = generate_sales_document_pdf($type, ['id'=>$id,'number'=>$number,'documentAt'=>iso_date($documentAt),'agreementAt'=>iso_date($agreementAt),'agreementStatus'=>$agreementStatus], $snapshot, $row['signature_path'] ?? null, $company['stampPath'] ?? null);
    $generatedAt = service_document_db_date($rendered['generatedAt'] ?? null, $now);
    $encoded = json_encode($snapshot, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    $partsJson = json_encode($parts, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    $laborJson = json_encode($labor, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    $columns = ['id','sales_sheet_id','property_id','type','number','status','document_at','agreement_at','agreement_status','technical_assessment','final_notes','warranty_period','warranty_start_at','warranty_end_at','warranty_remediation','parts_json','labor_json','snapshot_json','signature_path','file_path','file_sha256','generated_at','is_active','created_at','updated_at','created_by','updated_by'];
    $args = [uuid_bin($id),uuid_bin($sheetId),uuid_bin((string)$sheet['propertyId']),$type,$number,'PUBLISHED',$documentAt,$agreementAt,$agreementStatus,$technical,$finalNotes,$period,$warrantyStart,$warrantyEnd,$remediation,$partsJson,$laborJson,$encoded,$row['signature_path']??null,$rendered['filePath'],$rendered['sha256'],$generatedAt,1,$now,$now,uuid_bin($user['id']),uuid_bin($user['id'])];
    $pdo = db(); $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO sales_sheet_documents ('.implode(',', $columns).') VALUES ('.implode(',', array_fill(0, count($args), '?')).") ON DUPLICATE KEY UPDATE number=VALUES(number),status='PUBLISHED',document_at=VALUES(document_at),agreement_at=VALUES(agreement_at),agreement_status=VALUES(agreement_status),technical_assessment=VALUES(technical_assessment),final_notes=VALUES(final_notes),warranty_period=VALUES(warranty_period),warranty_start_at=VALUES(warranty_start_at),warranty_end_at=VALUES(warranty_end_at),warranty_remediation=VALUES(warranty_remediation),parts_json=VALUES(parts_json),labor_json=VALUES(labor_json),snapshot_json=VALUES(snapshot_json),signature_path=VALUES(signature_path),file_path=VALUES(file_path),file_sha256=VALUES(file_sha256),generated_at=VALUES(generated_at),is_active=1,updated_at=VALUES(updated_at),updated_by=VALUES(updated_by)")->execute($args);
        $pdo->commit();
    } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); remove_sales_document_file($rendered['filePath'] ?? null); throw $error; }
    if (!empty($existing['file_path']) && $existing['file_path'] !== $rendered['filePath']) remove_sales_document_file((string)$existing['file_path']);
    $result = sales_document_record($sheetId, $type, $user, true);
    if ($type === 'FINAL_ESTIMATE' && $refreshDependent && sales_document_existing_row($sheetId, 'WARRANTY')) generate_sales_document_record($sheetId, 'WARRANTY', [], $user, false);
    return $result;
}

function regenerate_existing_sales_documents(string $sheetId, array $user): void {
    $final = sales_document_existing_row($sheetId, 'FINAL_ESTIMATE');
    if ($final) generate_sales_document_record($sheetId, 'FINAL_ESTIMATE', [], $user, false);
    $warranty = sales_document_existing_row($sheetId, 'WARRANTY');
    if ($warranty) generate_sales_document_record($sheetId, 'WARRANTY', [], $user, false);
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
    return $deleted;
}

function delete_all_sales_document_files(string $sheetId, array $user): void {
    ensure_sales_documents_table(db());
    $stmt = db()->prepare(sales_document_select().' WHERE d.sales_sheet_id=? AND d.is_active=1');
    $stmt->execute([uuid_bin($sheetId)]);
    foreach ($stmt->fetchAll() as $row) remove_sales_document_file($row['file_path'] ?? null);
    db()->prepare('UPDATE sales_sheet_documents SET is_active=0,updated_at=?,updated_by=? WHERE sales_sheet_id=?')->execute([now_utc(),uuid_bin($user['id']),uuid_bin($sheetId)]);
}
