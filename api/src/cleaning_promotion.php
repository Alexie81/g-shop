<?php
declare(strict_types=1);

const CLEANING_CARD_IMAGE = __DIR__.'/../assets/cleaning/business-card.png';
const CLEANING_CARD_WEBSITE = 'https://curatatorie-canapele.ro';
const CLEANING_CARD_WHATSAPP = 'https://wa.me/40726049278?text=Bun%C4%83%20ziua!%20Doresc%20o%20ofert%C4%83%20pentru%20cur%C4%83%C8%9Bare.';

function cleaning_promotion_links(): array {
    $base=CLEANING_CARD_WEBSITE.'/app-api';
    return ['imageUrl'=>$base.'/assets/cleaning/business-card.png?v='.substr(hash_file('sha256',CLEANING_CARD_IMAGE),0,16),
        'pageUrl'=>$base.'/cleaning-business-card.php','pdfUrl'=>$base.'/index.php/public/cleaning-business-card.pdf'];
}

/** The same approved artwork and clickable areas are used in every PDF. */
function cleaning_append_business_card(GshopServiceDocumentPdf $pdf): void {
    $size=getimagesize(CLEANING_CARD_IMAGE);
    if(!$size)throw new RuntimeException('Cartea de vizită nu este disponibilă.');
    $pdf->AddPage('P','A4');
    $scale=min($pdf->GetPageWidth()/$size[0],$pdf->GetPageHeight()/$size[1]);
    $width=$size[0]*$scale;$height=$size[1]*$scale;
    $x=($pdf->GetPageWidth()-$width)/2;$y=($pdf->GetPageHeight()-$height)/2;
    $pdf->Image(CLEANING_CARD_IMAGE,$x,$y,$width,$height,'PNG');
    foreach([
        [.06,.305,.61,.06,CLEANING_CARD_WEBSITE],
        [.12,.902,.43,.047,'tel:+40726049278'],
        [.665,.895,.295,.052,CLEANING_CARD_WHATSAPP],
        [.065,.958,.39,.034,CLEANING_CARD_WEBSITE],
        [.505,.958,.465,.034,'mailto:contact@curatatorie-canapele.ro'],
    ]as[$left,$top,$w,$h,$url])$pdf->Link($x+$width*$left,$y+$height*$top,$width*$w,$height*$h,$url);
}

/** Render intake/exit snapshots refreshed by the caller, then append one advert.
 * Sharing never changes canonical finances, document numbers, dates or signatures.
 * The dossier is streamed, so deleted documents cannot survive in a public cache.
 */
function cleaning_package_pdf(array $entries=[],?string $signaturePath=null): string {
    require_once __DIR__.'/service_document_pdf.php';
    require_once __DIR__.'/cleaning_document_pdf.php';
    $pdf=new GshopServiceDocumentPdf('P','pt','A4');
    $pdf->SetAutoPageBreak(false);$pdf->SetMargins(0,0,0);$pdf->SetCompression(true);
    $pdf->SetTitle($entries?'Dosarul comenzii - Curatatorie Canapele':'Carte de vizită - Curatatorie Canapele',true);
    $pdf->SetAuthor('Curatatorie Canapele',true);
    $signature=null;
    try {
        if($entries){
            $pdf->AddFont('DejaVu','','DejaVuSans.ttf',true);$pdf->AddFont('DejaVu','B','DejaVuSans-Bold.ttf',true);
            $signature=gshop_pdf_signature_image(gshop_document_safe_source($signaturePath));
            foreach($entries as$entry){
                if(!in_array($entry['type'],['INTAKE','EXIT'],true)||!is_array($entry['snapshot']['cleaning']??null))throw new RuntimeException('Documentul nu aparține unei comenzi de curățare.');
                gshop_cleaning_render($pdf,$entry['type'],$entry['document'],$entry['snapshot'],$signature);
            }
        }
        cleaning_append_business_card($pdf);
        return $pdf->Output('S');
    } finally {
        if(!empty($signature['path'])&&str_starts_with($signature['path'],sys_get_temp_dir())&&is_file($signature['path']))unlink($signature['path']);
    }
}

function cleaning_stream_pdf(string $bytes,string $name): never {
    header('Content-Type: application/pdf');header('Content-Disposition: inline; filename="'.$name.'"');
    header('Cache-Control: private, no-store, no-cache, must-revalidate');header('X-Content-Type-Options: nosniff');
    header('Content-Length: '.strlen($bytes));echo $bytes;exit;
}

function cleaning_dossier_url(string $token,string $sheetId): string {
    return public_base_url().'/index.php/public/client-form/'.rawurlencode($token).'/dossier/'.rawurlencode($sheetId);
}

function cleaning_public_dossier(string $token,string $sheetId): never {
    $uuid='/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i';
    if(!preg_match($uuid,$token)||!preg_match($uuid,$sheetId))fail('Dosarul nu este disponibil.',404);
    $stmt=db()->prepare('SELECT '.uuid_sql('s.id').' id,'.uuid_sql('s.property_id').' property_id FROM service_sheets s JOIN clients c ON c.id=s.client_id AND c.property_id=s.property_id AND c.is_active=1 JOIN client_qr q ON q.client_id=s.client_id AND q.property_id=s.property_id AND q.is_active=1 WHERE q.token=? AND s.id=? AND s.is_active=1 LIMIT 1');
    $stmt->execute([uuid_bin($token),uuid_bin($sheetId)]);$sheet=$stmt->fetch();
    if(!$sheet||!is_cleaning_property($sheet['property_id']))fail('Dosarul nu este disponibil.',404);
    ensure_service_documents_table(db());$stmt=db()->prepare(service_document_select()." WHERE d.service_sheet_id=? AND d.property_id=? AND d.type IN ('INTAKE','EXIT') AND d.status='PUBLISHED' AND d.is_active=1 ORDER BY FIELD(d.type,'INTAKE','EXIT')");
    $stmt->execute([uuid_bin($sheetId),uuid_bin($sheet['property_id'])]);$rows=$stmt->fetchAll();
    if(count($rows)!==2)fail('Generează fișa de intrare și fișa de ieșire înainte de trimiterea dosarului complet.',404);
    $entries=[];$fileChanges=[];$pdo=db();$pdo->beginTransaction();
    try{
        // Both documents must use the same financial revision during concurrent saves.
        $pdo->prepare('SELECT id FROM clients WHERE id=? FOR UPDATE')->execute([uuid_bin((string)$rows[0]['client_id'])]);
        foreach($rows as$row){
            $previousPath=$row['file_path'];
            $row=refresh_cleaning_document_row($row);
            if($previousPath!==$row['file_path'])$fileChanges[]=[$previousPath,$row['file_path']];
            $snapshot=json_decode((string)$row['snapshot_json'],true);
            if(!is_array($snapshot['cleaning']??null))throw new RuntimeException('Dosarul nu este disponibil.');
            $entries[]=['type'=>$row['type'],'snapshot'=>$snapshot,'document'=>['id'=>$row['id'],'number'=>$row['number'],'documentAt'=>iso_date($row['document_at']),'agreementAt'=>iso_date($row['agreement_at'])]];
        }
        $pdo->commit();
    }catch(Throwable$error){if($pdo->inTransaction())$pdo->rollBack();foreach($fileChanges as[$old,$new])remove_obsolete_service_document_file($new,$old);throw$error;}
    foreach($fileChanges as[$old,$new])remove_obsolete_service_document_file($old,$new);
    cleaning_stream_pdf(cleaning_package_pdf($entries,service_document_signature_path($sheetId)),'dosar-comanda-'.$sheetId.'.pdf');
}
