<?php
declare(strict_types=1);

require_once __DIR__ . '/service_document_pdf.php';

use setasign\Fpdi\Tfpdf\Fpdi;

const GSHOP_SALES_DOCUMENT_WIDTH = 595.2756;
const GSHOP_SALES_DOCUMENT_HEIGHT = 841.8898;
const GSHOP_SALES_DOCUMENT_MARGIN = 22.0;
const GSHOP_SALES_DOCUMENT_CONTENT = 551.2756;

function gshop_sales_document_local_date(mixed $value, bool $time = true): string {
    $raw = trim((string)($value ?? ''));
    if ($raw === '') return '';
    try {
        $date = new DateTime($raw, new DateTimeZone('UTC'));
        $date->setTimezone(new DateTimeZone('Europe/Bucharest'));
        return $date->format($time ? 'd.m.Y, H:i' : 'd.m.Y');
    } catch (Throwable) { return $raw; }
}

function gshop_sales_document_set_color(Fpdi $pdf, array $color, string $target = 'text'): void {
    if ($target === 'fill') $pdf->SetFillColor($color[0], $color[1], $color[2]);
    elseif ($target === 'draw') $pdf->SetDrawColor($color[0], $color[1], $color[2]);
    else $pdf->SetTextColor($color[0], $color[1], $color[2]);
}

function gshop_sales_document_card(GshopServiceDocumentPdf $pdf, float $x, float $y, float $width, float $height, array $fill = [255,255,255], array $stroke = [228,234,243], float $radius = 8): void {
    gshop_sales_document_set_color($pdf, $fill, 'fill');
    gshop_sales_document_set_color($pdf, $stroke, 'draw');
    $pdf->SetLineWidth(.7);
    $pdf->RoundedRect($x, $y, $width, $height, $radius, 'DF');
}

function gshop_sales_document_text(Fpdi $pdf, float $x, float $y, mixed $value, float $size = 7, string $style = '', array $color = [7,21,45], float $width = 0): void {
    $text = trim((string)($value ?? ''));
    if ($text === '') return;
    $pdf->SetFont('DejaVu', $style, $size);
    gshop_sales_document_set_color($pdf, $color);
    if ($width > 0) $text = gshop_pdf_fit($pdf, $text, $width);
    $pdf->Text($x, $y, $text);
}

function gshop_sales_document_lines(Fpdi $pdf, mixed $value, float $width, float $size = 7, int $maxLines = 6, string $style = ''): array {
    return gshop_document_wrap($pdf, $value, $width, $size, $style, $maxLines);
}

function gshop_sales_document_paragraph(Fpdi $pdf, float $x, float $y, float $width, mixed $value, float $size = 7, float $lineHeight = 10, int $maxLines = 6, string $style = '', array $color = [7,21,45]): float {
    $lines = gshop_sales_document_lines($pdf, $value, $width, $size, $maxLines, $style);
    foreach ($lines as $index=>$line) gshop_sales_document_text($pdf, $x, $y + $index*$lineHeight, $line, $size, $style, $color, $width);
    return count($lines)*$lineHeight;
}

function gshop_sales_document_header(GshopServiceDocumentPdf $pdf, string $title, array $document, int $page): void {
    gshop_sales_document_card($pdf, 22, 20, 42, 42, [7,92,255], [7,92,255], 12);
    $pdf->SetFont('DejaVu', 'B', 17); $pdf->SetTextColor(255,255,255); $pdf->Text(35, 47, $title === 'Deviz final' ? 'D' : 'G');
    gshop_sales_document_text($pdf, 76, 35, 'Calculatoare Profesionale | G-Shop', 11.5, 'B', [7,92,255], 320);
    gshop_sales_document_text($pdf, 76, 52, $title, 8, 'B', [98,113,138], 300);
    gshop_sales_document_text($pdf, 410, 34, $document['number'] ?? '', 8, 'B', [7,21,45], 160);
    gshop_sales_document_text($pdf, 410, 50, gshop_sales_document_local_date($document['documentAt'] ?? ''), 6.3, '', [98,113,138], 160);
    $pdf->SetDrawColor(228,234,243); $pdf->SetLineWidth(.7); $pdf->Line(22, 74, 573, 74);
    gshop_sales_document_text($pdf, 528, 67, 'PAG. '.$page, 4.8, 'B', [98,113,138], 42);
}

