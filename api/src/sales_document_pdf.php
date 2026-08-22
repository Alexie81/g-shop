<?php
declare(strict_types=1);

require_once __DIR__ . '/service_document_pdf.php';

const GSHOP_SALES_DOCUMENT_TOTAL_MARKER = '__gshop_sales_document_total__';

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
    $received = max(0, (float)($summary['receivedAmount'] ?? $sheet['receivedAmount'] ?? 0));
    $remaining = max(0, (float)($summary['remainingDue'] ?? ($total - $received)));
    $partsTotal = max(0, (float)($summary['partsTotal'] ?? 0));
    $laborTotal = max(0, (float)($summary['laborTotal'] ?? 0));
    $reported = trim((string)($sheet['customerRequest'] ?? $sheet['customerNotes'] ?? ''));
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
            'quantity' => $sheet['quantity'] ?? '',
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

function gshop_sales_document_snapshot_with_table_totals(array $snapshot): array {
    foreach ([
        ['parts', 'TOTAL PIESE / PRODUSE'],
        ['labor', 'TOTAL MANOPERĂ / SERVICII'],
    ] as [$kind, $label]) {
        $items = array_values(array_filter(
            gshop_document_items($snapshot, $kind),
            static fn(array $item): bool => ($item['quantity'] ?? null) !== GSHOP_SALES_DOCUMENT_TOTAL_MARKER
        ));
        if (!$items) {
            $snapshot[$kind] = [];
            continue;
        }
        $total = array_reduce(
            $items,
            static fn(float $sum, array $item): float => $sum + max(0, (float)($item['totalPrice'] ?? 0)),
            0.0
        );
        $items[] = [
            'name' => $label,
            'quantity' => GSHOP_SALES_DOCUMENT_TOTAL_MARKER,
            'unitPrice' => '',
            'totalPrice' => round($total, 2),
        ];
        $snapshot[$kind] = $items;
    }
    return $snapshot;
}

function gshop_sales_document_is_total_item(array $item): bool {
    return ($item['quantity'] ?? null) === GSHOP_SALES_DOCUMENT_TOTAL_MARKER;
}

/** @param list<array{name:string,quantity:mixed,unitPrice:mixed,totalPrice:float}> $items */
function gshop_sales_document_table(
    GshopServiceDocumentPdf $pdf,
    float $sourceBottom,
    array $items,
    string $currency,
    float $rowExtra = 0.0
): void {
    $x = GSHOP_DOCUMENT_MARGIN;
    $width = GSHOP_DOCUMENT_CONTENT_WIDTH;
    $height = gshop_document_table_height($pdf, $items, $rowExtra);
    gshop_document_box($pdf, $x, $sourceBottom, $width, $height, 'white', 'line', 8, 0.7);
    gshop_document_box($pdf, $x, $sourceBottom + $height - GSHOP_DOCUMENT_TABLE_HEADER, $width, GSHOP_DOCUMENT_TABLE_HEADER, 'electricLight', 'electricLight', 8, 0);
    gshop_document_set_fill($pdf, 'electricLight');
    $pdf->Rect($x, GSHOP_PDF_PAGE_HEIGHT - ($sourceBottom + $height - 8), $width, GSHOP_DOCUMENT_TABLE_HEADER - 8, 'F');
    $columns = [$width * .53, $width * .12, $width * .17, $width * .18];
    $labels = ['DENUMIRE', 'CANTITATE', 'PREȚ UNITAR', 'PREȚ TOTAL'];
    $cursorX = $x;
    foreach ($labels as $index => $label) {
        $pdf->SetFont('DejaVu', 'B', 5.7);
        $labelX = $cursorX + ($columns[$index] - $pdf->GetStringWidth($label)) / 2;
        gshop_pdf_text($pdf, $labelX, $sourceBottom + $height - 12, $label, 5.7, 'B', $columns[$index], 'L', gshop_document_color('electricDark'));
        $cursorX += $columns[$index];
    }
    $cursorX = $x;
    foreach (array_slice($columns, 0, 3) as $column) {
        $cursorX += $column;
        gshop_document_source_line($pdf, $cursorX, $sourceBottom, $cursorX, $sourceBottom + $height);
    }
    $rowTop = $sourceBottom + $height - GSHOP_DOCUMENT_TABLE_HEADER;
    gshop_document_source_line($pdf, $x, $rowTop, $x + $width, $rowTop);
    foreach ($items as $item) {
        $rowHeight = gshop_document_item_row_height($pdf, $item) + max(0.0, $rowExtra);
        $rowBottom = $rowTop - $rowHeight;
        $totalRow = gshop_sales_document_is_total_item($item);
        if ($totalRow) {
            gshop_document_set_fill($pdf, 'electricLight');
            $pdf->Rect($x + .7, GSHOP_PDF_PAGE_HEIGHT - $rowTop, $width - 1.4, $rowHeight, 'F');
            gshop_document_source_line($pdf, $x, $rowTop, $x + $width, $rowTop);
            $separatorX = $x;
            foreach (array_slice($columns, 0, 3) as $column) {
                $separatorX += $column;
                gshop_document_source_line($pdf, $separatorX, $rowBottom, $separatorX, $rowTop);
            }
        }
        gshop_document_source_line($pdf, $x, $rowBottom, $x + $width, $rowBottom);
        $baseline = $rowBottom + $rowHeight / 2 - 2;
        if ($totalRow) {
            gshop_document_shrink_text(
                $pdf,
                $x + 4,
                $baseline,
                $item['name'] ?? '',
                $columns[0] - 8,
                6.2,
                5.0,
                'B',
                'L',
                gshop_document_color('electricDark')
            );
            $totalX = $x + $columns[0] + $columns[1] + $columns[2];
            gshop_document_shrink_text(
                $pdf,
                $totalX + 4,
                $baseline,
                gshop_document_money($item['totalPrice'] ?? 0, $currency),
                $columns[3] - 8,
                6.2,
                5.0,
                'B',
                'R',
                gshop_document_color('electricDark')
            );
            $rowTop = $rowBottom;
            continue;
        }
        $nameLines = gshop_document_item_name_lines($pdf, $item) ?: [''];
        $nameBaseline = $rowBottom + ($rowHeight + (count($nameLines) - 1) * 7.2) / 2 - 2;
        foreach ($nameLines as $lineIndex => $nameLine) {
            gshop_pdf_text($pdf, $x + 4, $nameBaseline - $lineIndex * 7.2, $nameLine, 6.1, '', $columns[0] - 8);
        }
        $values = [
            gshop_document_quantity($item['quantity']),
            gshop_document_money($item['unitPrice'], $currency),
            gshop_document_money($item['totalPrice'], $currency),
        ];
        $cursorX = $x + $columns[0];
        foreach ($values as $index => $value) {
            $cellWidth = $columns[$index + 1];
            gshop_document_shrink_text($pdf, $cursorX + 4, $baseline, $value, $cellWidth - 8, 6.1, 4.8, '', 'R');
            $cursorX += $cellWidth;
        }
        $rowTop = $rowBottom;
    }
}

