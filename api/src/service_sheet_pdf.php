<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use setasign\Fpdi\Tfpdf\Fpdi;

const GSHOP_PDF_PAGE_HEIGHT = 841.8898;

function gshop_pdf_string(mixed $value): string {
    return trim((string)($value ?? ''));
}

function gshop_pdf_date(mixed $value, bool $withTime = false): string {
    $raw = gshop_pdf_string($value);
    if ($raw === '') return '';
    $timestamp = strtotime($raw);
    if ($timestamp === false) return $raw;
    return gmdate($withTime ? 'd.m.Y, H:i' : 'd.m.Y', $timestamp);
}

function gshop_pdf_money(mixed $value, string $currency): string {
    return number_format((float)$value, 2, ',', '.') . ' ' . $currency;
}

function gshop_pdf_full_address(array $data): string {
    return implode(', ', array_values(array_filter([
        gshop_pdf_string($data['address'] ?? ''),
        gshop_pdf_string($data['city'] ?? ''),
        gshop_pdf_string($data['county'] ?? ''),
        gshop_pdf_string($data['postalCode'] ?? ''),
        gshop_pdf_string($data['country'] ?? ''),
    ])));
}

function gshop_pdf_fit(Fpdi $pdf, string $value, float $width): string {
    if ($pdf->GetStringWidth($value) <= $width) return $value;
    $suffix = '...';
    while ($value !== '' && $pdf->GetStringWidth($value . $suffix) > $width) {
        $value = function_exists('mb_substr') ? mb_substr($value, 0, -1, 'UTF-8') : substr($value, 0, -1);
    }
    return rtrim($value) . $suffix;
}

function gshop_pdf_text(Fpdi $pdf, float $x, float $sourceBaseline, mixed $value, float $size = 7, string $style = '', float $maxWidth = 0, string $align = 'L'): void {
    $text = gshop_pdf_string($value);
    if ($text === '') return;
    $pdf->SetFont('DejaVu', $style, $size);
    $pdf->SetTextColor(7, 21, 45);
    if ($maxWidth > 0) $text = gshop_pdf_fit($pdf, $text, $maxWidth);
    if ($align === 'R' && $maxWidth > 0) $x += $maxWidth - $pdf->GetStringWidth($text);
    $pdf->Text($x, GSHOP_PDF_PAGE_HEIGHT - $sourceBaseline, $text);
}

function gshop_pdf_multiline(Fpdi $pdf, float $x, float $sourceTopBaseline, float $width, mixed $value, int $maxLines, float $size = 7, float $lineHeight = 11): void {
    $text = preg_replace('/\s+/u', ' ', gshop_pdf_string($value)) ?? '';
    if ($text === '') return;
    $pdf->SetFont('DejaVu', '', $size);
    $pdf->SetTextColor(7, 21, 45);
    $words = preg_split('/\s+/u', $text) ?: [];
    $lines = [];
    $line = '';
    foreach ($words as $word) {
        $candidate = $line === '' ? $word : $line . ' ' . $word;
        if ($pdf->GetStringWidth($candidate) <= $width) { $line = $candidate; continue; }
        if ($line !== '') $lines[] = $line;
        $line = $word;
        if (count($lines) >= $maxLines) break;
    }
    if ($line !== '' && count($lines) < $maxLines) $lines[] = $line;
    if (count($lines) === $maxLines && count($words) > 0) $lines[$maxLines - 1] = gshop_pdf_fit($pdf, $lines[$maxLines - 1], $width);
    foreach ($lines as $index => $item) gshop_pdf_text($pdf, $x, $sourceTopBaseline - $index * $lineHeight, $item, $size);
}

function gshop_pdf_image_path(?string $relativePath): ?string {
    if (!$relativePath) return null;
    $candidate = realpath(__DIR__ . '/../' . ltrim($relativePath, '/\\'));
    $apiRoot = realpath(__DIR__ . '/..');
    if ($candidate === false || $apiRoot === false || !str_starts_with($candidate, $apiRoot) || !is_file($candidate)) return null;
    $extension = strtolower(pathinfo($candidate, PATHINFO_EXTENSION));
    if (in_array($extension, ['png','jpg','jpeg'], true)) return $candidate;
    if (!function_exists('imagecreatefromstring')) return null;
    $image = @imagecreatefromstring((string)file_get_contents($candidate));
    if (!$image) return null;
    $temporary = tempnam(sys_get_temp_dir(), 'gshop-pdf-image-');
    if ($temporary === false) { imagedestroy($image); return null; }
    $png = $temporary . '.png';
    @unlink($temporary);
    imagealphablending($image, false);
    imagesavealpha($image, true);
    imagepng($image, $png, 7);
    imagedestroy($image);
    return $png;
}

