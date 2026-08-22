<?php
declare(strict_types=1);

require_once __DIR__ . '/service_document_pdf.php';

use setasign\Fpdi\Tfpdf\Fpdi;

function gshop_sales_pdf_local_date(mixed $value): string {
    $raw = trim((string)($value ?? ''));
    if ($raw === '') return '';
    try {
        $date = new DateTime($raw, new DateTimeZone('UTC'));
        $date->setTimezone(new DateTimeZone('Europe/Bucharest'));
        return $date->format('d.m.Y, H:i');
    } catch (Throwable) { return $raw; }
}

function gshop_sales_pdf_text(Fpdi $pdf, float $x, float $baseline, mixed $value, float $width = 0, float $size = 7.2, string $style = ''): void {
    $text = trim((string)($value ?? ''));
    if ($text === '') return;
    $pdf->SetFont('DejaVu', $style, $size);
    $pdf->SetTextColor(7, 21, 45);
    if ($width > 0) $text = gshop_pdf_fit($pdf, $text, $width);
    $pdf->Text($x, $baseline, $text);
}

function gshop_sales_pdf_shrink_text(Fpdi $pdf, float $x, float $baseline, mixed $value, float $width, float $size = 6.8, float $minimum = 4.0, string $style = 'B'): void {
    $text = trim((string)($value ?? ''));
    if ($text === '') return;
    do { $pdf->SetFont('DejaVu', $style, $size); $size -= 0.2; } while ($size >= $minimum && $pdf->GetStringWidth($text) > $width);
    $pdf->SetTextColor(7, 21, 45);
    $pdf->Text($x, $baseline, $text);
}

function gshop_sales_pdf_multiline(Fpdi $pdf, float $x, float $baseline, float $width, mixed $value, int $maxLines = 3): void {
    $text = preg_replace('/\s+/u', ' ', trim((string)($value ?? ''))) ?? '';
    if ($text === '') return;
    $pdf->SetFont('DejaVu', '', 7.2);
    $words = preg_split('/\s+/u', $text) ?: [];
    $lines = [];$line = '';
    foreach ($words as $word) {
        $candidate = $line === '' ? $word : $line . ' ' . $word;
        if ($pdf->GetStringWidth($candidate) <= $width) { $line = $candidate; continue; }
        if ($line !== '') $lines[] = $line;
        $line = $word;
        if (count($lines) >= $maxLines) break;
    }
    if ($line !== '' && count($lines) < $maxLines) $lines[] = $line;
    foreach (array_slice($lines, 0, $maxLines) as $index => $item) gshop_sales_pdf_text($pdf, $x, $baseline + $index * 16, $item, $width);
}

function gshop_sales_pdf_check(Fpdi $pdf, float $x, float $y): void {
    $pdf->SetFont('DejaVu', 'B', 10);
    $pdf->SetTextColor(7, 92, 255);
    $pdf->Text($x, $y, '✓');
}

function gshop_sales_pdf_status_badge(GshopServiceDocumentPdf $pdf, float $x, float $y, string $status): void {
    $paid=$status==='ACHITAT';$width=$paid?39.0:47.0;$pdf->SetFillColor($paid?225:255,$paid?248:235,$paid?231:238);$pdf->SetDrawColor($paid?225:255,$paid?248:235,$paid?231:238);$pdf->RoundedRect($x,$y,$width,11,5.5,'DF');
    $pdf->SetTextColor($paid?16:205,$paid?145:46,$paid?55:68);$pdf->SetFont('DejaVu','B',4.5);$pdf->Text($x+($width-$pdf->GetStringWidth($status))/2,$y+7.2,$status);
}

