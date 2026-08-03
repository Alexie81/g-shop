<?php
declare(strict_types=1);

require_once __DIR__ . '/service_sheet_pdf.php';

use setasign\Fpdi\Tfpdf\Fpdi;

const GSHOP_DOCUMENT_PAGE_WIDTH = 595.2756;
const GSHOP_DOCUMENT_MARGIN = 22.0;
const GSHOP_DOCUMENT_CONTENT_WIDTH = 551.2756;
const GSHOP_DOCUMENT_BOTTOM = 48.0;
const GSHOP_DOCUMENT_TITLE_GAP = 13.0;
const GSHOP_DOCUMENT_SECTION_GAP = 26.0;
const GSHOP_DOCUMENT_TABLE_HEADER = 18.0;
const GSHOP_DOCUMENT_TABLE_ROW = 17.0;
const GSHOP_DOCUMENT_EMPTY_TABLE = 28.0;
const GSHOP_DOCUMENT_TOTALS_HEIGHT = 143.0;

/**
 * FPDI extension used only for the rounded client-facing cards drawn over the
 * static templates. Coordinates accepted here use FPDF's top-left origin.
 */
final class GshopServiceDocumentPdf extends Fpdi {
    public function RoundedRect(float $x, float $y, float $w, float $h, float $r, string $style = 'D'): void {
        $operator = match ($style) {
            'F' => 'f',
            'FD', 'DF' => 'B',
            default => 'S',
        };
        $k = $this->k;
        $pageHeight = $this->h;
        $magic = 4 / 3 * (sqrt(2) - 1);
        $this->_out(sprintf('%.2F %.2F m', ($x + $r) * $k, ($pageHeight - $y) * $k));
        $this->_out(sprintf('%.2F %.2F l', ($x + $w - $r) * $k, ($pageHeight - $y) * $k));
        $this->_arc(
            ($x + $w - $r + $r * $magic) * $k,
            ($pageHeight - $y) * $k,
            ($x + $w) * $k,
            ($pageHeight - ($y + $r - $r * $magic)) * $k,
            ($x + $w) * $k,
            ($pageHeight - ($y + $r)) * $k
        );
        $this->_out(sprintf('%.2F %.2F l', ($x + $w) * $k, ($pageHeight - ($y + $h - $r)) * $k));
        $this->_arc(
            ($x + $w) * $k,
            ($pageHeight - ($y + $h - $r + $r * $magic)) * $k,
            ($x + $w - $r + $r * $magic) * $k,
            ($pageHeight - ($y + $h)) * $k,
            ($x + $w - $r) * $k,
            ($pageHeight - ($y + $h)) * $k
        );
        $this->_out(sprintf('%.2F %.2F l', ($x + $r) * $k, ($pageHeight - ($y + $h)) * $k));
        $this->_arc(
            ($x + $r - $r * $magic) * $k,
            ($pageHeight - ($y + $h)) * $k,
            $x * $k,
            ($pageHeight - ($y + $h - $r + $r * $magic)) * $k,
            $x * $k,
            ($pageHeight - ($y + $h - $r)) * $k
        );
        $this->_out(sprintf('%.2F %.2F l', $x * $k, ($pageHeight - ($y + $r)) * $k));
        $this->_arc(
            $x * $k,
            ($pageHeight - ($y + $r - $r * $magic)) * $k,
            ($x + $r - $r * $magic) * $k,
            ($pageHeight - $y) * $k,
            ($x + $r) * $k,
            ($pageHeight - $y) * $k
        );
        $this->_out($operator);
    }

    private function _arc(float $x1, float $y1, float $x2, float $y2, float $x3, float $y3): void {
        $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c', $x1, $y1, $x2, $y2, $x3, $y3));
    }
}

/** @return array{0:int,1:int,2:int} */
function gshop_document_color(string $name): array {
    return match ($name) {
        'electric' => [7, 92, 255],
        'electricDark' => [6, 70, 200],
        'electricLight' => [234, 241, 255],
        'navy' => [7, 21, 45],
        'slate' => [98, 113, 138],
        'line' => [228, 234, 243],
        'lineDark' => [200, 211, 227],
        'muted' => [247, 249, 252],
        'canvas' => [245, 248, 253],
        'success' => [20, 168, 59],
        'successSoft' => [228, 248, 232],
        'warning' => [224, 117, 20],
        'danger' => [205, 45, 45],
        'dangerSoft' => [253, 235, 238],
        'white' => [255, 255, 255],
        default => [0, 0, 0],
    };
}

function gshop_document_set_fill(Fpdi $pdf, string $name): void {
    [$r, $g, $b] = gshop_document_color($name);
    $pdf->SetFillColor($r, $g, $b);
}

function gshop_document_set_draw(Fpdi $pdf, string $name): void {
    [$r, $g, $b] = gshop_document_color($name);
    $pdf->SetDrawColor($r, $g, $b);
}

function gshop_document_box(
    GshopServiceDocumentPdf $pdf,
    float $x,
    float $sourceBottom,
    float $width,
    float $height,
    string $fill = 'white',
    string $stroke = 'line',
    float $radius = 8,
    float $lineWidth = 0.7
): void {
    gshop_document_set_fill($pdf, $fill);
    gshop_document_set_draw($pdf, $stroke);
    $pdf->SetLineWidth($lineWidth);
    $top = GSHOP_PDF_PAGE_HEIGHT - $sourceBottom - $height;
    if ($radius > 0) $pdf->RoundedRect($x, $top, $width, $height, $radius, 'DF');
    else $pdf->Rect($x, $top, $width, $height, 'DF');
}

function gshop_document_source_line(
    Fpdi $pdf,
    float $x1,
    float $sourceY1,
    float $x2,
    float $sourceY2,
    string $color = 'lineDark',
    float $width = 0.7
): void {
    gshop_document_set_draw($pdf, $color);
    $pdf->SetLineWidth($width);
    $pdf->Line($x1, GSHOP_PDF_PAGE_HEIGHT - $sourceY1, $x2, GSHOP_PDF_PAGE_HEIGHT - $sourceY2);
}

/** @return list<string> */
function gshop_document_wrap(Fpdi $pdf, mixed $value, float $width, float $size = 7, string $style = '', int $maxLines = 99): array {
    $text = preg_replace('/\s+/u', ' ', gshop_pdf_string($value)) ?? '';
    if ($text === '') return [];
    $pdf->SetFont('DejaVu', $style, $size);
    $words = preg_split('/\s+/u', $text) ?: [];
    $lines = [];
    $line = '';
    foreach ($words as $word) {
        $candidate = $line === '' ? $word : $line . ' ' . $word;
        if ($pdf->GetStringWidth($candidate) <= $width) {
            $line = $candidate;
            continue;
        }
        if ($line !== '') $lines[] = $line;
        if (count($lines) >= $maxLines) break;
        $line = '';
        while ($word !== '' && $pdf->GetStringWidth($word) > $width) {
            $length = function_exists('mb_strlen') ? mb_strlen($word, 'UTF-8') : strlen($word);
            $piece = '';
            $pieceLength = 0;
            for ($index = 1; $index <= $length; $index++) {
                $candidatePiece = function_exists('mb_substr') ? mb_substr($word, 0, $index, 'UTF-8') : substr($word, 0, $index);
                if ($pdf->GetStringWidth($candidatePiece) > $width && $piece !== '') break;
                $piece = $candidatePiece;
                $pieceLength = $index;
            }
            if ($piece === '') break;
            $lines[] = $piece;
            $word = function_exists('mb_substr') ? mb_substr($word, $pieceLength, null, 'UTF-8') : substr($word, $pieceLength);
            if (count($lines) >= $maxLines) break 2;
        }
        $line = $word;
    }
    if ($line !== '' && count($lines) < $maxLines) $lines[] = $line;
    if (count($lines) === $maxLines) $lines[$maxLines - 1] = gshop_pdf_fit($pdf, $lines[$maxLines - 1], $width);
    return $lines;
}

/**
 * Draws a short paragraph with per-segment bold and underline styling.
 *
 * @param list<array{text:string,style?:string,underline?:bool}> $segments
 */