function gshop_pdf_overlay_page_one(Fpdi $pdf, array $sheet, array $client, array $financial, array $summary, array $company): void {
    $showCompany = !empty($sheet['showCompanyDetails']);
    $shift = $showCompany ? 0.0 : 48.0;
    $currency = gshop_pdf_string($financial['currencyCode'] ?? $sheet['currencyCode'] ?? 'RON') ?: 'RON';
    gshop_pdf_text($pdf, 98, 780, $company['propertyName'] ?? '', 7.4, 'B', 230);
    gshop_pdf_text($pdf, 353, 779, $sheet['number'] ?? '', 9.2, 'B', 91);
    gshop_pdf_text($pdf, 459, 779, gshop_pdf_date($sheet['receivedAt'] ?? ''), 6.8, 'B', 91);

    if ($showCompany) {
        gshop_pdf_text($pdf, 34, 723, $company['legalName'] ?? '', 7.2, 'B', 216);
        gshop_pdf_text($pdf, 269, 723, $company['taxId'] ?? '', 7.2, 'B', 82);
        gshop_pdf_text($pdf, 370, 723, $company['tradeRegisterNumber'] ?? '', 6.9, '', 181);
        gshop_pdf_text($pdf, 34, 697, gshop_pdf_full_address($company), 6.8, '', 224);
        gshop_pdf_text($pdf, 277, 697, $company['phone'] ?? '', 6.8, '', 82);
        gshop_pdf_text($pdf, 378, 697, $company['email'] ?? '', 6.8, '', 173);
    }

    $clientName = trim(gshop_pdf_string($client['firstName'] ?? '') . ' ' . gshop_pdf_string($client['lastName'] ?? ''));
    $leftX = 111.0;
    foreach ([
        [640, $clientName], [623, $client['phone'] ?? ''], [606, $client['secondaryPhone'] ?? ''],
        [589, $client['email'] ?? ''], [572, gshop_pdf_full_address($client)],
    ] as [$baseline, $value]) gshop_pdf_text($pdf, $leftX, $baseline + $shift, $value, 7, '', 170);
    foreach ([
        [640, $sheet['equipment'] ?? ''], [623, $sheet['brand'] ?? ''], [606, $sheet['model'] ?? ''],
        [589, $sheet['serialNumber'] ?? ''], [572, $sheet['accessories'] ?? ''],
    ] as [$baseline, $value]) gshop_pdf_text($pdf, 390, $baseline + $shift, $value, 7, '', 168);

    gshop_pdf_multiline($pdf, 33, 497 + $shift, 252, $sheet['reportedIssue'] ?? '', 8);
    gshop_pdf_multiline($pdf, 309, 495 + $shift, 250, $sheet['technicalAssessment'] ?? '', 3);
    gshop_pdf_multiline($pdf, 309, 438 + $shift, 250, $sheet['workPerformed'] ?? '', 2);
    gshop_pdf_multiline($pdf, 309, 395 + $shift, 250, $sheet['partsUsed'] ?? '', 2);

    $summaryCards = [
        $summary['totalDue'] ?? $sheet['totalCost'] ?? 0,
        $summary['receivedAmount'] ?? $financial['advancePaid'] ?? 0,
        $summary['remainingDue'] ?? 0,
    ];
    $summaryPositions = [[44, 280, 185], [259, 280, 121], [410, 280, 141]];
    foreach ($summaryCards as $index => $value) {
        [$x, $baseline, $width] = $summaryPositions[$index];
        gshop_pdf_text($pdf, $x, $baseline + $shift, gshop_pdf_money($value, $currency), $index === 0 ? 12.2 : 10.6, 'B', $width);
    }
    $details = [
        gshop_pdf_money($financial['diagnosticFee'] ?? 0, $currency),
        gshop_pdf_money($financial['displayedPartsCost'] ?? $sheet['partsCost'] ?? 0, $currency),
        gshop_pdf_money($financial['displayedLaborCost'] ?? $sheet['laborCost'] ?? 0, $currency),
        ($financial['discountPercent'] ?? 0) . '%',
        $currency,
    ];
    foreach ($details as $index => $value) {
        gshop_pdf_text($pdf, 41 + $index * 107, 230 + $shift, $value, 7, 'B', 85);
    }

    gshop_pdf_text($pdf, 118, 158 + $shift, gshop_pdf_date($sheet['receivedAt'] ?? ''), 6.8, '', 80);
    gshop_pdf_text($pdf, 295, 158 + $shift, gshop_pdf_date($sheet['estimatedAt'] ?? ''), 6.8, '', 82);
    gshop_pdf_text($pdf, 455, 158 + $shift, gshop_pdf_date($sheet['completedAt'] ?? ''), 6.8, '', 103);
    gshop_pdf_text($pdf, 100, 137 + $shift, $sheet['technicianName'] ?? '', 6.8, '', 455);
    gshop_pdf_multiline($pdf, 33, 97 + $shift, 525, $sheet['handoverNotes'] ?? '', 4, 6.8, 14);
}