function gshop_sales_pdf_card(GshopServiceDocumentPdf $pdf, float $x, float $y, float $width, float $height, array $fill, array $stroke, string $label, string $value, array $valueColor, ?string $status = null): void {
    $pdf->SetFillColor($fill[0], $fill[1], $fill[2]);$pdf->SetDrawColor($stroke[0], $stroke[1], $stroke[2]);$pdf->SetLineWidth(0.7);$pdf->RoundedRect($x,$y,$width,$height,7,'DF');
    $pdf->SetTextColor($valueColor[0],$valueColor[1],$valueColor[2]);$pdf->SetFont('DejaVu','B',5.2);$pdf->Text($x+8,$y+12,$label);
    if($status!==null){$statusWidth=$status==='ACHITAT'?39.0:47.0;gshop_sales_pdf_status_badge($pdf,$x+$width-$statusWidth-7,$y+5,$status);}
    $pdf->SetTextColor($valueColor[0],$valueColor[1],$valueColor[2]);
    $pdf->SetFont('DejaVu','B',9.2);$display=gshop_pdf_fit($pdf,$value,$width-16);$pdf->Text($x+8,$y+29,$display);
}

function gshop_sales_pdf_mini_card(GshopServiceDocumentPdf $pdf, float $x, float $y, float $width, string $label, string $value): void {
    $pdf->SetFillColor(238,243,250);$pdf->SetDrawColor(228,234,243);$pdf->SetLineWidth(0.5);$pdf->RoundedRect($x,$y,$width,23,6,'DF');
    $pdf->SetTextColor(98,113,138);$pdf->SetFont('DejaVu','B',4.5);$pdf->Text($x+6,$y+8,$label);
    $pdf->SetTextColor(7,21,45);$pdf->SetFont('DejaVu','B',6.4);$pdf->Text($x+6,$y+18,gshop_pdf_fit($pdf,$value,$width-12));
}

function gshop_sales_pdf_financial_summary(GshopServiceDocumentPdf $pdf, array $sheet, string $currency): void {
    $total=max(0,(float)($sheet['totalPrice']??0));$paymentStatus=strtoupper(trim((string)($sheet['paymentStatus']??'UNPAID')));$received=max(0,(float)($sheet['receivedAmount']??($paymentStatus==='PAID'?$total:($sheet['advancePaid']??0))));$received=min($received,$total);$remaining=max(0,(float)($sheet['remainingDue']??($total-$received)));$totalPaid=$paymentStatus==='PAID'||$remaining<=.009||($total>0&&$received>=$total-.009);$totalStatus=$totalPaid?'ACHITAT':'NEACHITAT';$restStatus=$remaining<=.009?'ACHITAT':'NEACHITAT';
    $pdf->SetFillColor(255,255,255);$pdf->SetDrawColor(228,234,243);$pdf->SetLineWidth(0.7);$pdf->RoundedRect(22,488,551,80,9,'DF');
    gshop_sales_pdf_card($pdf,29,493,170,38,[7,92,255],[7,92,255],'TOTAL DE PLATĂ',gshop_pdf_money($total,$currency),[255,255,255],$totalStatus);
    gshop_sales_pdf_card($pdf,204,493,170,38,[255,255,255],[20,168,59],'BANI ÎNCASAȚI',gshop_pdf_money($received,$currency),[20,168,59]);
    gshop_sales_pdf_card($pdf,379,493,185,38,[255,255,255],[255,159,10],'REST DE PLATĂ',$remaining<=.009?'ACHITAT':gshop_pdf_money($remaining,$currency),$remaining<=.009?[20,168,59]:[224,117,20],$restStatus);
    gshop_sales_pdf_mini_card($pdf,29,537,130,'PREȚ PRODUS',gshop_pdf_money($sheet['productPrice']??0,$currency));
    gshop_sales_pdf_mini_card($pdf,164,537,120,'LIVRARE',gshop_pdf_money($sheet['deliveryPrice']??0,$currency));
    gshop_sales_pdf_mini_card($pdf,289,537,80,'MONEDĂ',$currency);
    $due=gshop_sales_pdf_local_date($sheet['dueAt']??'');if($due!=='')$due=explode(',',$due)[0];
    gshop_sales_pdf_mini_card($pdf,374,537,190,'SCADENȚĂ',$due!==''?$due:'Fără scadență');
}