function gshop_document_rich_paragraph(
    Fpdi $pdf,
    float $x,
    float $sourceBaseline,
    float $width,
    array $segments,
    float $size = 6.55,
    float $lineHeight = 8.2,
    int $maxLines = 3
): int {
    $tokens = [];
    foreach ($segments as $segment) {
        $words = preg_split('/\s+/u', trim((string)($segment['text'] ?? ''))) ?: [];
        foreach ($words as $word) {
            if ($word === '') continue;
            $tokens[] = [
                'text' => $word,
                'style' => (string)($segment['style'] ?? ''),
                'underline' => !empty($segment['underline']),
            ];
        }
    }
    if (!$tokens) return 0;
    $lines = [[]];
    $lineWidths = [0.0];
    foreach ($tokens as $token) {
        $lineIndex = count($lines) - 1;
        $pdf->SetFont('DejaVu', $token['style'], $size);
        $wordWidth = $pdf->GetStringWidth($token['text']);
        $pdf->SetFont('DejaVu', '', $size);
        $spaceWidth = $lines[$lineIndex] ? $pdf->GetStringWidth(' ') : 0.0;
        if ($lines[$lineIndex] && $lineWidths[$lineIndex] + $spaceWidth + $wordWidth > $width) {
            if (count($lines) >= $maxLines) break;
            $lines[] = [];
            $lineWidths[] = 0.0;
            $lineIndex++;
            $spaceWidth = 0.0;
        }
        $token['spaceBefore'] = $spaceWidth;
        $token['width'] = $wordWidth;
        $lines[$lineIndex][] = $token;
        $lineWidths[$lineIndex] += $spaceWidth + $wordWidth;
    }
    foreach ($lines as $lineIndex => $line) {
        $cursorX = $x;
        $baseline = $sourceBaseline - $lineIndex * $lineHeight;
        foreach ($line as $token) {
            $cursorX += $token['spaceBefore'];
            gshop_pdf_text($pdf, $cursorX, $baseline, $token['text'], $size, $token['style'], $token['width'] + .5);
            if ($token['underline']) gshop_document_source_line($pdf, $cursorX, $baseline - 1.5, $cursorX + $token['width'], $baseline - 1.5, 'navy', .55);
            $cursorX += $token['width'];
        }
    }
    return count($lines);
}

function gshop_document_shrink_text(
    Fpdi $pdf,
    float $x,
    float $sourceBaseline,
    mixed $value,
    float $width,
    float $preferredSize,
    float $minimumSize = 5.2,
    string $style = 'B',
    string $align = 'L',
    ?array $color = null
): void {
    $text = gshop_pdf_string($value);
    if ($text === '') return;
    $size = $preferredSize;
    while ($size > $minimumSize) {
        $pdf->SetFont('DejaVu', $style, $size);
        if ($pdf->GetStringWidth($text) <= $width) break;
        $size = max($minimumSize, $size - .25);
    }
    gshop_pdf_text($pdf, $x, $sourceBaseline, $text, $size, $style, $width, $align, $color);
}

function gshop_document_client_name(array $client): string {
    return trim(gshop_pdf_string($client['firstName'] ?? '') . ' ' . gshop_pdf_string($client['lastName'] ?? ''));
}

function gshop_document_currency(array $financials, array $sheet): string {
    return gshop_pdf_string($financials['currencyCode'] ?? $sheet['currencyCode'] ?? 'RON') ?: 'RON';
}

function gshop_document_money(mixed $value, string $currency): string {
    return number_format(max(0, (float)($value ?? 0)), 2, ',', '.') . ($currency !== '' ? ' ' . $currency : '');
}

function gshop_document_quantity(mixed $value): string {
    $number = max(0, (float)($value ?? 0));
    if (abs($number - round($number)) < 0.0001) return (string)(int)round($number);
    return rtrim(rtrim(number_format($number, 2, ',', ''), '0'), ',');
}

function gshop_document_date(mixed $value): string {
    $raw = gshop_pdf_string($value);
    if ($raw === '') return '';
    try {
        $bucharest = new DateTimeZone('Europe/Bucharest');
        $hasExplicitTimezone = preg_match('/(?:Z|[+\-]\d{2}:?\d{2})$/i', $raw) === 1;
        $date = new DateTimeImmutable($raw, $hasExplicitTimezone ? null : $bucharest);
        return $date->setTimezone($bucharest)->format('d.m.Y, H:i');
    } catch (Throwable) {
        return $raw;
    }
}

/** @return array{total:float,beforeDiscount:float,hasDiscount:bool,paid:float,remaining:float,totalStatus:string,restStatus:?string,diagnostic:float,parts:float,labor:float,discount:mixed,currency:string} */
function gshop_document_financial_values(array $snapshot): array {
    $financials = is_array($snapshot['financials'] ?? null) ? $snapshot['financials'] : [];
    $summary = is_array($snapshot['summary'] ?? null) ? $snapshot['summary'] : [];
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $estimate = is_array($snapshot['estimate'] ?? null) ? $snapshot['estimate'] : [];
    $total = max(0, (float)($summary['totalDue'] ?? $estimate['total'] ?? $sheet['estimatedTotal'] ?? $sheet['totalCost'] ?? 0));
    $paid = max(0, (float)($summary['receivedAmount'] ?? $financials['advancePaid'] ?? 0));
    $remaining = array_key_exists('remainingDue', $summary)
        ? max(0, (float)$summary['remainingDue'])
        : (array_key_exists('remaining', $estimate) ? max(0, (float)$estimate['remaining']) : max(0, $total - $paid));
    $diagnostic = max(0, (float)($financials['diagnosticFee'] ?? 0));
    $parts = max(0, (float)($financials['displayedPartsCost'] ?? $sheet['partsCost'] ?? 0));
    $labor = max(0, (float)($financials['displayedLaborCost'] ?? $sheet['laborCost'] ?? 0));
    $discountText = str_replace([',', '%', ' '], ['.', '', ''], gshop_pdf_string($financials['discountPercent'] ?? 0));
    $discountPercent = max(0, (float)$discountText);
    $discountAmount = max(0, (float)($summary['discountAmount'] ?? 0));
    $hasDiscount = $discountPercent > .0001 || $discountAmount > .004;
    $componentSubtotal = $diagnostic + $parts + $labor;
    $beforeDiscount = array_key_exists('subtotal', $summary) ? max(0, (float)$summary['subtotal']) : 0.0;
    if ($beforeDiscount <= 0 && $discountAmount > 0) $beforeDiscount = $total + $discountAmount;
    if ($beforeDiscount <= 0 && $hasDiscount && $componentSubtotal > 0) $beforeDiscount = $componentSubtotal;
    if ($beforeDiscount <= 0 && $hasDiscount && $discountPercent < 100) $beforeDiscount = $total / max(.0001, 1 - $discountPercent / 100);
    if (!$hasDiscount || $beforeDiscount < $total) $beforeDiscount = $total;
    $paymentStatus = strtoupper(gshop_pdf_string($financials['paymentStatus'] ?? ''));
    $totalPaid = $total > 0 && ($paymentStatus === 'PAID' || $remaining <= .009 || $paid >= $total - .009);
    $totalStatus = $totalPaid ? 'ACHITAT' : 'NEACHITAT';
    $hasSeparateRest = $paid > .009;
    $restStatus = $hasSeparateRest ? ($remaining <= .009 ? 'ACHITAT' : 'NEACHITAT') : null;
    return [
        'total' => $total,
        'beforeDiscount' => $beforeDiscount,
        'hasDiscount' => $hasDiscount,
        'paid' => $paid,
        'remaining' => $remaining,
        'totalStatus' => $totalStatus,
        'restStatus' => $restStatus,
        'diagnostic' => $diagnostic,
        'parts' => $parts,
        'labor' => $labor,
        'discount' => $financials['discountPercent'] ?? 0,
        'currency' => gshop_document_currency($financials, $sheet),
    ];
}

function gshop_document_overlay_header(Fpdi $pdf, array $document, array $company, float $baseline = 779): void {
    gshop_pdf_text($pdf, 356, $baseline, $document['number'] ?? '', 6.3, 'B', 91);
    gshop_pdf_text($pdf, 462, $baseline, gshop_document_date($document['documentAt'] ?? ''), 6.3, 'B', 91);
}

function gshop_document_overlay_company(Fpdi $pdf, array $company): void {
    // Normalize every document to the same compact three-row company card.
    // The address owns a full row; phone and email share the final row.
    gshop_document_box($pdf, 22, 704, 551.2756, 44, 'white', 'line', 8, .7);
    $field = static function (
        float $x,
        float $lineY,
        float $width,
        string $label,
        mixed $value,
        float $labelWidth,
        float $labelSize = 5.6,
        float $valueSize = 6.6
    ) use ($pdf): void {
        gshop_pdf_text($pdf, $x, $lineY + 3, strtoupper($label), $labelSize, 'B', $labelWidth, 'L', gshop_document_color('slate'));
        gshop_document_source_line($pdf, $x + $labelWidth, $lineY, $x + $width, $lineY, 'lineDark', .7);
        gshop_document_shrink_text($pdf, $x + $labelWidth + 4, $lineY + 2, $value, $width - $labelWidth - 7, $valueSize, 4.9, $label === 'Denumire juridică' ? 'B' : '');
    };
    $field(32, 730, 190, 'Denumire juridică', $company['legalName'] ?? '', 64);
    $field(230, 730, 105, 'CUI / CIF', $company['taxId'] ?? '', 34, 5.1, 6.1);
    $field(343, 730, 220, 'Registrul Comerțului', $company['tradeRegisterNumber'] ?? '', 103, 5.1, 6.6);
    $field(32, 716, 531, 'Sediu', gshop_pdf_full_address($company), 32, 5.6, 6.3);
    $field(32, 705, 210, 'Telefon', $company['phone'] ?? '', 36, 5.5, 6.3);
    $field(250, 705, 313, 'Email', $company['email'] ?? '', 34, 5.5, 6.2);
}

