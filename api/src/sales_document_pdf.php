<?php
declare(strict_types=1);

require_once __DIR__ . '/service_document_pdf.php';

function gshop_sales_document_slug(mixed $value, string $fallback): string {
    $text = trim((string)($value ?? ''));
    if ($text !== '' && function_exists('iconv')) {
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if (is_string($ascii) && $ascii !== '') $text = $ascii;
    }
    $slug = trim((string)preg_replace('/[^a-zA-Z0-9]+/', '-', $text), '-');
    return $slug !== '' ? substr($slug, 0, 100) : $fallback;
}

function gshop_sales_document_file_name(string $type, array $snapshot): string {
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $client = gshop_sales_document_slug($sheet['customerName'] ?? '', 'Client');
    $number = ltrim(sales_document_number('', (string)($sheet['number'] ?? '')), '-');
    return sales_document_definitions()[$type]['filePrefix'] . '-' . $client . '-' . $number . '.pdf';
}

function gshop_sales_document_delivery_days(array $sheet): string {
    $start = trim((string)($sheet['documentAt'] ?? ''));
    $due = trim((string)($sheet['dueAt'] ?? ''));
    if ($start === '' || $due === '') return '';
    try {
        $startDate = new DateTimeImmutable($start);
        $dueDate = new DateTimeImmutable($due);
        if ($dueDate <= $startDate) return '0';
        return (string)max(1, (int)ceil(($dueDate->getTimestamp() - $startDate->getTimestamp()) / 86400));
    } catch (Throwable) {
        return '';
    }
}

function gshop_sales_document_service_snapshot(array $snapshot): array {
    $company = is_array($snapshot['company'] ?? null) ? $snapshot['company'] : [];
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $summary = is_array($snapshot['summary'] ?? null) ? $snapshot['summary'] : [];
    $estimate = is_array($snapshot['estimate'] ?? null) ? $snapshot['estimate'] : [];
    $agreement = is_array($snapshot['agreement'] ?? null) ? $snapshot['agreement'] : [];
    $warranty = is_array($snapshot['warranty'] ?? null) ? $snapshot['warranty'] : [];
    $currency = strtoupper(trim((string)($summary['currencyCode'] ?? $sheet['currencyCode'] ?? 'RON'))) ?: 'RON';
    $total = max(0, (float)($summary['totalPrice'] ?? $sheet['totalPrice'] ?? 0));
    $received = max(0, min($total, (float)($summary['receivedAmount'] ?? $sheet['receivedAmount'] ?? 0)));
    $remaining = max(0, (float)($summary['remainingDue'] ?? ($total - $received)));
    $partsTotal = max(0, (float)($summary['partsTotal'] ?? 0));
    $laborTotal = max(0, (float)($summary['laborTotal'] ?? 0));
    $reported = trim((string)($sheet['customerNotes'] ?? ''));
    if ($reported === '') $reported = 'Produsele și configurația solicitate de client, conform fișei de vânzare.';
    $contact = implode(' · ', array_values(array_filter([
        trim((string)($company['phone'] ?? '')),
        trim((string)($company['email'] ?? '')),
    ])));

    return [
        'documentProfile' => 'SALES',
        'nativeSalesTemplate' => true,
        'brand' => 'Calculatoare Profesionale | G-Shop',
        'company' => $company,
        'client' => [
            'firstName' => trim((string)($sheet['customerName'] ?? '')),
            'lastName' => '',
            'phone' => trim((string)($sheet['customerPhone'] ?? '')),
            'secondaryPhone' => '',
            'email' => trim((string)($sheet['customerEmail'] ?? '')),
            'address' => trim((string)($sheet['deliveryAddress'] ?? '')),
        ],
        'sheet' => [
            'number' => $sheet['number'] ?? '',
            'receivedAt' => $sheet['documentAt'] ?? '',
            'equipment' => $sheet['productName'] ?? '',
            'brand' => 'Calculatoare Profesionale',
            'model' => $sheet['productCode'] ?? '',
            'serialNumber' => $sheet['serialNumber'] ?? '',
            'accessories' => '',
            'reportedIssue' => $reported,
            'technicalAssessment' => $sheet['technicalAssessment'] ?? '',
            'finalNotes' => $sheet['finalNotes'] ?? '',
            'estimatedRepairDays' => gshop_sales_document_delivery_days($sheet),
            'finalAgreementAt' => $agreement['date'] ?? '',
            'defectCause' => '',
            'warranty' => $sheet['warranty'] ?? $warranty['period'] ?? '',
            'warrantyStartAt' => $warranty['startAt'] ?? '',
            'warrantyEndAt' => $warranty['endAt'] ?? '',
            'currencyCode' => $currency,
        ],
        'intake' => [
            'number' => $sheet['number'] ?? '',
            'date' => $sheet['documentAt'] ?? '',
        ],
        'estimate' => [
            'number' => $estimate['number'] ?? '',
            'date' => $estimate['date'] ?? '',
            'total' => $total,
            'remaining' => $remaining,
        ],
        'parts' => is_array($snapshot['parts'] ?? null) ? $snapshot['parts'] : [],
        'labor' => is_array($snapshot['labor'] ?? null) ? $snapshot['labor'] : [],
        'financials' => [
            'currencyCode' => $currency,
            'workPrice' => $total,
            'diagnosticFee' => 0,
            'advancePaid' => $received,
            'discountPercent' => 0,
            'displayedPartsCost' => $partsTotal,
            'displayedLaborCost' => $laborTotal,
            'paymentStatus' => $remaining <= .009 ? 'PAID' : 'UNPAID',
        ],
        'summary' => [
            'subtotal' => $total,
            'discountAmount' => 0,
            'totalDue' => $total,
            'receivedAmount' => $received,
            'remainingDue' => $remaining,
        ],
        'agreement' => [
            'status' => $agreement['status'] ?? 'ACCEPTED',
            'date' => $agreement['date'] ?? '',
        ],
        'warranty' => [
            'number' => $warranty['number'] ?? '',
            'date' => $warranty['date'] ?? '',
            'period' => $warranty['period'] ?? $sheet['warranty'] ?? '',
            'startAt' => $warranty['startAt'] ?? '',
            'endAt' => $warranty['endAt'] ?? '',
            'remediation' => '',
            'contact' => $contact,
            'contactPhone' => trim((string)($company['phone'] ?? '')),
            'contactEmail' => trim((string)($company['email'] ?? '')),
            'coverage' => 'Produsele și serviciile din devizul final',
        ],
    ];
}