function gshop_sales_pdf_image(Fpdi $pdf, ?string $relativePath, float $x, float $y, float $maxWidth, float $maxHeight, bool $signature = false): void {
    $temporary = null;
    $path = null;
    if ($signature) {
        $normalized = gshop_pdf_signature_image($relativePath);
        $path = $normalized['path'] ?? null;
        if ($path && str_starts_with($path, sys_get_temp_dir())) $temporary = $path;
    } else {
        $path = gshop_pdf_stamp_image($relativePath);
        if ($path && str_starts_with($path, sys_get_temp_dir())) $temporary = $path;
    }
    if (!$path || !is_file($path)) return;
    $dimensions = @getimagesize($path);
    if (!$dimensions || empty($dimensions[0]) || empty($dimensions[1])) return;
    $ratio = min($maxWidth / (float)$dimensions[0], $maxHeight / (float)$dimensions[1]);
    $width = (float)$dimensions[0] * $ratio;$height = (float)$dimensions[1] * $ratio;
    $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $imageType = in_array($extension, ['jpg', 'jpeg'], true) ? 'JPEG' : 'PNG';
    $pdf->Image($path, $x, $y + ($maxHeight - $height) / 2, $width, $height, $imageType);
    if ($temporary && is_file($temporary)) @unlink($temporary);
}

function gshop_sales_pdf_file_slug(mixed $value, string $fallback): string {
    $text = trim((string)($value ?? ''));
    if ($text !== '' && function_exists('iconv')) {
        $transliterated = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if (is_string($transliterated) && $transliterated !== '') $text = $transliterated;
    }
    $slug = trim((string)preg_replace('/[^a-zA-Z0-9]+/', '-', $text), '-');
    return $slug !== '' ? substr($slug, 0, 100) : $fallback;
}

function gshop_sales_pdf_file_name(array $sheet): string {
    $client = gshop_sales_pdf_file_slug($sheet['customerName'] ?? '', 'Client');
    $rawNumber = preg_replace('/^FV-?/i', '', trim((string)($sheet['number'] ?? ''))) ?? '';
    if (preg_match('/^(\d{4})-(\d+)$/', $rawNumber, $match)) {
        $number = $match[1] . '-' . str_pad($match[2], 6, '0', STR_PAD_LEFT);
    } else {
        $number = gshop_sales_pdf_file_slug($rawNumber, gmdate('Y') . '-000001');
    }
    return 'FV-' . $client . '-' . $number . '.pdf';
}