function gshop_document_overlay_client_equipment(Fpdi $pdf, array $client, array $sheet, float $shift = 0): void {
    $left = [
        [645, gshop_document_client_name($client)],
        [627, $client['phone'] ?? ''],
        [609, $client['secondaryPhone'] ?? ''],
        [591, $client['email'] ?? ''],
        [573, gshop_pdf_full_address($client)],
    ];
    $right = [
        [645, $sheet['equipment'] ?? ''],
        [627, $sheet['brand'] ?? ''],
        [609, $sheet['model'] ?? ''],
        [591, $sheet['serialNumber'] ?? ''],
        [573, $sheet['accessories'] ?? ''],
    ];
    foreach ($left as [$baseline, $value]) gshop_pdf_text($pdf, 121, $baseline + $shift, $value, 6.8, '', 167);
    foreach ($right as [$baseline, $value]) gshop_pdf_text($pdf, 398, $baseline + $shift, $value, 6.8, '', 160);
}

function gshop_document_footer(Fpdi $pdf, int $page, int $total, string $label): void {
    gshop_document_box($pdf, 0, 0, GSHOP_DOCUMENT_PAGE_WIDTH, 45, 'canvas', 'canvas', 0, 0);
    gshop_document_source_line($pdf, GSHOP_DOCUMENT_MARGIN, 38, GSHOP_DOCUMENT_PAGE_WIDTH - GSHOP_DOCUMENT_MARGIN, 38, 'line', .6);
    gshop_pdf_text(
        $pdf,
        GSHOP_DOCUMENT_MARGIN,
        26,
        'În temeiul legii: OG 21/1992 | Legea 193/2000 | Codul civil | GDPR (UE) 2016/679 | Legea 190/2018.',
        4.45,
        '',
        390,
        'L',
        gshop_document_color('slate')
    );
    $value = 'Pagina ' . $page . '/' . $total;
    $pdf->SetFont('DejaVu', 'B', 5.3);
    $x = (GSHOP_DOCUMENT_PAGE_WIDTH - $pdf->GetStringWidth($value)) / 2;
    gshop_pdf_text($pdf, $x, 18, $value, 5.3, 'B', 75, 'L', gshop_document_color('slate'));
    gshop_pdf_text($pdf, 420, 18, $label, 5.3, 'B', 153, 'R', gshop_document_color('electricDark'));
}

function gshop_document_reference(Fpdi $pdf, array $snapshot, float $baseline = 682, bool $withEstimate = false): void {
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $intake = is_array($snapshot['intake'] ?? null) ? $snapshot['intake'] : [];
    $estimate = is_array($snapshot['estimate'] ?? null) ? $snapshot['estimate'] : [];
    gshop_pdf_text($pdf, $withEstimate ? 162 : 153, $baseline, $intake['number'] ?? $sheet['number'] ?? '', 6.4, '', $withEstimate ? 176 : 204);
    gshop_pdf_text($pdf, $withEstimate ? 410 : 382, $baseline, gshop_document_date($intake['date'] ?? $sheet['receivedAt'] ?? ''), 6.2, '', $withEstimate ? 143 : 169);
    if ($withEstimate) {
        gshop_pdf_text($pdf, 140, $baseline - 15, $estimate['number'] ?? $sheet['finalEstimateNumber'] ?? '', 6.4, '', 198);
        gshop_pdf_text($pdf, 410, $baseline - 15, gshop_document_date($estimate['date'] ?? $sheet['finalEstimateAt'] ?? ''), 6.2, '', 143);
    }
}

function gshop_document_check(Fpdi $pdf, float $x, float $sourceY, string $color = 'success'): void {
    gshop_document_source_line($pdf, $x + 1.6, $sourceY + 3.0, $x + 3.9, $sourceY + 1.0, $color, 1.55);
    gshop_document_source_line($pdf, $x + 3.9, $sourceY + 1.0, $x + 8.0, $sourceY + 7.2, $color, 1.55);
}

/** @param array{path:string,width:int,height:int}|null $signature */
function gshop_document_place_image(
    Fpdi $pdf,
    ?string $path,
    float $x,
    float $sourceBottom,
    float $width,
    float $height,
    ?array $signature = null
): void {
    if (!$path || !is_file($path)) return;
    $sourceWidth = (int)($signature['width'] ?? 0);
    $sourceHeight = (int)($signature['height'] ?? 0);
    if ($sourceWidth < 1 || $sourceHeight < 1) {
        $dimensions = @getimagesize($path);
        if (!is_array($dimensions)) return;
        $sourceWidth = (int)$dimensions[0];
        $sourceHeight = (int)$dimensions[1];
    }
    if ($sourceWidth < 1 || $sourceHeight < 1) return;
    $scale = min($width / $sourceWidth, $height / $sourceHeight);
    $drawWidth = $sourceWidth * $scale;
    $drawHeight = $sourceHeight * $scale;
    $drawX = $x + ($width - $drawWidth) / 2;
    $drawTop = GSHOP_PDF_PAGE_HEIGHT - $sourceBottom - ($height + $drawHeight) / 2;
    $extension = strtoupper(pathinfo($path, PATHINFO_EXTENSION));
    $type = in_array($extension, ['PNG', 'JPG', 'JPEG'], true) ? ($extension === 'JPEG' ? 'JPG' : $extension) : '';
    $pdf->Image($path, $drawX, $drawTop, $drawWidth, $drawHeight, $type);
}

function gshop_document_overlay_financials(Fpdi $pdf, array $snapshot, float $summaryBottom, float $detailBaseline): void {
    $values = gshop_document_financial_values($snapshot);
    $currency = $values['currency'];
    $innerX = 33.0;
    $innerWidth = 529.2756;
    $gap = 8.0;
    $widths = [207.0, 143.0, $innerWidth - 207.0 - 143.0 - $gap * 2];
    $summaryHeight = 82.0;
    gshop_document_box($pdf, $innerX, $summaryBottom, $innerWidth, $summaryHeight, 'white', 'white', 0, 0);
    gshop_document_payment_total_cards($pdf, $innerX, $summaryBottom, $widths[0], $summaryHeight, $values);
    $x = $innerX + $widths[0] + $gap;
    gshop_document_summary_card($pdf, $x, $summaryBottom, $widths[1], 'Achitat', gshop_document_money($values['paid'], $currency), 'white', 'success', 'success', $summaryHeight);
    $x += $widths[1] + $gap;
    gshop_document_summary_card($pdf, $x, $summaryBottom, $widths[2], 'Rest de plată', gshop_document_money($values['remaining'], $currency), 'white', $values['remaining'] <= .009 ? 'success' : 'warning', $values['remaining'] <= .009 ? 'success' : 'warning', $summaryHeight, $values['restStatus']);
    $discount = gshop_pdf_string($values['discount']);
    if ($discount !== '' && !str_ends_with($discount, '%')) $discount .= '%';
    $details = [
        gshop_document_money($values['diagnostic'], $currency),
        gshop_document_money($values['parts'], $currency),
        gshop_document_money($values['labor'], $currency),
        $discount,
        $currency,
    ];
    $positions = [[41, 112], [164, 112], [287, 112], [410, 108], [532, 31]];
    foreach ($details as $index => $value) gshop_document_shrink_text($pdf, $positions[$index][0], $detailBaseline, $value, $positions[$index][1], 7, 5.1);
}