/** @return array{filePath:string,url:string,sha256:string,generatedAt:string} */
function generate_sales_document_pdf(string $type, array $document, array $snapshot, ?string $signaturePath, ?string $stampPath): array {
    $type = validated_sales_document_type($type);
    $serviceSnapshot = gshop_sales_document_service_snapshot($snapshot);
    $templateRoot = __DIR__ . '/../assets/sales-document-templates';
    $templates = $type === 'FINAL_ESTIMATE' ? [
        'intro' => $templateRoot . '/final-estimate-intro.pdf',
        'continuation' => $templateRoot . '/final-estimate-continuation.pdf',
        'agreement' => $templateRoot . '/final-estimate-agreement.pdf',
    ] : ['warranty' => $templateRoot . '/warranty.pdf'];
    foreach ($templates as $template) if (!is_file($template)) throw new RuntimeException('Șablonul PDF al documentului Shop nu este disponibil.');

    $directory = __DIR__ . '/../uploads/sales-documents/v2';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) throw new RuntimeException('Directorul documentelor Shop nu poate fi creat.');
    $relativePath = 'uploads/sales-documents/v2/' . gshop_sales_document_file_name($type, $snapshot);
    $output = __DIR__ . '/../' . $relativePath;
    $temporary = $output . '.tmp-' . bin2hex(random_bytes(5));
    $signature = null;
    $stamp = null;

    try {
        $signature = gshop_pdf_signature_image(gshop_document_safe_source($signaturePath));
        $stamp = gshop_pdf_stamp_image(gshop_document_safe_source($stampPath));
        $pdf = new GshopServiceDocumentPdf('P', 'pt', 'A4');
        $pdf->SetAutoPageBreak(false);
        $pdf->SetMargins(0, 0, 0);
        $pdf->SetCompression(true);
        $pdf->AddFont('DejaVu', '', 'DejaVuSans.ttf', true);
        $pdf->AddFont('DejaVu', 'B', 'DejaVuSans-Bold.ttf', true);
        $pdf->SetTitle(($type === 'FINAL_ESTIMATE' ? 'Deviz final ' : 'Certificat de calitate și garanție ') . gshop_pdf_string($document['number'] ?? ''), true);
        $pdf->SetAuthor('Calculatoare Profesionale | G-Shop', true);

        if ($type === 'FINAL_ESTIMATE') {
            gshop_document_build_final($pdf, $document, $serviceSnapshot, $templates, $signature, $stamp);
        } else {
            gshop_document_add_template($pdf, $templates['warranty']);
            gshop_document_overlay_sales_template($pdf, $serviceSnapshot, 'WARRANTY', 679);
            gshop_document_overlay_warranty($pdf, $document, $serviceSnapshot, $signature, $stamp);
        }

        $pdf->Output('F', $temporary, true);
        if (!gshop_document_is_pdf($temporary)) throw new RuntimeException('Documentul PDF Shop nu a putut fi generat.');
        if (is_file($output) && !@unlink($output)) throw new RuntimeException('Versiunea anterioară a documentului Shop nu poate fi înlocuită.');
        if (!@rename($temporary, $output)) throw new RuntimeException('Documentul Shop nu a putut fi publicat.');
        @chmod($output, 0644);
        $generatedAt = gmdate('c');
        return [
            'filePath' => $relativePath,
            'url' => public_base_url() . '/' . $relativePath . '?v=' . rawurlencode($generatedAt),
            'sha256' => hash_file('sha256', $output) ?: '',
            'generatedAt' => $generatedAt,
        ];
    } finally {
        if (is_file($temporary)) @unlink($temporary);
        foreach ([$signature['path'] ?? null, $stamp] as $temporaryImage) {
            if (is_string($temporaryImage) && str_starts_with($temporaryImage, sys_get_temp_dir()) && is_file($temporaryImage)) @unlink($temporaryImage);
        }
    }
}