/** @param array{path:string,width:int,height:int}|null $signature */
function gshop_sales_document_compact_agreement(
    GshopServiceDocumentPdf $pdf,
    array $document,
    array $snapshot,
    ?array $signature,
    ?string $stampPath,
    float $sourceTop
): void {
    $client = is_array($snapshot['client'] ?? null) ? $snapshot['client'] : [];
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $agreement = is_array($snapshot['agreement'] ?? null) ? $snapshot['agreement'] : [];
    $agreementAt = $document['agreementAt'] ?? $agreement['date'] ?? $sheet['finalAgreementAt'] ?? '';

    gshop_document_section_title($pdf, $sourceTop, 6, 'Observații finale', 'mențiuni comerciale');
    $observationsTop = $sourceTop - GSHOP_DOCUMENT_TITLE_GAP;
    $observationsBottom = $observationsTop - 55;
    gshop_document_box($pdf, GSHOP_DOCUMENT_MARGIN, $observationsBottom, GSHOP_DOCUMENT_CONTENT_WIDTH, 55, 'white', 'line', 8, .7);
    gshop_pdf_text($pdf, 33, $observationsTop - 15, 'ALTE OBSERVAȚII', 5.1, 'B', 112, 'L', gshop_document_color('slate'));
    $notes = gshop_pdf_string($sheet['finalNotes'] ?? '');
    if ($notes === '') $notes = 'Devizul include produsele și serviciile agreate. Orice modificare se face numai cu acordul clientului.';
    gshop_pdf_multiline($pdf, 33, $observationsTop - 31, 529, $notes, 2, 6.5, 9.5);

    $termTitle = $observationsBottom - 18;
    gshop_document_section_title($pdf, $termTitle, 7, 'Termen estimat', 'calculat de la acordul final');
    $termTop = $termTitle - GSHOP_DOCUMENT_TITLE_GAP;
    $termBottom = $termTop - 42;
    gshop_document_box($pdf, GSHOP_DOCUMENT_MARGIN, $termBottom, GSHOP_DOCUMENT_CONTENT_WIDTH, 42, 'electricLight', 'electricLight', 8, .7);
    gshop_pdf_text($pdf, 34, $termBottom + 23, 'TERMEN ESTIMAT', 5.3, 'B', 76, 'L', gshop_document_color('slate'));
    $days = gshop_pdf_string($sheet['estimatedRepairDays'] ?? '');
    $pdf->SetFont('DejaVu', 'B', 7.1);
    $daysLineWidth = max(18.0, min(54.0, $pdf->GetStringWidth($days) + 10));
    gshop_document_source_line($pdf, 109, $termBottom + 20, 109 + $daysLineWidth, $termBottom + 20, 'lineDark', .8);
    gshop_pdf_text($pdf, 113, $termBottom + 22, $days, 7.1, 'B', max(10, $daysLineWidth - 7));
    gshop_pdf_text($pdf, 118 + $daysLineWidth, $termBottom + 23, 'zile de la data acordului final al clientului', 6.6, '', 285);

    $agreementTitle = $termBottom - 18;
    gshop_document_section_title($pdf, $agreementTitle, 8, 'Acord final client', 'acceptarea devizului și a termenului');
    $cardTop = $agreementTitle - GSHOP_DOCUMENT_TITLE_GAP;
    $cardBottom = 55.0;
    $cardHeight = max(210.0, $cardTop - $cardBottom);
    gshop_document_box($pdf, GSHOP_DOCUMENT_MARGIN, $cardBottom, GSHOP_DOCUMENT_CONTENT_WIDTH, $cardHeight, 'white', 'line', 8, .7);

    $status = strtoupper(gshop_pdf_string($agreement['status'] ?? ''));
    $accepted = in_array($status, ['AGREE', 'ACCEPTED'], true);
    $refused = in_array($status, ['DISAGREE', 'REJECTED', 'REFUSED'], true);
    $decision = $accepted ? 'acceptă' : ($refused ? 'nu acceptă' : 'nu și-a exprimat încă acordul privind');
    $clientName = gshop_document_client_name($client) ?: 'Client nespecificat';
    $paragraphTop = $cardTop - 14;
    $paragraphBottom = $paragraphTop - 68;
    gshop_document_box($pdf, 33, $paragraphBottom, 529, 68, 'electricLight', 'electricLight', 8, .7);
    gshop_document_rich_paragraph($pdf, 45, $paragraphTop - 27, 505, [
        ['text' => 'Clientul'],
        ['text' => $clientName, 'style' => 'B'],
        ['text' => $decision, 'style' => 'B'],
        ['text' => 'devizul final, care include produsele, serviciile și valorile prezentate, precum și termenul convenit.'],
    ], 7.4, 10.5, 3);

    $checkBottom = $paragraphBottom - 24;
    gshop_document_box($pdf, 44, $checkBottom, 9, 9, 'white', 'slate', 1.5, .7);
    gshop_document_box($pdf, 190, $checkBottom, 9, 9, 'white', 'slate', 1.5, .7);
    if ($accepted) gshop_document_check($pdf, 44, $checkBottom + 1);
    elseif ($refused) gshop_document_check($pdf, 190, $checkBottom + 1, 'danger');
    gshop_pdf_text($pdf, 58, $checkBottom + 1, 'ACCEPTĂ DEVIZUL', 5.4, 'B', 102);
    gshop_pdf_text($pdf, 204, $checkBottom + 1, 'NU ACCEPTĂ DEVIZUL', 5.4, 'B', 118);

    $identityBaseline = $checkBottom - 27;
    gshop_pdf_text($pdf, 44, $identityBaseline, 'DATA / ORA:', 7.0, 'B', 66, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 112, $identityBaseline - 3, 242, $identityBaseline - 3, 'lineDark', .8);
    gshop_document_shrink_text($pdf, 116, $identityBaseline - 1, gshop_document_date($agreementAt), 123, 8.2, 5.2, '');
    gshop_pdf_text($pdf, 280, $identityBaseline, 'NUME ȘI PRENUME / FIRMĂ:', 7.0, 'B', 110, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 392, $identityBaseline - 3, 548, $identityBaseline - 3, 'lineDark', .8);
    gshop_document_shrink_text($pdf, 394, $identityBaseline - 1, $clientName, 150, 8.2, 4.0, '');

    $signatureLabel = $identityBaseline - 29;
    gshop_pdf_text($pdf, 44, $signatureLabel, 'ȘTAMPILĂ', 5.8, 'B', 150, 'L', gshop_document_color('slate'));
    gshop_pdf_text($pdf, 370, $signatureLabel, 'SEMNĂTURĂ CLIENT', 5.8, 'B', 143, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 370, $signatureLabel - 37, 472, $signatureLabel - 37, 'lineDark', .85);
    $imageBottom = $cardBottom + 12;
    $imageHeight = max(45.0, min(82.0, $signatureLabel - $imageBottom - 10));
    gshop_document_place_image($pdf, $stampPath, 43, $imageBottom, 90, $imageHeight);
    gshop_document_place_image($pdf, $signature['path'] ?? null, 372, $signatureLabel - 35, 98, 18, $signature);
}