/** @param array{path:string,width:int,height:int}|null $signature */
function gshop_document_overlay_intake(
    Fpdi $pdf,
    int $page,
    array $document,
    array $snapshot,
    ?array $signature,
    ?string $stampPath
): void {
    $company = is_array($snapshot['company'] ?? null) ? $snapshot['company'] : [];
    $client = is_array($snapshot['client'] ?? null) ? $snapshot['client'] : [];
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    gshop_document_overlay_header($pdf, $document, $company, 775);
    if ($page === 1) {
        gshop_document_overlay_company($pdf, $company);
        gshop_document_overlay_client_equipment($pdf, $client, $sheet);
        gshop_pdf_multiline($pdf, 34, 508, 527, $sheet['reportedIssue'] ?? '', 7, 7, 14);
        gshop_document_overlay_financials($pdf, $snapshot, 242, 164.5);
    } else {
        $values = gshop_document_financial_values($snapshot);
        $diagnostic = gshop_document_money($values['diagnostic'], $values['currency']);
        $total = gshop_document_money($values['total'], $values['currency']);
        $days = max(0, (int)($sheet['estimatedRepairDays'] ?? 0));
        $agreement = is_array($snapshot['agreement'] ?? null) ? $snapshot['agreement'] : [];
        $agreementStatus = strtoupper(gshop_pdf_string($agreement['status'] ?? ''));
        $accepted = in_array($agreementStatus, ['AGREE', 'ACCEPTED'], true);
        $refused = in_array($agreementStatus, ['DISAGREE', 'REJECTED', 'REFUSED'], true);
        $decisionPrefix = $accepted
            ? 'Clientul declară că a fost informat și acceptă suma estimată de'
            : ($refused
                ? 'Clientul declară că a fost informat și nu acceptă suma estimată de'
                : 'Clientul declară că a fost informat despre suma estimată de');
        $decisionSuffix = $accepted || $refused
            ? 'pentru reparație.'
            : 'pentru reparație; acordul nu a fost încă exprimat.';
        $conditions = [
            [['text' => 'La predare, produsul intră în constatare.']],
            [
                ['text' => 'Costul'],
                ['text' => 'constatării/diagnosticării', 'style' => 'B'],
                ['text' => 'este'],
                ['text' => gshop_document_money(0, $values['currency']), 'style' => 'B', 'underline' => true],
                ['text' => '(inclus în reparație) / sau'],
                ['text' => $diagnostic, 'style' => 'B', 'underline' => true],
                ['text' => 'dacă nu se efectuează reparația.'],
            ],
            [['text' => 'După constatare, se comunică clientului devizul estimativ.']],
            [
                ['text' => $decisionPrefix],
                ['text' => $total, 'style' => 'B', 'underline' => true],
                ['text' => $decisionSuffix],
            ],
            [['text' => 'Dacă pe parcurs apar defecțiuni suplimentare sau piese adiționale necesare, clientul va fi informat și va transmite un nou acord (prin semnătură, e-mail sau WhatsApp).']],
            [
                ['text' => 'Termen estimat reparație:'],
                ['text' => $days . ' zile lucrătoare.', 'style' => 'B', 'underline' => true],
            ],
        ];
        $cursor = 497.0;
        foreach ($conditions as $index => $segments) {
            gshop_pdf_text($pdf, 34, $cursor, ($index + 1) . '.', 6.4, 'B', 14, 'L', gshop_document_color('electricDark'));
            $lineCount = gshop_document_rich_paragraph($pdf, 52, $cursor, 509, $segments, 6.55, 8.2, 3);
            $cursor -= max(1, $lineCount) * 8.2 + 3.2;
        }
        $confirmation = $accepted
            ? 'Clientul confirmă că a citit și acceptă condițiile generale de service și costul estimativ.'
            : ($refused
                ? 'Clientul confirmă că a citit și nu acceptă condițiile generale de service și costul estimativ.'
                : 'Clientul confirmă că a citit documentul; acordul privind condițiile generale de service și costul estimativ nu a fost încă exprimat.');
        $confirmationLines = gshop_document_wrap($pdf, $confirmation, 529, 7.1, 'B', 2);
        foreach ($confirmationLines as $lineIndex => $line) gshop_pdf_text($pdf, 33, 323 - $lineIndex * 9.5, $line, 7.1, 'B', 529);
        gshop_document_box($pdf, 31, 100, 533, 205, 'white', 'white', 0, 0);
        gshop_pdf_text($pdf, 33, 291, 'NUME CLIENT', 5.8, 'B', 68, 'L', gshop_document_color('slate'));
        gshop_document_source_line($pdf, 101, 288, 240, 288, 'lineDark', .8);
        gshop_document_shrink_text($pdf, 105, 290, gshop_document_client_name($client), 132, 6.8, 5.2, '');
        gshop_pdf_text($pdf, 365, 291, 'DATA ȘI ORA', 5.8, 'B', 62, 'L', gshop_document_color('slate'));
        gshop_document_source_line($pdf, 427, 288, 527, 288, 'lineDark', .8);
        gshop_document_shrink_text($pdf, 431, 290, gshop_document_date($document['agreementAt'] ?? $sheet['signedAt'] ?? ''), 93, 6.5, 5.1, '');
        gshop_pdf_text($pdf, 33, 267, 'ȘTAMPILĂ', 6.1, 'B', 150, 'L', gshop_document_color('slate'));
        gshop_pdf_text($pdf, 365, 267, 'SEMNĂTURĂ CLIENT', 6.1, 'B', 150, 'L', gshop_document_color('slate'));
        gshop_document_source_line($pdf, 365, 220, 467, 220, 'lineDark', .85);
        gshop_document_place_image($pdf, $stampPath, 32, 158, 96, 96);
        gshop_document_place_image($pdf, $signature['path'] ?? null, 367, 222, 98, 27, $signature);
    }
    gshop_document_footer($pdf, $page, 2, 'G-SHOP | INTRARE SERVICE');
}

/** @return list<array{name:string,quantity:mixed,unitPrice:mixed,totalPrice:float}> */
function gshop_document_items(array $snapshot, string $kind): array {
    $items = is_array($snapshot[$kind] ?? null) ? $snapshot[$kind] : [];
    $result = [];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $name = gshop_pdf_string($item['name'] ?? $item['description'] ?? '');
        $quantity = $item['quantity'] ?? '';
        $unit = $item['unitPrice'] ?? '';
        $providedTotal = $item['totalPrice'] ?? $item['total'] ?? null;
        if ($name === '' && gshop_pdf_string($quantity) === '' && gshop_pdf_string($unit) === '' && gshop_pdf_string($providedTotal) === '') continue;
        $total = $providedTotal === null || $providedTotal === '' ? (float)$quantity * (float)$unit : (float)$providedTotal;
        $result[] = ['name' => $name, 'quantity' => $quantity, 'unitPrice' => $unit, 'totalPrice' => max(0, $total)];
    }
    return $result;
}

/** @param array{name:string,quantity:mixed,unitPrice:mixed,totalPrice:float} $item */
function gshop_document_item_name_lines(Fpdi $pdf, array $item): array {
    return gshop_document_wrap($pdf, $item['name'] ?? '', GSHOP_DOCUMENT_CONTENT_WIDTH * .53 - 8, 6.1);
}

/** @param array{name:string,quantity:mixed,unitPrice:mixed,totalPrice:float} $item */
function gshop_document_item_row_height(Fpdi $pdf, array $item): float {
    return max(GSHOP_DOCUMENT_TABLE_ROW, 10.0 + max(1, count(gshop_document_item_name_lines($pdf, $item))) * 7.2);
}

/** @param list<array{name:string,quantity:mixed,unitPrice:mixed,totalPrice:float}> $items */
function gshop_document_table_height(Fpdi $pdf, array $items): float {
    $height = GSHOP_DOCUMENT_TABLE_HEADER;
    foreach ($items as $item) $height += gshop_document_item_row_height($pdf, $item);
    return $height;
}

/** @return list<array{first:bool,top:float,sections:list<array<string,mixed>>,totals:bool}> */
function gshop_document_plan_final(Fpdi $pdf, array $snapshot): array {
    $pages = [];
    $addPage = static function (bool $first) use (&$pages): int {
        $pages[] = ['first' => $first, 'top' => $first ? 474.0 : 696.0, 'sections' => [], 'totals' => false];
        return count($pages) - 1;
    };
    $pageIndex = $addPage(true);
    $cursor = 474.0;
    $specs = [
        [3, 'Piese înlocuite', 'denumire, cantitate și preț', 'parts', 'Nu au fost înregistrate piese.'],
        [4, 'Manoperă', 'operațiuni și costuri', 'labor', 'Nu au fost înregistrate operațiuni de manoperă.'],
    ];
    foreach ($specs as [$number, $title, $subtitle, $kind, $emptyLabel]) {
        $items = gshop_document_items($snapshot, $kind);
        if (!$items) {
            $required = GSHOP_DOCUMENT_TITLE_GAP + GSHOP_DOCUMENT_EMPTY_TABLE + GSHOP_DOCUMENT_SECTION_GAP;
            if ($cursor - $required < GSHOP_DOCUMENT_BOTTOM) {
                $pageIndex = $addPage(false);
                $cursor = 696.0;
            }
            $pages[$pageIndex]['sections'][] = compact('number', 'title', 'subtitle', 'items', 'emptyLabel') + ['continued' => false];
            $cursor -= $required;
            continue;
        }
        $offset = 0;
        $continued = false;
        while ($offset < count($items)) {
            $availableHeight = $cursor - GSHOP_DOCUMENT_BOTTOM - GSHOP_DOCUMENT_TITLE_GAP - GSHOP_DOCUMENT_SECTION_GAP;
            $firstRowHeight = gshop_document_item_row_height($pdf, $items[$offset]);
            if ($availableHeight < GSHOP_DOCUMENT_TABLE_HEADER + $firstRowHeight) {
                $pageIndex = $addPage(false);
                $cursor = 696.0;
                continue;
            }
            $chunk = [];
            $tableHeight = GSHOP_DOCUMENT_TABLE_HEADER;
            while ($offset + count($chunk) < count($items)) {
                $candidate = $items[$offset + count($chunk)];
                $rowHeight = gshop_document_item_row_height($pdf, $candidate);
                if ($tableHeight + $rowHeight > $availableHeight) break;
                $chunk[] = $candidate;
                $tableHeight += $rowHeight;
            }
            $pages[$pageIndex]['sections'][] = [
                'number' => $number,
                'title' => $title,
                'subtitle' => $subtitle,
                'items' => $chunk,
                'emptyLabel' => $emptyLabel,
                'continued' => $continued,
            ];
            $cursor -= GSHOP_DOCUMENT_TITLE_GAP + $tableHeight + GSHOP_DOCUMENT_SECTION_GAP;
            $offset += count($chunk);
            if ($offset < count($items)) {
                $pageIndex = $addPage(false);
                $cursor = 696.0;
                $continued = true;
            }
        }
    }
    if ($cursor - GSHOP_DOCUMENT_TITLE_GAP - GSHOP_DOCUMENT_TOTALS_HEIGHT < GSHOP_DOCUMENT_BOTTOM) $pageIndex = $addPage(false);
    $pages[$pageIndex]['totals'] = true;
    return $pages;
}