function gshop_sales_document_footer(GshopServiceDocumentPdf $pdf, int $page): void {
    $pdf->SetDrawColor(228,234,243); $pdf->SetLineWidth(.5); $pdf->Line(22, 812, 573, 812);
    gshop_sales_document_text($pdf, 22, 826, 'Calculatoare Profesionale | G-Shop', 5.5, 'B', [7,92,255]);
    gshop_sales_document_text($pdf, 458, 826, 'Document digital · pagina '.$page, 5, '', [98,113,138], 112);
}

function gshop_sales_document_add_page(GshopServiceDocumentPdf $pdf, string $title, array $document, int &$page): void {
    $page++;
    $pdf->AddPage('P', [GSHOP_SALES_DOCUMENT_WIDTH, GSHOP_SALES_DOCUMENT_HEIGHT]);
    gshop_sales_document_header($pdf, $title, $document, $page);
    gshop_sales_document_footer($pdf, $page);
}

function gshop_sales_document_company_client(GshopServiceDocumentPdf $pdf, array $snapshot, float $y): float {
    $company = is_array($snapshot['company'] ?? null) ? $snapshot['company'] : [];
    $sheet = is_array($snapshot['sheet'] ?? null) ? $snapshot['sheet'] : [];
    gshop_sales_document_card($pdf, 22, $y, 270, 79, [247,249,252], [228,234,243]);
    gshop_sales_document_text($pdf, 34, $y+15, 'EMITENT', 5, 'B', [7,92,255]);
    gshop_sales_document_text($pdf, 34, $y+31, $company['legalName'] ?? '', 7.2, 'B', [7,21,45], 244);
    gshop_sales_document_text($pdf, 34, $y+44, trim('CUI '.($company['taxId'] ?? '').' · '.($company['tradeRegisterNumber'] ?? ''), ' ·'), 5.6, '', [98,113,138], 244);
    gshop_sales_document_text($pdf, 34, $y+57, gshop_pdf_full_address($company), 5.5, '', [98,113,138], 244);
    gshop_sales_document_text($pdf, 34, $y+70, implode(' · ', array_values(array_filter([$company['phone']??null,$company['email']??null]))), 5.4, '', [98,113,138], 244);

    gshop_sales_document_card($pdf, 303, $y, 270, 79, [255,255,255], [228,234,243]);
    gshop_sales_document_text($pdf, 315, $y+15, 'CLIENT', 5, 'B', [7,92,255]);
    gshop_sales_document_text($pdf, 315, $y+31, $sheet['customerName'] ?? '', 7.2, 'B', [7,21,45], 244);
    gshop_sales_document_text($pdf, 315, $y+44, implode(' · ', array_values(array_filter([$sheet['customerPhone']??null,$sheet['customerEmail']??null]))), 5.6, '', [98,113,138], 244);
    gshop_sales_document_text($pdf, 315, $y+57, $sheet['deliveryAddress'] ?? 'Ridicare din sediu', 5.5, '', [98,113,138], 244);
    gshop_sales_document_text($pdf, 315, $y+70, 'Fișă sursă: '.($sheet['number'] ?? ''), 5.4, 'B', [98,113,138], 244);
    return $y+91;
}

