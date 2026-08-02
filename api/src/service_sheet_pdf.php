<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use setasign\Fpdi\Tfpdf\Fpdi;

const GSHOP_PDF_PAGE_HEIGHT = 841.8898;

function gshop_pdf_string(mixed $value): string {
    return trim((string)($value ?? ''));
}

function gshop_pdf_property_label(mixed $value): string {
    $name = gshop_pdf_string($value);
    if ($name === '') return '';
    $uppercase = function_exists('mb_strtoupper') ? mb_strtoupper($name, 'UTF-8') : strtoupper($name);
    return 'G-SHOP | ' . $uppercase;
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

function gshop_pdf_text(Fpdi $pdf, float $x, float $sourceBaseline, mixed $value, float $size = 7, string $style = '', float $maxWidth = 0, string $align = 'L', ?array $color = null): void {
    $text = gshop_pdf_string($value);
    if ($text === '') return;
    $pdf->SetFont('DejaVu', $style, $size);
    $textColor = $color ?? [7, 21, 45];
    $pdf->SetTextColor((int)$textColor[0], (int)$textColor[1], (int)$textColor[2]);
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

function gshop_pdf_png_paeth(int $left, int $above, int $upperLeft): int {
    $estimate = $left + $above - $upperLeft;
    $leftDistance = abs($estimate - $left);
    $aboveDistance = abs($estimate - $above);
    $upperLeftDistance = abs($estimate - $upperLeft);
    if ($leftDistance <= $aboveDistance && $leftDistance <= $upperLeftDistance) return $left;
    return $aboveDistance <= $upperLeftDistance ? $above : $upperLeft;
}

/** @return array{path:string,width:int,height:int}|null */
function gshop_pdf_signature_image(?string $relativePath): ?array {
    if (!$relativePath) return null;
    $candidate = realpath(__DIR__ . '/../' . ltrim($relativePath, '/\\'));
    $apiRoot = realpath(__DIR__ . '/..');
    if ($candidate === false || $apiRoot === false || !str_starts_with($candidate, $apiRoot) || !is_file($candidate)) return null;
    $binary = @file_get_contents($candidate);
    if (!is_string($binary) || !str_starts_with($binary, "\x89PNG\r\n\x1a\n")) return null;

    $offset = 8;
    $ihdr = null;
    $compressed = '';
    $binaryLength = strlen($binary);
    while ($offset + 12 <= $binaryLength) {
        $lengthData = unpack('Nlength', substr($binary, $offset, 4));
        $length = (int)($lengthData['length'] ?? -1);
        $type = substr($binary, $offset + 4, 4);
        if ($length < 0 || $offset + 12 + $length > $binaryLength) return null;
        $chunk = substr($binary, $offset + 8, $length);
        if ($type === 'IHDR') $ihdr = $chunk;
        if ($type === 'IDAT') $compressed .= $chunk;
        $offset += 12 + $length;
        if ($type === 'IEND') break;
    }
    if (!is_string($ihdr) || strlen($ihdr) !== 13 || $compressed === '') return null;
    $header = unpack('Nwidth/Nheight/CbitDepth/CcolorType/Ccompression/Cfilter/Cinterlace', $ihdr);
    $width = (int)($header['width'] ?? 0);
    $height = (int)($header['height'] ?? 0);
    if ($width < 1 || $height < 1 || $width > 4096 || $height > 4096 || (int)($header['bitDepth'] ?? 0) !== 8 || (int)($header['colorType'] ?? -1) !== 6 || (int)($header['interlace'] ?? 1) !== 0) return null;
    $inflated = @gzuncompress($compressed);
    $bytesPerPixel = 4;
    $stride = $width * $bytesPerPixel;
    if (!is_string($inflated) || strlen($inflated) < ($stride + 1) * $height) return null;

    $rows = [];
    $previous = '';
    $cursor = 0;
    for ($y = 0; $y < $height; $y++) {
        $filter = ord($inflated[$cursor]);
        $filtered = substr($inflated, $cursor + 1, $stride);
        $cursor += $stride + 1;
        $decoded = '';
        for ($i = 0; $i < $stride; $i++) {
            $value = ord($filtered[$i]);
            $left = $i >= $bytesPerPixel ? ord($decoded[$i - $bytesPerPixel]) : 0;
            $above = $previous !== '' ? ord($previous[$i]) : 0;
            $upperLeft = $previous !== '' && $i >= $bytesPerPixel ? ord($previous[$i - $bytesPerPixel]) : 0;
            $predictor = match ($filter) {
                0 => 0,
                1 => $left,
                2 => $above,
                3 => intdiv($left + $above, 2),
                4 => gshop_pdf_png_paeth($left, $above, $upperLeft),
                default => -1,
            };
            if ($predictor < 0) return null;
            $decoded .= chr(($value + $predictor) & 255);
        }
        $rows[] = $decoded;
        $previous = $decoded;
    }

    $corners = [[0,0],[$width - 1,0],[0,$height - 1],[$width - 1,$height - 1]];
    $background = [0,0,0,0];
    foreach ($corners as [$x,$y]) {
        $pixel = $x * 4;
        for ($channel = 0; $channel < 4; $channel++) $background[$channel] += ord($rows[$y][$pixel + $channel]);
    }
    $background = array_map(static fn(int $value): int => intdiv($value, 4), $background);
    $opaqueBackground = $background[3] > 240;
    $inkAlpha = static function (string $row, int $x) use ($background, $opaqueBackground): int {
        $pixel = $x * 4;
        $sourceAlpha = ord($row[$pixel + 3]);
        if (!$opaqueBackground) return $sourceAlpha;
        $difference = max(
            abs(ord($row[$pixel]) - $background[0]),
            abs(ord($row[$pixel + 1]) - $background[1]),
            abs(ord($row[$pixel + 2]) - $background[2])
        );
        return max(0, min(255, ($difference - 6) * 4));
    };

    $minX = $width;
    $minY = $height;
    $maxX = -1;
    $maxY = -1;
    foreach ($rows as $y => $row) {
        for ($x = 0; $x < $width; $x++) {
            if ($inkAlpha($row, $x) <= 8) continue;
            $minX = min($minX, $x);
            $minY = min($minY, $y);
            $maxX = max($maxX, $x);
            $maxY = max($maxY, $y);
        }
    }
    if ($maxX < $minX || $maxY < $minY) return null;
    $padding = max(4, (int)round(max($maxX - $minX + 1, $maxY - $minY + 1) * 0.018));
    $minX = max(0, $minX - $padding);
    $minY = max(0, $minY - $padding);
    $maxX = min($width - 1, $maxX + $padding);
    $maxY = min($height - 1, $maxY + $padding);
    $croppedWidth = $maxX - $minX + 1;
    $croppedHeight = $maxY - $minY + 1;

    $scanlines = '';
    for ($y = $minY; $y <= $maxY; $y++) {
        $scanlines .= "\x00";
        for ($x = $minX; $x <= $maxX; $x++) $scanlines .= "\x00\x00\x00" . chr($inkAlpha($rows[$y], $x));
    }
    $pngChunk = static function (string $type, string $data): string {
        return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
    };
    $normalized = "\x89PNG\r\n\x1a\n"
        . $pngChunk('IHDR', pack('NNCCCCC', $croppedWidth, $croppedHeight, 8, 6, 0, 0, 0))
        . $pngChunk('IDAT', gzcompress($scanlines, 7))
        . $pngChunk('IEND', '');
    $temporary = tempnam(sys_get_temp_dir(), 'gshop-signature-');
    if ($temporary === false) return null;
    $png = $temporary . '.png';
    @unlink($temporary);
    if (@file_put_contents($png, $normalized, LOCK_EX) === false) return null;
    return ['path'=>$png,'width'=>$croppedWidth,'height'=>$croppedHeight];
}

function gshop_pdf_overlay_page_one(Fpdi $pdf, array $sheet, array $client, array $financial, array $summary, array $company): void {
    $showCompany = !empty($sheet['showCompanyDetails']);
    $shift = $showCompany ? 0.0 : 48.0;
    $currency = gshop_pdf_string($financial['currencyCode'] ?? $sheet['currencyCode'] ?? 'RON') ?: 'RON';
    gshop_pdf_text($pdf, 98, 780, gshop_pdf_property_label($company['propertyName'] ?? ''), 7.4, 'B', 230);
    gshop_pdf_text($pdf, 353, 779, $sheet['number'] ?? '', 9.2, 'B', 91);
    gshop_pdf_text($pdf, 459, 779, gshop_pdf_date($sheet['receivedAt'] ?? ''), 6.8, 'B', 91);

    if ($showCompany) {
        gshop_pdf_text($pdf, 34, 723, $company['legalName'] ?? '', 7.2, 'B', 216);
        gshop_pdf_text($pdf, 269, 723, $company['taxId'] ?? '', 7.2, 'B', 82);
        gshop_pdf_text($pdf, 370, 723, $company['tradeRegisterNumber'] ?? '', 6.9, '', 181);
        gshop_pdf_text($pdf, 34, 697, gshop_pdf_full_address($company), 6.8, '', 249);
        gshop_pdf_text($pdf, 302, 697, $company['phone'] ?? '', 6.8, '', 65);
        gshop_pdf_text($pdf, 386, 697, $company['email'] ?? '', 6.6, '', 165);
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
        gshop_pdf_text(
            $pdf,
            $x,
            $baseline + $shift,
            gshop_pdf_money($value, $currency),
            $index === 0 ? 12.2 : 10.6,
            'B',
            $width,
            'L',
            $index === 0 ? [255, 255, 255] : null
        );
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
    gshop_pdf_text($pdf, 98, 780, gshop_pdf_property_label($propertyName), 7.4, 'B', 420);
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

    $signature = gshop_pdf_signature_image($signaturePath);
    if ($signature) {
        $boxX = 34.0;
        $boxY = 517.0;
        $boxWidth = 323.0;
        $boxHeight = 38.0;
        $scale = min($boxWidth / $signature['width'], $boxHeight / $signature['height']);
        $drawWidth = $signature['width'] * $scale;
        $drawHeight = $signature['height'] * $scale;
        $pdf->Image(
            $signature['path'],
            $boxX + ($boxWidth - $drawWidth) / 2,
            $boxY + ($boxHeight - $drawHeight) / 2,
            $drawWidth,
            $drawHeight,
            'PNG'
        );
    }
    if (!empty($sheet['showCompanyDetails'])) {
        $stamp = gshop_pdf_image_path($stampPath);
        if ($stamp) $pdf->Image($stamp, 381, 517, 168, 38);
    }
    foreach ([$signature['path'] ?? null, isset($stamp) ? $stamp : null] as $temporary) {
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