function gshop_pdf_overlay_page_two(Fpdi $pdf, array $sheet, array $client, string $propertyName, ?string $signaturePath, ?string $stampPath): void {
    gshop_pdf_text($pdf, 98, 780, $propertyName, 7.4, 'B', 420);
    $checkXs = [34.0, 165.75, 297.5, 429.25];
    $checks = ['approveDiagnostics','approveRepair','repairRefused','productDelivered'];
    foreach ($checks as $index => $key) if (!empty($sheet[$key])) gshop_pdf_text($pdf, $checkXs[$index] + 1, 517, '✓', 8.5, 'B');
    gshop_pdf_text($pdf, 100, 487, $sheet['warranty'] ?? '', 6.8, '', 92);
    gshop_pdf_text($pdf, 270, 487, $sheet['storageAfter'] ?? '', 6.8, '', 86);
    $statuses = ['NEW'=>'Nouă','WAITING'=>'În așteptare','VERIFYING'=>'În verificare','IN_PROGRESS'=>'În lucru','WAITING_PARTS'=>'Așteptăm piesele','COMPLETED'=>'Finalizată','DELIVERED'=>'Predată','CANCELLED'=>'Anulată'];
    gshop_pdf_text($pdf, 445, 487, $statuses[$sheet['status'] ?? ''] ?? ($sheet['status'] ?? ''), 6.8, '', 112);
    gshop_pdf_text($pdf, 130, 464, $sheet['handoverNotes'] ?? '', 6.8, '', 426);

    $clientName = trim(gshop_pdf_string($client['firstName'] ?? '') . ' ' . gshop_pdf_string($client['lastName'] ?? ''));
    gshop_pdf_text($pdf, 112, 379, $clientName, 7, '', 245);
    gshop_pdf_text($pdf, 110, 355, gshop_pdf_date($sheet['signedAt'] ?? '', true), 6.8, '', 245);
    gshop_pdf_text($pdf, 455, 379, $sheet['technicianName'] ?? '', 6.8, '', 102);

    $signature = gshop_pdf_image_path($signaturePath);
    if ($signature) $pdf->Image($signature, 34, 517, 323, 38);
    if (!empty($sheet['showCompanyDetails'])) {
        $stamp = gshop_pdf_image_path($stampPath);
        if ($stamp) $pdf->Image($stamp, 381, 517, 168, 38);
    }
    foreach ([$signature ?? null, isset($stamp) ? $stamp : null] as $temporary) {
        if ($temporary && str_starts_with($temporary, sys_get_temp_dir()) && is_file($temporary)) @unlink($temporary);
    }
}

function generate_service_sheet_pdf(array $sheet, array $client, array $financial, array $summary, array $company, ?string $signaturePath, ?string $stampPath): array {
    $withCompany = !empty($sheet['showCompanyDetails']);
    $paid = ($financial['paymentStatus'] ?? 'UNPAID') === 'PAID' && (float)($summary['remainingDue'] ?? 0) <= 0.009;
    $template = __DIR__ . '/../assets/service-sheet-templates/' . ($withCompany ? 'with-company' : 'without-company') . '/' . ($paid ? 'paid.pdf' : 'unpaid.pdf');
    if (!is_file($template)) throw new RuntimeException('Șablonul PDF al fișei nu este disponibil.');

    $directory = __DIR__ . '/../uploads/service-sheets';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) throw new RuntimeException('Directorul PDF nu poate fi creat.');
    foreach (glob($directory . '/*.pdf') ?: [] as $existing) if (is_file($existing) && filemtime($existing) < time() - 1209600) @unlink($existing);

    $safeNumber = preg_replace('/[^A-Za-z0-9_-]+/', '-', gshop_pdf_string($sheet['number'] ?? 'fisa-service')) ?: 'fisa-service';
    $filename = strtolower($safeNumber) . '-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.pdf';
    $output = $directory . '/' . $filename;

    $pdf = new Fpdi('P', 'pt', 'A4');
    $pdf->SetAutoPageBreak(false);
    $pdf->SetMargins(0, 0, 0);
    $pdf->SetTitle('Fișă de service ' . gshop_pdf_string($sheet['number'] ?? ''), true);
    $pdf->SetAuthor('G-Shop', true);
    $pdf->AddFont('DejaVu', '', 'DejaVuSans.ttf', true);
    $pdf->AddFont('DejaVu', 'B', 'DejaVuSans-Bold.ttf', true);
    $pageCount = $pdf->setSourceFile($template);
    for ($page = 1; $page <= $pageCount; $page++) {
        $templateId = $pdf->importPage($page);
        $size = $pdf->getTemplateSize($templateId);
        $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
        $pdf->useTemplate($templateId);
        if ($page === 1) gshop_pdf_overlay_page_one($pdf,$sheet,$client,$financial,$summary,$company);
        if ($page === 2) gshop_pdf_overlay_page_two($pdf,$sheet,$client,gshop_pdf_string($company['propertyName'] ?? ''),$signaturePath,$stampPath);
    }
    $pdf->Output('F', $output, true);
    if (!is_file($output) || filesize($output) < 1000) throw new RuntimeException('Fișa PDF nu a putut fi generată.');
    return ['path'=>$output,'fileName'=>$filename,'generatedAt'=>gmdate('c')];
}