function gshop_sales_document_product(GshopServiceDocumentPdf $pdf, array $sheet, float $y): float {
    gshop_sales_document_card($pdf, 22, $y, 551, 56, [234,241,255], [204,220,255]);
    gshop_sales_document_text($pdf, 34, $y+15, 'PRODUS / ECHIPAMENT', 5, 'B', [7,92,255]);
    gshop_sales_document_text($pdf, 34, $y+32, $sheet['productName'] ?? '', 7.5, 'B', [7,21,45], 350);
    gshop_sales_document_text($pdf, 34, $y+46, implode(' · ', array_values(array_filter([!empty($sheet['productCode'])?'Cod: '.$sheet['productCode']:null,!empty($sheet['serialNumber'])?'Serie: '.$sheet['serialNumber']:null]))), 5.7, '', [98,113,138], 350);
    gshop_sales_document_text($pdf, 420, $y+23, 'CANTITATE', 4.7, 'B', [98,113,138]);
    gshop_sales_document_text($pdf, 420, $y+40, rtrim(rtrim(number_format((float)($sheet['quantity']??1),2,',',''),'0'),','), 8, 'B', [7,92,255]);
    gshop_sales_document_text($pdf, 494, $y+23, 'GARANȚIE', 4.7, 'B', [98,113,138]);
    gshop_sales_document_text($pdf, 494, $y+40, $sheet['warranty'] ?? '—', 6.2, 'B', [7,21,45], 66);
    return $y+68;
}

function gshop_sales_document_section_title(Fpdi $pdf, float $y, string $number, string $title, string $subtitle = ''): float {
    gshop_sales_document_card($pdf, 22, $y, 24, 24, [7,92,255], [7,92,255], 7);
    gshop_sales_document_text($pdf, 30, $y+16.5, $number, 6.5, 'B', [255,255,255]);
    gshop_sales_document_text($pdf, 55, $y+11, $title, 7.2, 'B', [7,21,45]);
    if ($subtitle !== '') gshop_sales_document_text($pdf, 55, $y+22, $subtitle, 5.2, '', [98,113,138], 500);
    return $y+32;
}

function gshop_sales_document_table_header(GshopServiceDocumentPdf $pdf, float $y, string $title): float {
    gshop_sales_document_text($pdf, 22, $y+9, strtoupper($title), 6.2, 'B', [7,92,255]);
    $y += 16;
    gshop_sales_document_card($pdf, 22, $y, 551, 21, [7,21,45], [7,21,45], 5);
    foreach ([['Denumire',32],['Cant.',342],['Preț / unit.',397],['Total',486]] as [$label,$x]) gshop_sales_document_text($pdf, $x, $y+14, $label, 5.3, 'B', [255,255,255]);
    return $y+21;
}

function gshop_sales_document_table_row(GshopServiceDocumentPdf $pdf, float $y, array $item, string $currency, bool $alternate): float {
    $lines = gshop_sales_document_lines($pdf, $item['name'] ?? '', 292, 6.2, 3);
    $height = max(24, 12 + count($lines)*9);
    gshop_sales_document_card($pdf, 22, $y, 551, $height, $alternate ? [247,249,252] : [255,255,255], [228,234,243], 0);
    foreach ($lines as $index=>$line) gshop_sales_document_text($pdf, 32, $y+15+$index*9, $line, 6.2, $index===0?'B':'', [7,21,45], 292);
    $quantity = rtrim(rtrim(number_format((float)($item['quantity']??1),2,',',''),'0'),',');
    gshop_sales_document_text($pdf, 342, $y+16, $quantity, 6.2, 'B', [7,21,45], 45);
    gshop_sales_document_text($pdf, 397, $y+16, gshop_pdf_money($item['unitPrice']??0,$currency), 5.6, '', [98,113,138], 78);
    gshop_sales_document_text($pdf, 486, $y+16, gshop_pdf_money($item['totalPrice']??0,$currency), 6, 'B', [7,92,255], 76);
    return $y+$height;
}