/** @param array{path:string,width:int,height:int}|null $signature */
function gshop_sales_document_build_final(
    GshopServiceDocumentPdf $pdf,
    array $document,
    array $snapshot,
    array $templates,
    ?array $signature,
    ?string $stampPath
): int {
    $snapshot = gshop_sales_document_snapshot_with_table_totals($snapshot);
    $company = is_array($snapshot['company'] ?? null) ? $snapshot['company'] : [];
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $currency = gshop_document_financial_values($snapshot)['currency'];
    $plans = gshop_document_plan_final($pdf, $snapshot);
    $totalPages = count($plans);
    foreach ($plans as $index => $plan) {
        gshop_document_add_template($pdf, $plan['first'] ? $templates['intro'] : $templates['continuation']);
        gshop_document_overlay_sales_template($pdf, $snapshot, $plan['first'] ? 'FINAL_INTRO' : 'FINAL_CONTINUATION', $plan['first'] ? 682 : 732);
        gshop_pdf_text($pdf, 355, 779, $document['number'] ?? '', 6.3, 'B', 91);
        gshop_pdf_text($pdf, 464, 779, gshop_document_date($document['documentAt'] ?? ''), 6.3, 'B', 87);
        if ($plan['first']) {
            gshop_document_overlay_company($pdf, $company);
            gshop_document_reference($pdf, $snapshot, 682);
            gshop_pdf_multiline($pdf, 33, 621, 529, $sheet['reportedIssue'] ?? '', 3, 7, 10);
            gshop_pdf_multiline($pdf, 33, 540, 529, $sheet['technicalAssessment'] ?? '', 4, 7, 11);
            $cursor = 474.0;
        } else {
            gshop_document_reference($pdf, $snapshot, 732);
            $cursor = 696.0;
        }
        $rowExtra = 0.0;
        if (!$plan['totals']) {
            $plannedEnd = $cursor;
            $rowCount = 0;
            foreach ($plan['sections'] as $section) {
                $items = is_array($section['items'] ?? null) ? $section['items'] : [];
                $contentHeight = $items ? gshop_document_table_height($pdf, $items) : GSHOP_DOCUMENT_EMPTY_TABLE;
                $plannedEnd -= GSHOP_DOCUMENT_TITLE_GAP + $contentHeight + GSHOP_DOCUMENT_SECTION_GAP;
                $rowCount += count($items);
            }
            if ($rowCount > 0) $rowExtra = min(6.5, max(0.0, ($plannedEnd - GSHOP_DOCUMENT_BOTTOM) / $rowCount));
        }
        foreach ($plan['sections'] as $section) {
            gshop_document_section_title($pdf, $cursor, (int)$section['number'], (string)$section['title'], (string)$section['subtitle']);
            $contentTop = $cursor - GSHOP_DOCUMENT_TITLE_GAP;
            if ($section['items']) {
                $height = gshop_document_table_height($pdf, $section['items'], $rowExtra);
                $contentBottom = $contentTop - $height;
                gshop_sales_document_table($pdf, $contentBottom, $section['items'], $currency, $rowExtra);
            } else {
                $contentBottom = $contentTop - GSHOP_DOCUMENT_EMPTY_TABLE;
                gshop_document_empty_table($pdf, $contentBottom, (string)$section['emptyLabel']);
            }
            $cursor = $contentBottom - GSHOP_DOCUMENT_SECTION_GAP;
        }
        if ($plan['totals']) {
            gshop_document_section_title($pdf, $cursor, 5, 'Rezumat financiar');
            $totalsBottom = $cursor - GSHOP_DOCUMENT_TITLE_GAP - GSHOP_DOCUMENT_TOTALS_HEIGHT;
            gshop_document_totals($pdf, $snapshot, $totalsBottom);
            gshop_sales_document_compact_agreement($pdf, $document, $snapshot, $signature, $stampPath, $totalsBottom - 18);
        }
        gshop_document_footer($pdf, $index + 1, $totalPages, gshop_document_footer_label($snapshot, 'G-SHOP | DEVIZ FINAL'));
    }
    return $totalPages;
}