function gshop_document_section_title(Fpdi $pdf, float $sourceY, int $number, string $title, string $subtitle = ''): void {
    $x = GSHOP_DOCUMENT_MARGIN + 3;
    gshop_document_set_fill($pdf, 'electric');
    $pdf->RoundedRect($x, GSHOP_PDF_PAGE_HEIGHT - ($sourceY + 16), 16, 16, 8, 'F');
    gshop_pdf_text($pdf, $x + 5.2, $sourceY + 5.3, (string)$number, 7.3, 'B', 7, 'L', gshop_document_color('white'));
    gshop_pdf_text($pdf, $x + 22, $sourceY + 5, $title, 9.8, 'B', 315);
    if ($subtitle !== '') gshop_pdf_text($pdf, 365, $sourceY + 5, $subtitle, 6, 'B', 203, 'R', gshop_document_color('slate'));
}

/** @param list<array{name:string,quantity:mixed,unitPrice:mixed,totalPrice:float}> $items */
function gshop_document_table(GshopServiceDocumentPdf $pdf, float $sourceBottom, array $items, string $currency): void {
    $x = GSHOP_DOCUMENT_MARGIN;
    $width = GSHOP_DOCUMENT_CONTENT_WIDTH;
    $height = gshop_document_table_height($pdf, $items);
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
        $rowHeight = gshop_document_item_row_height($pdf, $item);
        $rowBottom = $rowTop - $rowHeight;
        gshop_document_source_line($pdf, $x, $rowBottom, $x + $width, $rowBottom);
        $nameLines = gshop_document_item_name_lines($pdf, $item);
        $nameLines = $nameLines ?: [''];
        $nameBaseline = $rowBottom + ($rowHeight + (count($nameLines) - 1) * 7.2) / 2 - 2;
        foreach ($nameLines as $lineIndex => $nameLine) gshop_pdf_text($pdf, $x + 4, $nameBaseline - $lineIndex * 7.2, $nameLine, 6.1, '', $columns[0] - 8);
        $baseline = $rowBottom + $rowHeight / 2 - 2;
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

function gshop_document_empty_table(GshopServiceDocumentPdf $pdf, float $sourceBottom, string $label): void {
    gshop_document_box($pdf, GSHOP_DOCUMENT_MARGIN, $sourceBottom, GSHOP_DOCUMENT_CONTENT_WIDTH, GSHOP_DOCUMENT_EMPTY_TABLE, 'muted', 'line', 8, .6);
    $pdf->SetFont('DejaVu', '', 6.8);
    $x = (GSHOP_DOCUMENT_PAGE_WIDTH - $pdf->GetStringWidth($label)) / 2;
    gshop_pdf_text($pdf, $x, $sourceBottom + 10, $label, 6.8, '', 500, 'L', gshop_document_color('slate'));
}

function gshop_document_status_badge(GshopServiceDocumentPdf $pdf, float $x, float $sourceBottom, string $status): void {
    $paid = $status === 'ACHITAT';
    $width = $paid ? 43.0 : 51.0;
    $fill = $paid ? 'successSoft' : 'dangerSoft';
    $color = $paid ? 'success' : 'danger';
    gshop_document_box($pdf, $x, $sourceBottom, $width, 12, $fill, $fill, 6, 0);
    $pdf->SetFont('DejaVu', 'B', 5.2);
    gshop_pdf_text($pdf, $x + ($width - $pdf->GetStringWidth($status)) / 2, $sourceBottom + 3.3, $status, 5.2, 'B', $width, 'L', gshop_document_color($color));
}

function gshop_document_summary_card(
    GshopServiceDocumentPdf $pdf,
    float $x,
    float $sourceBottom,
    float $width,
    string $label,
    string $value,
    string $fill,
    string $valueColor,
    ?string $accent = null,
    float $height = 57,
    ?string $status = null
): void {
    gshop_document_box($pdf, $x, $sourceBottom, $width, $height, $fill, $accent ?? ($fill === 'electric' ? 'electric' : 'line'), 9, .8);
    if ($accent) gshop_document_box($pdf, $x, $sourceBottom + 8, 3.5, max(8, $height - 16), $accent, $accent, 1.75, 0);
    $labelWidth = $width - 22;
    if ($status) $labelWidth -= ($status === 'ACHITAT' ? 43.0 : 51.0) + 7;
    gshop_pdf_text($pdf, $x + 11, $sourceBottom + $height - 17, strtoupper($label), 5.8, 'B', $labelWidth, 'L', gshop_document_color($fill === 'electric' ? 'white' : 'slate'));
    if ($status) {
        $statusWidth = $status === 'ACHITAT' ? 43.0 : 51.0;
        gshop_document_status_badge($pdf, $x + $width - $statusWidth - 9, $sourceBottom + $height - 22, $status);
    }
    gshop_document_shrink_text($pdf, $x + 11, $sourceBottom + ($height >= 70 ? 19 : 13), $value, $width - 22, $width >= 180 ? 12.2 : 10.6, 5.8, 'B', 'L', gshop_document_color($valueColor));
}

/** @param array{total:float,beforeDiscount:float,hasDiscount:bool,totalStatus:string,currency:string} $values */
function gshop_document_payment_total_cards(
    GshopServiceDocumentPdf $pdf,
    float $x,
    float $sourceBottom,
    float $width,
    float $height,
    array $values
): void {
    $currency = $values['currency'];
    if (empty($values['hasDiscount'])) {
        gshop_document_summary_card($pdf, $x, $sourceBottom, $width, 'Total de plată', gshop_document_money($values['total'], $currency), 'electric', 'white', null, $height, $values['totalStatus']);
        return;
    }
    $gap = 7.0;
    $cardHeight = ($height - $gap) / 2;
    $cards = [
        ['Total estimativ fără reducere', gshop_document_money($values['beforeDiscount'], $currency)],
        ['Total de plată cu reducere', gshop_document_money($values['total'], $currency)],
    ];
    foreach ($cards as $index => [$label, $value]) {
        $bottom = $sourceBottom + ($index === 0 ? $cardHeight + $gap : 0);
        gshop_document_box($pdf, $x, $bottom, $width, $cardHeight, 'electric', 'electric', 8, .8);
        $labelWidth = $width - 20 - ($index === 1 ? ($values['totalStatus'] === 'ACHITAT' ? 50 : 58) : 0);
        gshop_pdf_text($pdf, $x + 10, $bottom + $cardHeight - 12, strtoupper($label), 4.8, 'B', $labelWidth, 'L', gshop_document_color('white'));
        if ($index === 1) {
            $statusWidth = $values['totalStatus'] === 'ACHITAT' ? 43.0 : 51.0;
            gshop_document_status_badge($pdf, $x + $width - $statusWidth - 8, $bottom + $cardHeight - 17, $values['totalStatus']);
        }
        gshop_document_shrink_text($pdf, $x + 10, $bottom + 8, $value, $width - 20, 8.8, 5.7, 'B', 'L', gshop_document_color('white'));
    }
}

function gshop_document_detail_card(GshopServiceDocumentPdf $pdf, float $x, float $sourceBottom, float $width, string $label, string $value): void {
    gshop_document_box($pdf, $x, $sourceBottom, $width, 30, 'muted', 'line', 7, .55);
    gshop_pdf_text($pdf, $x + 8, $sourceBottom + 17, strtoupper($label), 4.7, 'B', $width - 16, 'L', gshop_document_color('slate'));
    gshop_document_shrink_text($pdf, $x + 8, $sourceBottom + 5, $value, $width - 16, 7, 5.0);
}

function gshop_document_totals(GshopServiceDocumentPdf $pdf, array $snapshot, float $sourceBottom): void {
    gshop_document_box($pdf, GSHOP_DOCUMENT_MARGIN, $sourceBottom, GSHOP_DOCUMENT_CONTENT_WIDTH, GSHOP_DOCUMENT_TOTALS_HEIGHT, 'white', 'line', 8, .7);
    $values = gshop_document_financial_values($snapshot);
    $currency = $values['currency'];
    $innerX = GSHOP_DOCUMENT_MARGIN + 11;
    $innerWidth = GSHOP_DOCUMENT_CONTENT_WIDTH - 22;
    $gap = 8.0;
    $widths = [207.0, 143.0, $innerWidth - 207.0 - 143.0 - $gap * 2];
    $summaryBottom = $sourceBottom + 51;
    $summaryHeight = 82.0;
    gshop_document_payment_total_cards($pdf, $innerX, $summaryBottom, $widths[0], $summaryHeight, $values);
    $x = $innerX + $widths[0] + $gap;
    gshop_document_summary_card($pdf, $x, $summaryBottom, $widths[1], 'Achitat', gshop_document_money($values['paid'], $currency), 'white', 'success', 'success', $summaryHeight);
    $x += $widths[1] + $gap;
    gshop_document_summary_card($pdf, $x, $summaryBottom, $widths[2], 'Rest de plată', gshop_document_money($values['remaining'], $currency), 'white', $values['remaining'] <= .009 ? 'success' : 'warning', $values['remaining'] <= .009 ? 'success' : 'warning', $summaryHeight, $values['restStatus']);
    $smallGap = 6.0;
    $pdf->SetFont('DejaVu', 'B', 4.7);
    $currencyLabelWidth = $pdf->GetStringWidth('MONEDĂ') + 16;
    $pdf->SetFont('DejaVu', 'B', 7);
    $currencyWidth = max(38.0, $currencyLabelWidth, $pdf->GetStringWidth($currency) + 16);
    $regularWidth = ($innerWidth - $currencyWidth - $smallGap * 4) / 4;
    $discount = gshop_pdf_string($values['discount']);
    if ($discount !== '' && !str_ends_with($discount, '%')) $discount .= '%';
    $details = [
        ['Diagnostic', gshop_document_money($values['diagnostic'], $currency), $regularWidth],
        ['Piese', gshop_document_money($values['parts'], $currency), $regularWidth],
        ['Manoperă', gshop_document_money($values['labor'], $currency), $regularWidth],
        ['Reducere', $discount, $regularWidth],
        ['Monedă', $currency, $currencyWidth],
    ];
    $x = $innerX;
    foreach ($details as [$label, $value, $width]) {
        gshop_document_detail_card($pdf, $x, $sourceBottom + 10, $width, $label, $value);
        $x += $width + $smallGap;
    }
}

/** @param array{path:string,width:int,height:int}|null $signature */
function gshop_document_overlay_final_agreement(Fpdi $pdf, array $document, array $snapshot, ?array $signature, ?string $stampPath): void {
    $company = is_array($snapshot['company'] ?? null) ? $snapshot['company'] : [];
    $client = is_array($snapshot['client'] ?? null) ? $snapshot['client'] : [];
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $agreement = is_array($snapshot['agreement'] ?? null) ? $snapshot['agreement'] : [];
    gshop_document_overlay_header($pdf, $document, $company);
    gshop_document_reference($pdf, $snapshot, 732);
    $cause = strtoupper(gshop_pdf_string($sheet['defectCause'] ?? ''));
    if ($cause === 'CLIENT') gshop_document_check($pdf, 140, 660);
    elseif (in_array($cause, ['PRODUCER', 'MANUFACTURER'], true)) gshop_document_check($pdf, 228, 660);
    gshop_pdf_multiline($pdf, 33, 619, 529, $sheet['finalNotes'] ?? '', 5, 7, 13);
    gshop_document_box($pdf, 22, 462, 551.2756, 46, 'electricLight', 'electricLight', 8, .7);
    gshop_pdf_text($pdf, 34, 481, 'TERMEN ESTIMAT', 5.7, 'B', 75, 'L', gshop_document_color('slate'));
    $days = gshop_pdf_string($sheet['estimatedRepairDays'] ?? '');
    $pdf->SetFont('DejaVu', 'B', 7.2);
    $daysLineWidth = max(18.0, min(60.0, $pdf->GetStringWidth($days) + 10));
    gshop_document_source_line($pdf, 109, 478, 109 + $daysLineWidth, 478, 'lineDark', .8);
    gshop_pdf_text($pdf, 113, 480, $days, 7.2, 'B', max(10, $daysLineWidth - 7));
    gshop_pdf_text($pdf, 118 + $daysLineWidth, 481, 'zile de la data acordului final al clientului', 7, '', 290);
    gshop_pdf_text($pdf, 453, 469, gshop_document_date($document['agreementAt'] ?? $agreement['date'] ?? $sheet['finalAgreementAt'] ?? ''), 5.4, 'B', 98, 'R', gshop_document_color('slate'));
    $status = strtoupper(gshop_pdf_string($agreement['status'] ?? ''));
    $decision = in_array($status, ['AGREE', 'ACCEPTED'], true)
        ? 'SUNT DE ACORD'
        : (in_array($status, ['DISAGREE', 'REJECTED', 'REFUSED'], true) ? 'NU SUNT DE ACORD' : 'ACORD NEEXPRIMAT');
    $agreementName = gshop_document_client_name($client) ?: 'Clientul';
    gshop_document_rich_paragraph($pdf, 45, 380, 505, [
        ['text' => 'Subsemnatul/a ' . $agreementName . ' declar că'],
        ['text' => $decision, 'style' => 'B'],
        ['text' => 'cu devizul final, care include costurile de diagnosticare și reparare a produsului meu / produselor mele, precum și cu termenul estimat de reparație.'],
    ], 8.2, 12, 4);
    if (in_array($status, ['AGREE', 'ACCEPTED'], true)) gshop_document_check($pdf, 44, 297);
    elseif (in_array($status, ['DISAGREE', 'REJECTED', 'REFUSED'], true)) gshop_document_check($pdf, 190, 297, 'danger');
    gshop_document_box($pdf, 42, 60, 511, 218, 'white', 'white', 0, 0);
    gshop_pdf_text($pdf, 44, 262, 'NUME CLIENT', 5.7, 'B', 68, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 112, 259, 242, 259, 'lineDark', .8);
    gshop_document_shrink_text($pdf, 116, 261, gshop_document_client_name($client), 123, 6.8, 5.2, '');
    gshop_pdf_text($pdf, 370, 262, 'DATA / ORA', 5.7, 'B', 58, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 428, 259, 528, 259, 'lineDark', .8);
    gshop_document_shrink_text($pdf, 432, 261, gshop_document_date($document['agreementAt'] ?? $agreement['date'] ?? ''), 93, 6.3, 5.0, '');
    gshop_pdf_text($pdf, 44, 234, 'ȘTAMPILĂ', 6.2, 'B', 150, 'L', gshop_document_color('slate'));
    gshop_pdf_text($pdf, 370, 234, 'SEMNĂTURĂ CLIENT', 6.2, 'B', 143, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 370, 195, 472, 195, 'lineDark', .85);
    gshop_document_place_image($pdf, $stampPath, 43, 126, 96, 96);
    gshop_document_place_image($pdf, $signature['path'] ?? null, 372, 197, 98, 20, $signature);
}

/** @param array{path:string,width:int,height:int}|null $signature */
function gshop_document_build_final(
    GshopServiceDocumentPdf $pdf,
    array $document,
    array $snapshot,
    array $templates,
    ?array $signature,
    ?string $stampPath
): int {
    $company = is_array($snapshot['company'] ?? null) ? $snapshot['company'] : [];
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $currency = gshop_document_financial_values($snapshot)['currency'];
    $plans = gshop_document_plan_final($pdf, $snapshot);
    $totalPages = count($plans) + 1;
    foreach ($plans as $index => $plan) {
        gshop_document_add_template($pdf, $plan['first'] ? $templates['intro'] : $templates['continuation']);
        gshop_document_overlay_header($pdf, $document, $company);
        if ($plan['first']) {
            gshop_document_overlay_company($pdf, $company);
            gshop_document_reference($pdf, $snapshot, 682);
            gshop_pdf_multiline($pdf, 33, 618, 529, $sheet['reportedIssue'] ?? '', 3, 7, 12);
            gshop_pdf_multiline($pdf, 33, 537, 529, $sheet['technicalAssessment'] ?? '', 4, 7, 12);
            $cursor = 474.0;
        } else {
            gshop_document_reference($pdf, $snapshot, 732);
            $cursor = 696.0;
        }
        foreach ($plan['sections'] as $section) {
            $title = $section['title'];
            gshop_document_section_title($pdf, $cursor, (int)$section['number'], $title, (string)$section['subtitle']);
            $contentTop = $cursor - GSHOP_DOCUMENT_TITLE_GAP;
            if ($section['items']) {
                $height = gshop_document_table_height($pdf, $section['items']);
                $contentBottom = $contentTop - $height;
                gshop_document_table($pdf, $contentBottom, $section['items'], $currency);
            } else {
                $contentBottom = $contentTop - GSHOP_DOCUMENT_EMPTY_TABLE;
                gshop_document_empty_table($pdf, $contentBottom, (string)$section['emptyLabel']);
            }
            $cursor = $contentBottom - GSHOP_DOCUMENT_SECTION_GAP;
        }
        if ($plan['totals']) {
            gshop_document_section_title($pdf, $cursor, 5, 'Cost total final', 'total, achitat și rest de plată');
            gshop_document_totals($pdf, $snapshot, $cursor - GSHOP_DOCUMENT_TITLE_GAP - GSHOP_DOCUMENT_TOTALS_HEIGHT);
        }
        gshop_document_footer($pdf, $index + 1, $totalPages, 'G-SHOP | DEVIZ FINAL');
    }
    gshop_document_add_template($pdf, $templates['agreement']);
    gshop_document_overlay_final_agreement($pdf, $document, $snapshot, $signature, $stampPath);
    gshop_document_footer($pdf, $totalPages, $totalPages, 'G-SHOP | DEVIZ FINAL');
    return $totalPages;
}

/** @param array{path:string,width:int,height:int}|null $signature */
function gshop_document_overlay_exit(Fpdi $pdf, array $document, array $snapshot, ?array $signature, ?string $stampPath): void {
    $company = is_array($snapshot['company'] ?? null) ? $snapshot['company'] : [];
    $client = is_array($snapshot['client'] ?? null) ? $snapshot['client'] : [];
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $exit = is_array($snapshot['exit'] ?? null) ? $snapshot['exit'] : [];
    gshop_document_overlay_header($pdf, $document, $company);
    gshop_document_overlay_company($pdf, $company);
    gshop_document_reference($pdf, $snapshot, 679, true);
    gshop_document_overlay_client_equipment($pdf, $client, $sheet, -49);
    gshop_pdf_multiline($pdf, 34, 457, 527, $sheet['reportedIssue'] ?? '', 4, 7, 13);
    $state = strtoupper(gshop_pdf_string($exit['productState'] ?? $sheet['productState'] ?? ''));
    if ($state === 'REPAIRED') gshop_document_check($pdf, 44, 339);
    elseif (in_array($state, ['INITIAL', 'UNCHANGED'], true)) gshop_document_check($pdf, 184, 339);
    $date = $document['documentAt'] ?? $exit['date'] ?? $sheet['deliveredAt'] ?? '';
    gshop_document_box($pdf, 36, 70, 523, 158, 'white', 'white', 0, 0);
    gshop_pdf_text($pdf, 38, 211, 'NUME CLIENT', 5.7, 'B', 68, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 106, 208, 236, 208, 'lineDark', .8);
    gshop_document_shrink_text($pdf, 110, 210, gshop_document_client_name($client), 123, 6.8, 5.2, '');
    gshop_pdf_text($pdf, 390, 211, 'DATA ȘI ORA', 5.7, 'B', 62, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 452, 208, 552, 208, 'lineDark', .8);
    gshop_document_shrink_text($pdf, 456, 210, gshop_document_date($date), 93, 6.3, 4.9, '');
    gshop_pdf_text($pdf, 38, 181, 'ȘTAMPILĂ', 6.3, 'B', 150, 'L', gshop_document_color('slate'));
    gshop_pdf_text($pdf, 390, 181, 'SEMNĂTURĂ CLIENT', 6.3, 'B', 155, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 390, 145, 492, 145, 'lineDark', .85);
    gshop_document_place_image($pdf, $stampPath, 37, 73, 96, 96);
    gshop_document_place_image($pdf, $signature['path'] ?? null, 392, 147, 98, 18, $signature);
    gshop_document_footer($pdf, 1, 1, 'G-SHOP | IEȘIRE SERVICE');
}

/** @param array{path:string,width:int,height:int}|null $signature */
function gshop_document_overlay_warranty(Fpdi $pdf, array $document, array $snapshot, ?array $signature, ?string $stampPath): void {
    $company = is_array($snapshot['company'] ?? null) ? $snapshot['company'] : [];
    $client = is_array($snapshot['client'] ?? null) ? $snapshot['client'] : [];
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    $warranty = is_array($snapshot['warranty'] ?? null) ? $snapshot['warranty'] : [];
    // Normalize the reference card to the same two-row layout used by the
    // intake sheet: compact labels above, complete values and blue rules below.
    gshop_document_box($pdf, 349, 769, 208, 38, 'electricLight', 'electricLight', 0, 0);
    gshop_pdf_text($pdf, 355, 795, 'NR. CERTIFICAT', 4.7, 'B', 94, 'L', gshop_document_color('electricDark'));
    gshop_pdf_text($pdf, 464, 795, 'DATA ȘI ORA', 4.7, 'B', 87, 'L', gshop_document_color('electricDark'));
    gshop_document_shrink_text($pdf, 355, 779, $document['number'] ?? '', 94, 5.8, 4.7, 'B');
    gshop_document_shrink_text($pdf, 464, 779, gshop_document_date($document['documentAt'] ?? ''), 87, 5.6, 4.7, 'B');
    gshop_document_source_line($pdf, 355, 774, 449, 774, 'electric', 0.55);
    gshop_document_source_line($pdf, 464, 774, 551, 774, 'electric', 0.55);
    gshop_document_overlay_company($pdf, $company);
    gshop_document_reference($pdf, $snapshot, 679, true);

    $left = [
        [596, $sheet['equipment'] ?? ''],
        [576, $sheet['brand'] ?? ''],
        [556, $sheet['model'] ?? ''],
        [536, $sheet['serialNumber'] ?? ''],
    ];
    $right = [
        [596, $warranty['period'] ?? $sheet['warranty'] ?? ''],
        [576, gshop_document_date($warranty['startAt'] ?? $sheet['warrantyStartAt'] ?? '')],
        [556, gshop_document_date($warranty['endAt'] ?? $sheet['warrantyEndAt'] ?? '')],
        [536, $warranty['remediation'] ?? $sheet['warrantyRemediation'] ?? ''],
        [516, $warranty['contact'] ?? ''],
    ];
    gshop_document_box($pdf, 32, 513.5, 253, 14.5, 'white', 'white', 0, 0);
    foreach ($left as [$baseline, $value]) gshop_pdf_text($pdf, 117, $baseline, $value, 6.6, '', 164);
    foreach ($right as [$baseline, $value]) gshop_pdf_text($pdf, 405, $baseline, $value, 6.4, '', 156);

    // Remove the legacy full-width signature rules before drawing the compact
    // client/stamp areas used by all service documents.
    gshop_document_box($pdf, 34, 110, 527, 140, 'white', 'white', 0, 0);
    gshop_pdf_text($pdf, 36, 237, 'NUME CLIENT', 5.7, 'B', 68, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 104, 233, 234, 233, 'lineDark', .8);
    gshop_document_shrink_text($pdf, 108, 235, gshop_document_client_name($client), 123, 6.8, 5.2, '');
    gshop_pdf_text($pdf, 360, 237, 'DATA ȘI ORA', 5.7, 'B', 57, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 417, 233, 517, 233, 'lineDark', .8);
    gshop_document_shrink_text($pdf, 421, 235, gshop_document_date($document['documentAt'] ?? $warranty['date'] ?? ''), 93, 6.3, 5.0, '');
    gshop_pdf_text($pdf, 36, 208, 'ȘTAMPILĂ', 5.8, 'B', 150, 'L', gshop_document_color('slate'));
    gshop_pdf_text($pdf, 360, 208, 'SEMNĂTURĂ CLIENT', 5.8, 'B', 150, 'L', gshop_document_color('slate'));
    gshop_document_source_line($pdf, 360, 172, 462, 172, 'lineDark', .85);
    gshop_document_place_image($pdf, $stampPath, 35, 106, 90, 90);
    gshop_document_place_image($pdf, $signature['path'] ?? null, 362, 174, 98, 18, $signature);
    gshop_document_footer($pdf, 1, 1, 'G-SHOP | CERTIFICAT GARANȚIE');
}

function gshop_document_add_template(GshopServiceDocumentPdf $pdf, string $template, int $page = 1): void {
    if (!is_file($template)) throw new RuntimeException('Șablonul PDF al documentului nu este disponibil.');
    $count = $pdf->setSourceFile($template);
    if ($page < 1 || $page > $count) throw new RuntimeException('Pagina șablonului PDF nu este disponibilă.');
    $templateId = $pdf->importPage($page);
    $size = $pdf->getTemplateSize($templateId);
    $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
    $pdf->useTemplate($templateId);
}

/** @return array{path:string,fileName:string,filePath:string,sha256:string,generatedAt:string,cached:bool} */
function gshop_document_result(string $output, string $filename, bool $cached): array {
    clearstatcache(true, $output);
    $hash = hash_file('sha256', $output);
    if (!is_string($hash) || $hash === '') throw new RuntimeException('Amprenta PDF nu a putut fi calculată.');
    return [
        'path' => $output,
        'fileName' => $filename,
        'filePath' => 'storage/service-documents/' . $filename,
        'sha256' => $hash,
        'generatedAt' => gmdate('c', filemtime($output) ?: time()),
        'cached' => $cached,
    ];
}

function gshop_document_is_pdf(string $path): bool {
    if (!is_file($path) || (filesize($path) ?: 0) < 1000) return false;
    $handle = @fopen($path, 'rb');
    if (!$handle) return false;
    try { return fread($handle, 5) === '%PDF-'; }
    finally { fclose($handle); }
}

function gshop_document_safe_source(?string $relativePath): ?string {
    $value = gshop_pdf_string($relativePath);
    if ($value === '') return null;
    $apiRoot = realpath(__DIR__ . '/..');
    $candidate = realpath(__DIR__ . '/../' . ltrim($value, '/\\'));
    if ($apiRoot === false || $candidate === false || !is_file($candidate)) return null;
    $prefix = rtrim($apiRoot, '/\\') . DIRECTORY_SEPARATOR;
    if (!str_starts_with($candidate, $prefix)) return null;
    return $value;
}

/**
 * Generate one immutable, client-facing repair document in protected storage.
 *
 * @return array{path:string,fileName:string,filePath:string,sha256:string,generatedAt:string,cached:bool}
 */
function generate_service_document_pdf(
    string $type,
    array $document,
    array $snapshot,
    ?string $signaturePath,
    ?string $stampPath
): array {
    $normalizedType = strtoupper(str_replace('-', '_', trim($type)));
    if (!in_array($normalizedType, ['INTAKE', 'FINAL_ESTIMATE', 'EXIT', 'WARRANTY'], true)) throw new InvalidArgumentException('Tipul documentului PDF nu este valid.');

    $signaturePath = gshop_document_safe_source($signaturePath);
    $stampPath = gshop_document_safe_source($stampPath);

    $templateRoot = __DIR__ . '/../assets/service-document-templates';
    $templates = match ($normalizedType) {
        'INTAKE' => ['intake' => $templateRoot . '/intake.pdf'],
        'FINAL_ESTIMATE' => [
            'intro' => $templateRoot . '/final-estimate-intro.pdf',
            'continuation' => $templateRoot . '/final-estimate-continuation.pdf',
            'agreement' => $templateRoot . '/final-estimate-agreement.pdf',
        ],
        'EXIT' => ['exit' => $templateRoot . '/exit.pdf'],
        'WARRANTY' => ['warranty' => $templateRoot . '/warranty.pdf'],
    };
    foreach ($templates as $template) if (!is_file($template)) throw new RuntimeException('Șablonul PDF al documentului nu este disponibil.');

    $directory = __DIR__ . '/../storage/service-documents';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) throw new RuntimeException('Directorul protejat pentru documente nu poate fi creat.');
    $directoryReal = realpath($directory);
    $storageReal = realpath(__DIR__ . '/../storage');
    if ($directoryReal === false || $storageReal === false || !str_starts_with($directoryReal . DIRECTORY_SEPARATOR, rtrim($storageReal, '/\\') . DIRECTORY_SEPARATOR)) {
        throw new RuntimeException('Calea de stocare a documentului nu este sigură.');
    }

    $templateIdentities = [];
    foreach ($templates as $name => $template) $templateIdentities[$name] = [
        'size' => filesize($template) ?: 0,
        'hash' => hash_file('sha256', $template) ?: '',
    ];
    $fingerprint = hash('sha256', serialize([
        'version' => 33,
        'type' => $normalizedType,
        'document' => $document,
        'snapshot' => $snapshot,
        'signature' => gshop_pdf_source_identity($signaturePath),
        'stamp' => gshop_pdf_source_identity($stampPath),
        'templates' => $templateIdentities,
    ]));
    $identity = gshop_pdf_string($document['id'] ?? $document['number'] ?? 'document');
    $safeIdentity = trim((string)preg_replace('/[^A-Za-z0-9_-]+/', '-', $identity), '-_') ?: 'document';
    $safeType = strtolower(str_replace('_', '-', $normalizedType));
    $stem = strtolower($safeIdentity . '-' . $safeType);
    $filename = $stem . '-' . substr($fingerprint, 0, 16) . '.pdf';
    $output = $directoryReal . DIRECTORY_SEPARATOR . $filename;
    $metadata = $output . '.sha256';

    if (gshop_document_is_pdf($output) && is_file($metadata) && hash_equals($fingerprint, trim((string)file_get_contents($metadata)))) {
        return gshop_document_result($output, $filename, true);
    }

    $lockPath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gshop-service-document-' . hash('sha256', $stem) . '.lock';
    $lock = @fopen($lockPath, 'c');
    if ($lock && !@flock($lock, LOCK_EX)) { @fclose($lock); $lock = null; }
    $signature = null;
    $stamp = null;
    try {
        if (gshop_document_is_pdf($output) && is_file($metadata) && hash_equals($fingerprint, trim((string)file_get_contents($metadata)))) {
            return gshop_document_result($output, $filename, true);
        }
        $signature = gshop_pdf_signature_image($signaturePath);
        $stamp = gshop_pdf_stamp_image($stampPath);
        $temporary = tempnam($directoryReal, '.generating-');
        if ($temporary === false) throw new RuntimeException('Fișierul temporar pentru PDF nu poate fi creat.');
        try {
            $pdf = new GshopServiceDocumentPdf('P', 'pt', 'A4');
            $pdf->SetAutoPageBreak(false);
            $pdf->SetMargins(0, 0, 0);
            $pdf->SetCompression(true);
            $pdf->SetTitle(match ($normalizedType) {
                'INTAKE' => 'Fișă de intrare în service ' . gshop_pdf_string($document['number'] ?? ''),
                'FINAL_ESTIMATE' => 'Deviz final ' . gshop_pdf_string($document['number'] ?? ''),
                'EXIT' => 'Fișă de ieșire din service ' . gshop_pdf_string($document['number'] ?? ''),
                'WARRANTY' => 'Certificat de calitate și garanție ' . gshop_pdf_string($document['number'] ?? ''),
            }, true);
            $pdf->SetAuthor('G-Shop', true);
            $pdf->AddFont('DejaVu', '', 'DejaVuSans.ttf', true);
            $pdf->AddFont('DejaVu', 'B', 'DejaVuSans-Bold.ttf', true);

            if ($normalizedType === 'INTAKE') {
                gshop_document_add_template($pdf, $templates['intake'], 1);
                gshop_document_overlay_intake($pdf, 1, $document, $snapshot, $signature, $stamp);
                gshop_document_add_template($pdf, $templates['intake'], 2);
                gshop_document_overlay_intake($pdf, 2, $document, $snapshot, $signature, $stamp);
            } elseif ($normalizedType === 'FINAL_ESTIMATE') {
                gshop_document_build_final($pdf, $document, $snapshot, $templates, $signature, $stamp);
            } elseif ($normalizedType === 'EXIT') {
                gshop_document_add_template($pdf, $templates['exit']);
                gshop_document_overlay_exit($pdf, $document, $snapshot, $signature, $stamp);
            } else {
                gshop_document_add_template($pdf, $templates['warranty']);
                gshop_document_overlay_warranty($pdf, $document, $snapshot, $signature, $stamp);
            }

            $pdf->Output('F', $temporary, true);
            if (!gshop_document_is_pdf($temporary)) throw new RuntimeException('Documentul PDF nu a putut fi generat.');
            if (is_file($output) && !gshop_document_is_pdf($output)) @unlink($output);
            if (!is_file($output) && !@rename($temporary, $output)) throw new RuntimeException('Documentul PDF nu a putut fi publicat atomic.');
            @chmod($output, 0640);

            $metadataTemporary = tempnam($directoryReal, '.metadata-');
            if ($metadataTemporary === false) throw new RuntimeException('Amprenta documentului nu poate fi salvată.');
            try {
                if (@file_put_contents($metadataTemporary, $fingerprint, LOCK_EX) === false) throw new RuntimeException('Amprenta documentului nu poate fi salvată.');
                if (is_file($metadata)) @unlink($metadata);
                if (!@rename($metadataTemporary, $metadata)) throw new RuntimeException('Amprenta documentului nu poate fi publicată.');
                @chmod($metadata, 0640);
            } finally {
                if (is_file($metadataTemporary)) @unlink($metadataTemporary);
            }
        } finally {
            if (isset($temporary) && is_file($temporary)) @unlink($temporary);
        }
        return gshop_document_result($output, $filename, false);
    } finally {
        foreach ([$signature['path'] ?? null, $stamp] as $temporaryImage) {
            if ($temporaryImage && str_starts_with($temporaryImage, sys_get_temp_dir()) && is_file($temporaryImage)) @unlink($temporaryImage);
        }
        if ($lock) { @flock($lock, LOCK_UN); @fclose($lock); }
    }
}