function gshop_sales_document_financial(GshopServiceDocumentPdf $pdf, array $summary, float $y): float {
    $currency = strtoupper((string)($summary['currencyCode'] ?? 'RON'));
    $total = max(0,(float)($summary['totalPrice']??0)); $received = max(0,(float)($summary['receivedAmount']??0)); $remaining = max(0,(float)($summary['remainingDue']??0));
    gshop_sales_document_card($pdf, 22, $y, 551, 91, [255,255,255], [228,234,243]);
    $cards = [
        [29,170,[7,92,255],[7,92,255],'TOTAL DEVIZ',gshop_pdf_money($total,$currency),[255,255,255]],
        [204,170,[255,255,255],[20,168,59],'BANI ÎNCASAȚI',gshop_pdf_money($received,$currency),[20,168,59]],
        [379,185,[255,255,255],[255,159,10],'BANI DE ÎNCASAT',$remaining<=.009?'ACHITAT':gshop_pdf_money($remaining,$currency),$remaining<=.009?[20,168,59]:[224,117,20]],
    ];
    foreach ($cards as [$x,$width,$fill,$stroke,$label,$value,$color]) {
        gshop_sales_document_card($pdf,$x,$y+7,$width,39,$fill,$stroke,7);
        gshop_sales_document_text($pdf,$x+8,$y+19,$label,4.8,'B',$color,$width-16);
        gshop_sales_document_text($pdf,$x+8,$y+37,$value,8.2,'B',$color,$width-16);
    }
    $mini = [
        ['PIESE / PRODUSE',gshop_pdf_money($summary['partsTotal']??0,$currency),29,155],
        ['SERVICII',gshop_pdf_money($summary['laborTotal']??0,$currency),189,130],
        ['MONEDĂ',$currency,324,90],
        ['SCADENȚĂ',gshop_sales_document_local_date($summary['dueAt']??'',false)?:'Fără scadență',419,145],
    ];
    foreach ($mini as [$label,$value,$x,$width]) { gshop_sales_document_card($pdf,$x,$y+52,$width,31,[247,249,252],[228,234,243],6); gshop_sales_document_text($pdf,$x+7,$y+63,$label,4.2,'B',[98,113,138],$width-14); gshop_sales_document_text($pdf,$x+7,$y+76,$value,5.8,'B',[7,21,45],$width-14); }
    return $y+103;
}

function gshop_sales_document_image(Fpdi $pdf, ?string $relativePath, float $x, float $y, float $maxWidth, float $maxHeight, bool $signature): void {
    $temporary = null;
    if ($signature) { $normalized = gshop_pdf_signature_image($relativePath); $path = $normalized['path'] ?? null; }
    else { $path = gshop_pdf_stamp_image($relativePath); }
    if (!$path || !is_file($path)) return;
    if (str_starts_with($path, sys_get_temp_dir())) $temporary = $path;
    $size = @getimagesize($path); if (!$size || !$size[0] || !$size[1]) return;
    $ratio = min($maxWidth/(float)$size[0],$maxHeight/(float)$size[1]); $width=(float)$size[0]*$ratio; $height=(float)$size[1]*$ratio;
    $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION)); $pdf->Image($path,$x+($maxWidth-$width)/2,$y+($maxHeight-$height)/2,$width,$height,in_array($extension,['jpg','jpeg'],true)?'JPEG':'PNG');
    if ($temporary && is_file($temporary)) @unlink($temporary);
}