function gshop_sales_document_overlay_warranty_quantity(GshopServiceDocumentPdf $pdf, array $snapshot): void {
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $quantity = gshop_document_quantity($sheet['quantity'] ?? 0) . ' buc.';
    gshop_document_box($pdf, 32, 527, 253, 20, 'white', 'white', 0, 0);
    gshop_pdf_text($pdf, 33, 536, 'CANTITATE', 5.2, 'B', 80, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 117, 531, 281, 531, 'lineDark', .55);
    gshop_document_shrink_text($pdf, 117, 536, $quantity, 164, 6.6, 5.0, '');
}

/** @param array{path:string,width:int,height:int}|null $signature */
function gshop_sales_document_overlay_warranty_signature_block(
    GshopServiceDocumentPdf $pdf,
    array $document,
    array $snapshot,
    ?array $signature,
    ?string $stampPath
): void {
    $client = is_array($snapshot['client'] ?? null) ? $snapshot['client'] : [];
    $warranty = is_array($snapshot['warranty'] ?? null) ? $snapshot['warranty'] : [];
    $clientName = gshop_document_client_name($client) ?: 'Client nespecificat';
    gshop_document_box($pdf, 34, 110, 527, 140, 'white', 'white', 0, 0);
    gshop_pdf_text($pdf, 36, 237, 'DATA / ORA:', 7.0, 'B', 68, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 104, 233, 234, 233, 'lineDark', .8);
    gshop_document_shrink_text($pdf, 108, 235, gshop_document_date($document['documentAt'] ?? $warranty['date'] ?? ''), 123, 8.2, 5.2, '');
    gshop_pdf_text($pdf, 270, 237, 'NUME ȘI PRENUME / FIRMĂ:', 7.0, 'B', 110, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 382, 233, 545, 233, 'lineDark', .8);
    gshop_document_shrink_text($pdf, 386, 235, $clientName, 155, 8.2, 4.0, '');
    gshop_pdf_text($pdf, 36, 208, 'ȘTAMPILĂ', 5.8, 'B', 150, 'L', gshop_document_color('slate'));
    gshop_pdf_text($pdf, 360, 208, 'SEMNĂTURĂ CLIENT', 5.8, 'B', 150, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 360, 172, 462, 172, 'lineDark', .85);
    gshop_document_place_image($pdf, $stampPath, 35, 106, 90, 90);
    gshop_document_place_image($pdf, $signature['path'] ?? null, 362, 174, 98, 18, $signature);
}