/** @return array{filePath:string,url:string,sha256:string,generatedAt:string} */
function generate_sales_sheet_pdf(array $sheet, array $company, ?string $signaturePath, ?string $stampPath): array {
    $template = __DIR__ . '/../assets/sales-sheet-templates/with-company/sales-sheet.pdf';
    if (!is_file($template)) throw new RuntimeException('Șablonul fișei de vânzare nu este disponibil.');
    $directory = __DIR__ . '/../uploads/sales-sheets';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) throw new RuntimeException('Directorul fișelor de vânzări nu poate fi creat.');
    $relativePath = 'uploads/sales-sheets/' . gshop_sales_pdf_file_name($sheet);
    $output = __DIR__ . '/../' . $relativePath;
    $temporary = $output . '.tmp-' . bin2hex(random_bytes(5));
    $currency = strtoupper(trim((string)($sheet['currencyCode'] ?? 'RON'))) ?: 'RON';

    $pdf = new GshopServiceDocumentPdf('P', 'pt', 'A4');
    $pdf->SetAutoPageBreak(false);
    $pdf->AddFont('DejaVu', '', 'DejaVuSans.ttf', true);
    $pdf->AddFont('DejaVu', 'B', 'DejaVuSans-Bold.ttf', true);
    $pdf->setSourceFile($template);
    $templateId = $pdf->importPage(1);
    $size = $pdf->getTemplateSize($templateId);
    $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
    $pdf->useTemplate($templateId);

    $pdf->SetFillColor(255, 255, 255);
    $pdf->Rect(96, 52, 206, 15, 'F');
    $pdf->SetTextColor(7, 92, 255);
    $pdf->SetFont('DejaVu', 'B', 7.2);
    $pdf->Text(98, 61.5, 'Calculatoare Profesionale | G-Shop');

    gshop_sales_pdf_shrink_text($pdf, 398, 61, $sheet['number'] ?? '', 48, 6.4, 4.2);
    gshop_sales_pdf_shrink_text($pdf, 518, 61, gshop_sales_pdf_local_date($sheet['documentAt'] ?? ''), 38, 5.8, 3.8);
    gshop_sales_pdf_shrink_text($pdf, 110, 106, $company['legalName'] ?? '', 96, 6.2, 4.8);
    gshop_sales_pdf_shrink_text($pdf, 245, 106, $company['taxId'] ?? '', 137, 6.5, 4.8);
    gshop_sales_pdf_shrink_text($pdf, 482, 106, $company['tradeRegisterNumber'] ?? '', 72, 6.0, 4.0);
    gshop_sales_pdf_shrink_text($pdf, 56, 125, gshop_pdf_full_address($company), 228, 6.1, 4.5, '');
    gshop_sales_pdf_shrink_text($pdf, 326, 125, $company['phone'] ?? '', 100, 6.2, 4.8, '');
    gshop_sales_pdf_shrink_text($pdf, 460, 125, $company['email'] ?? '', 100, 6.0, 4.3, '');

    gshop_sales_pdf_text($pdf, 121, 200, $sheet['customerName'] ?? '', 219, 7.2, 'B');
    gshop_sales_pdf_text($pdf, 404, 200, $sheet['customerPhone'] ?? '', 158, 7.2);
    gshop_sales_pdf_text($pdf, 76, 223, $sheet['customerEmail'] ?? '', 180, 6.8);
    gshop_sales_pdf_text($pdf, 361, 223, $sheet['deliveryAddress'] ?? '', 200, 6.6);
    gshop_sales_pdf_text($pdf, 120, 244, $sheet['customerNotes'] ?? '', 440, 6.6);

    gshop_sales_pdf_text($pdf, 128, 315, $sheet['productName'] ?? '', 243, 7.3, 'B');
    gshop_sales_pdf_text($pdf, 450, 315, $sheet['productCode'] ?? '', 110, 6.8);
    gshop_sales_pdf_text($pdf, 150, 339, $sheet['serialNumber'] ?? '', 132, 6.6);
    gshop_sales_pdf_text($pdf, 350, 339, rtrim(rtrim(number_format((float)($sheet['quantity'] ?? 1), 2, ',', ''), '0'), ','), 54, 7.2, 'B');
    gshop_sales_pdf_text($pdf, 471, 339, $sheet['warranty'] ?? '', 90, 6.8);

    $payment = (string)($sheet['paymentMethod'] ?? 'CASH');
    gshop_sales_pdf_check($pdf, $payment === 'BANK_TRANSFER' ? 135 : ($payment === 'CARD' ? 255 : 43), 429);
    gshop_sales_pdf_check($pdf, ($sheet['deliveryMode'] ?? 'PICKUP') === 'DELIVERY' ? 393 : 488, 429);

    gshop_sales_pdf_financial_summary($pdf,$sheet,$currency);
    gshop_sales_pdf_multiline($pdf, 36, 646, 523, $sheet['notes'] ?? '', 3);

    $pdf->SetFillColor(255,255,255);$pdf->SetDrawColor(255,255,255);$pdf->Rect(31,697,255,78,'F');
    gshop_sales_pdf_text($pdf, 36, 710, 'ȘTAMPILĂ', 110, 5.8, 'B');
    gshop_sales_pdf_image($pdf, $stampPath, 36, 716, 118, 58, false);
    gshop_sales_pdf_image($pdf, $signaturePath, 310, 716, 130, 42, true);

    $pdf->Output('F', $temporary);
    if (!@rename($temporary, $output)) { @unlink($temporary); throw new RuntimeException('Fișa de vânzare nu a putut fi publicată.'); }
    @chmod($output, 0644);
    $generatedAt = gmdate('c');
    return ['filePath'=>$relativePath,'url'=>public_base_url().'/'.$relativePath.'?v='.rawurlencode($generatedAt),'sha256'=>hash_file('sha256',$output)?:'','generatedAt'=>$generatedAt];
}