function gshop_sales_document_signatures(GshopServiceDocumentPdf $pdf, array $snapshot, ?string $signaturePath, ?string $stampPath, float $y): float {
    $sheet = is_array($snapshot['sheet']??null)?$snapshot['sheet']:[];
    gshop_sales_document_card($pdf,22,$y,270,75,[247,249,252],[228,234,243]);
    gshop_sales_document_text($pdf,34,$y+14,'EMITENT · ȘTAMPILĂ',4.8,'B',[98,113,138]);
    gshop_sales_document_image($pdf,$stampPath,34,$y+18,110,48,false);
    gshop_sales_document_card($pdf,303,$y,270,75,[247,249,252],[228,234,243]);
    gshop_sales_document_text($pdf,315,$y+14,'CLIENT · SEMNĂTURĂ',4.8,'B',[98,113,138]);
    gshop_sales_document_text($pdf,410,$y+14,$sheet['customerName']??'',5.2,'B',[7,21,45],150);
    gshop_sales_document_image($pdf,$signaturePath,315,$y+20,150,44,true);
    gshop_sales_document_text($pdf,471,$y+64,!empty($sheet['signedAt'])?gshop_sales_document_local_date($sheet['signedAt']):'Nesemnat',4.8,'',[98,113,138],89);
    return $y+87;
}

function gshop_sales_document_build_final(GshopServiceDocumentPdf $pdf, array $document, array $snapshot, ?string $signaturePath, ?string $stampPath): void {
    $page = 0; gshop_sales_document_add_page($pdf,'Deviz final',$document,$page);
    $sheet = is_array($snapshot['sheet']??null)?$snapshot['sheet']:[]; $summary=is_array($snapshot['summary']??null)?$snapshot['summary']:[]; $currency=(string)($summary['currencyCode']??'RON');
    $y = gshop_sales_document_company_client($pdf,$snapshot,88); $y = gshop_sales_document_product($pdf,$sheet,$y);
    $y = gshop_sales_document_section_title($pdf,$y,'1','Constatare și obiectul devizului','Date preluate și completate la emiterea documentului');
    gshop_sales_document_card($pdf,22,$y,551,58,[255,255,255],[228,234,243]);
    gshop_sales_document_text($pdf,34,$y+14,'CONSTATARE / DESCRIERE',4.8,'B',[98,113,138]);
    gshop_sales_document_paragraph($pdf,34,$y+29,525,$snapshot['sheet']['technicalAssessment']??'',6.2,9,3);
    $y += 70; $y = gshop_sales_document_section_title($pdf,$y,'2','Desfășurător final','Pozițiile și valorile prezentate clientului');
    $sections = [['Piese / produse',$snapshot['parts']??[]],['Manoperă / servicii',$snapshot['labor']??[]]];
    foreach ($sections as [$label,$items]) {
        if (!$items) continue;
        if ($y > 705) { gshop_sales_document_add_page($pdf,'Deviz final',$document,$page); $y=91; }
        $y = gshop_sales_document_table_header($pdf,$y,$label);
        foreach ($items as $index=>$item) {
            $lines = gshop_sales_document_lines($pdf,$item['name']??'',292,6.2,3); $height=max(24,12+count($lines)*9);
            if ($y+$height > 790) { gshop_sales_document_add_page($pdf,'Deviz final',$document,$page); $y=gshop_sales_document_table_header($pdf,91,$label.' · continuare'); }
            $y = gshop_sales_document_table_row($pdf,$y,$item,$currency,$index%2===1);
        }
        $y += 10;
    }
    if ($y+266 > 800) { gshop_sales_document_add_page($pdf,'Deviz final',$document,$page); $y=91; }
    $y = gshop_sales_document_section_title($pdf,$y,'3','Situația financiară','Același stil și aceleași repere ca în fișa de vânzare');
    $y = gshop_sales_document_financial($pdf,$summary,$y);
    gshop_sales_document_card($pdf,22,$y,551,54,[247,249,252],[228,234,243]);
    $accepted = strtoupper((string)($snapshot['agreement']['status']??'ACCEPTED'))==='ACCEPTED';
    gshop_sales_document_text($pdf,34,$y+15,'ACORD FINAL CLIENT',4.8,'B',[98,113,138]);
    gshop_sales_document_text($pdf,34,$y+34,$accepted?'ACCEPTAT':'REFUZAT',8,'B',$accepted?[20,168,59]:[205,45,45]);
    gshop_sales_document_text($pdf,150,$y+34,'Data acordului: '.gshop_sales_document_local_date($document['agreementAt']??''),6.2,'B',[7,21,45],220);
    gshop_sales_document_text($pdf,378,$y+15,'OBSERVAȚII FINALE',4.8,'B',[98,113,138]);
    gshop_sales_document_paragraph($pdf,378,$y+29,181,$snapshot['sheet']['finalNotes']??'',5.5,8,3);
    $y += 66; gshop_sales_document_signatures($pdf,$snapshot,$signaturePath,$stampPath,$y);
}