/** @return array{filePath:string,url:string,sha256:string,generatedAt:string} */
function generate_sales_document_pdf(string $type, array $document, array $snapshot, ?string $signaturePath, ?string $stampPath, ?string $revisionToken = null): array {
    $type = validated_sales_document_type($type);
    $serviceSnapshot = gshop_sales_document_service_snapshot($snapshot);
    $templateRoot = __DIR__ . '/../assets/sales-document-templates';
    $templates = $type === 'FINAL_ESTIMATE' ? [
        'intro' => $templateRoot . '/final-estimate-intro.pdf',
        'continuation' => $templateRoot . '/final-estimate-continuation.pdf',
        'agreement' => $templateRoot . '/final-estimate-agreement.pdf',
    ] : ['warranty' => $templateRoot . '/warranty.pdf'];
    foreach ($templates as $template) if (!is_file($template)) throw new RuntimeException('Șablonul PDF al documentului Shop nu este disponibil.');

    $relativeDirectory = 'uploads/sales-documents/v2';
    if ($revisionToken !== null) {
        $revisionToken = strtolower(trim($revisionToken));
        if (!preg_match('/^[a-z0-9-]{8,80}$/', $revisionToken)) throw new InvalidArgumentException('Versiunea PDF a documentului nu este validă.');
        $relativeDirectory .= '/revisions/' . $revisionToken;
    }
    $directory = __DIR__ . '/../' . $relativeDirectory;
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) throw new RuntimeException('Directorul documentelor Shop nu poate fi creat.');
    $relativePath = $relativeDirectory . '/' . gshop_sales_document_file_name($type, $snapshot);
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
            gshop_sales_document_build_final($pdf, $document, $serviceSnapshot, $templates, $signature, $stamp);
        } else {
            gshop_document_add_template($pdf, $templates['warranty']);
            gshop_document_overlay_sales_template($pdf, $serviceSnapshot, 'WARRANTY', 679);
            gshop_document_overlay_warranty($pdf, $document, $serviceSnapshot, $signature, $stamp);
            gshop_sales_document_overlay_warranty_quantity($pdf, $serviceSnapshot);
            gshop_sales_document_overlay_warranty_signature_block($pdf, $document, $serviceSnapshot, $signature, $stamp);
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