function gshop_sales_document_build_warranty(GshopServiceDocumentPdf $pdf, array $document, array $snapshot, ?string $signaturePath, ?string $stampPath): void {
    $page=0; gshop_sales_document_add_page($pdf,'Certificat de garanție',$document,$page);
    $sheet=is_array($snapshot['sheet']??null)?$snapshot['sheet']:[]; $warranty=is_array($snapshot['warranty']??null)?$snapshot['warranty']:[]; $summary=is_array($snapshot['summary']??null)?$snapshot['summary']:[];
    $y=gshop_sales_document_company_client($pdf,$snapshot,88); $y=gshop_sales_document_product($pdf,$sheet,$y);
    $y=gshop_sales_document_section_title($pdf,$y,'1','Garanția acordată','Perioada este calculată și afișată explicit');
    gshop_sales_document_card($pdf,22,$y,551,76,[234,241,255],[204,220,255]);
    gshop_sales_document_text($pdf,34,$y+16,'PERIOADĂ',4.8,'B',[7,92,255]); gshop_sales_document_text($pdf,34,$y+39,$warranty['period']??'',12,'B',[7,92,255],150);
    gshop_sales_document_text($pdf,203,$y+16,'DE LA',4.8,'B',[98,113,138]); gshop_sales_document_text($pdf,203,$y+39,gshop_sales_document_local_date($warranty['startAt']??'',false),8,'B',[7,21,45],120);
    gshop_sales_document_text($pdf,337,$y+16,'PÂNĂ LA',4.8,'B',[98,113,138]); gshop_sales_document_text($pdf,337,$y+39,gshop_sales_document_local_date($warranty['endAt']??'',false),8,'B',[7,21,45],120);
    gshop_sales_document_text($pdf,471,$y+16,'REMEDIERE',4.8,'B',[98,113,138]); gshop_sales_document_text($pdf,471,$y+39,$warranty['remediation']??'10 zile lucrătoare',6,'B',[7,21,45],88);
    $y+=88; $y=gshop_sales_document_section_title($pdf,$y,'2','Referința comercială','Devizul și situația financiară asociată');
    gshop_sales_document_card($pdf,22,$y,551,38,[247,249,252],[228,234,243]);
    gshop_sales_document_text($pdf,34,$y+15,'DEVIZ FINAL',4.8,'B',[98,113,138]); gshop_sales_document_text($pdf,34,$y+29,$snapshot['estimate']['number']??'',6.8,'B',[7,21,45],155);
    gshop_sales_document_text($pdf,230,$y+15,'DATA DEVIZULUI',4.8,'B',[98,113,138]); gshop_sales_document_text($pdf,230,$y+29,gshop_sales_document_local_date($snapshot['estimate']['date']??'',false),6.4,'B',[7,21,45],120);
    gshop_sales_document_text($pdf,420,$y+15,'SERIE PRODUS',4.8,'B',[98,113,138]); gshop_sales_document_text($pdf,420,$y+29,$sheet['serialNumber']??'—',6.4,'B',[7,21,45],140);
    $y+=50; $y=gshop_sales_document_financial($pdf,$summary,$y);
    $y=gshop_sales_document_section_title($pdf,$y,'3','Condiții esențiale','Informații scurte și ușor de verificat');
    gshop_sales_document_card($pdf,22,$y,551,76,[247,249,252],[228,234,243]);
    $conditions=['Garanția se aplică produsului și seriei indicate în acest certificat.','Remedierea se face în termenul menționat, după verificarea produsului.','Garanția nu acoperă șocuri, lichide, intervenții neautorizate sau utilizare necorespunzătoare.','Clientul prezintă certificatul și documentul de achiziție la solicitarea garanției.'];
    foreach ($conditions as $index=>$condition) { gshop_sales_document_card($pdf,34,$y+10+$index*15,12,12,[7,92,255],[7,92,255],4); gshop_sales_document_text($pdf,38.2,$y+19+$index*15,(string)($index+1),4.5,'B',[255,255,255]); gshop_sales_document_text($pdf,53,$y+19+$index*15,$condition,5.4,'',[7,21,45],505); }
    $y+=88; gshop_sales_document_signatures($pdf,$snapshot,$signaturePath,$stampPath,$y);
}

function gshop_sales_document_file_name(string $type, array $snapshot): string {
    $sheet=is_array($snapshot['sheet']??null)?$snapshot['sheet']:[];
    $client=gshop_sales_document_slug($sheet['customerName']??'','Client');
    $number=sales_document_number('',(string)($sheet['number']??'')); $number=ltrim($number,'-');
    return sales_document_definitions()[$type]['filePrefix'].'-'.$client.'-'.$number.'.pdf';
}

function gshop_sales_document_slug(mixed $value, string $fallback): string {
    $text=trim((string)($value??''));
    if($text!==''&&function_exists('iconv')){$ascii=@iconv('UTF-8','ASCII//TRANSLIT//IGNORE',$text);if(is_string($ascii)&&$ascii!=='')$text=$ascii;}
    $slug=trim((string)preg_replace('/[^a-zA-Z0-9]+/','-',$text),'-');
    return$slug!==''?substr($slug,0,100):$fallback;
}

/** @return array{filePath:string,url:string,sha256:string,generatedAt:string} */
function generate_sales_document_pdf(string $type, array $document, array $snapshot, ?string $signaturePath, ?string $stampPath): array {
    $type=validated_sales_document_type($type);
    $directory=__DIR__.'/../uploads/sales-documents';
    if(!is_dir($directory)&&!mkdir($directory,0755,true)&&!is_dir($directory))throw new RuntimeException('Directorul documentelor Shop nu poate fi creat.');
    $relativePath='uploads/sales-documents/'.gshop_sales_document_file_name($type,$snapshot); $output=__DIR__.'/../'.$relativePath; $temporary=$output.'.tmp-'.bin2hex(random_bytes(5));
    $pdf=new GshopServiceDocumentPdf('P','pt','A4'); $pdf->SetAutoPageBreak(false); $pdf->AddFont('DejaVu','','DejaVuSans.ttf',true); $pdf->AddFont('DejaVu','B','DejaVuSans-Bold.ttf',true);
    $pdf->SetTitle(($type==='FINAL_ESTIMATE'?'Deviz final ':'Certificat de garanție ').($document['number']??'')); $pdf->SetAuthor('Calculatoare Profesionale | G-Shop');
    if($type==='FINAL_ESTIMATE')gshop_sales_document_build_final($pdf,$document,$snapshot,$signaturePath,$stampPath);else gshop_sales_document_build_warranty($pdf,$document,$snapshot,$signaturePath,$stampPath);
    $pdf->Output('F',$temporary); if(!@rename($temporary,$output)){@unlink($temporary);throw new RuntimeException('Documentul Shop nu a putut fi publicat.');}@chmod($output,0644);
    $generatedAt=gmdate('c'); return['filePath'=>$relativePath,'url'=>public_base_url().'/'.$relativePath.'?v='.rawurlencode($generatedAt),'sha256'=>hash_file('sha256',$output)?:'','generatedAt'=>$generatedAt];
}
